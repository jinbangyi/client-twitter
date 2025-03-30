import { Injectable, Logger } from '@nestjs/common';
import { type IAgentRuntime } from '@elizaos/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TwitterClient, TwitterClientStatus } from '@elizaos/client-twitter';
import _ from 'lodash';

import { TasksService } from '../tasks/tasks.service.js';
import { taskTimeout, workerUuid } from '../constant.js';
import { TaskEvent, TaskEventName } from '../tasks/interfaces/task.interface.js';
import { Task, TaskActionName, TaskStatusName } from '../tasks/schemas/task.schema.js';
import { SHARED_SERVICE } from '../shared/shared.service.js';

async function randomDelay() {
  // 10s
  const randomDelay = Math.floor(Math.random() * 1000 * 10);

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, randomDelay);
  });
}

export function CatchCronError(cronTime: string) {
  const logger = new Logger('CronDecorator');

  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        // add random delay to avoid all cron job run at the same time
        await randomDelay();
        await originalMethod.apply(this, args);
      } catch (error) {
        logger.error(`Error in cron job "${propertyName}": ${error}`);
        throw error;
      }
    };

    return Cron(cronTime)(target, propertyName, descriptor);
  };
}

@Injectable()
export class WatcherService {
  private readonly logger = new Logger(`${WatcherService.name}_${workerUuid}`);
  private sharedService = SHARED_SERVICE;

  constructor(
    private readonly tasksService: TasksService,
    private eventEmitter: EventEmitter2
  ) {}

  get tasks(): Map<string, Task> {
    return this.sharedService.tasks;
  }

  get taskRuntime(): Map<string, IAgentRuntime> {
    return this.sharedService.taskRuntime;
  }

  // update local task status return task and runtime
  private updateLocalTask(taskTitle: string) {
    const task = this.tasks.get(taskTitle);
    if (!task) {
      this.logger.warn(`task ${taskTitle} not found`);
      return;
    }

    const runtime = this.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.warn(`task ${task.title} runtime not found`);
      return;
    }

    const status = TwitterClient.getStatus(runtime);
    if (status === TwitterClientStatus.RUNNING) {
      task.status = TaskStatusName.RUNNING;
    } else if (status === TwitterClientStatus.STOPPED) {
      task.status = TaskStatusName.STOPPED;
    } else if (status === TwitterClientStatus.ERROR) {
      task.status = TaskStatusName.STOPPED;
    } else if (status === TwitterClientStatus.STOPPING) {
      task.status = TaskStatusName.RUNNING;
    } else {
      this.logger.error(`unknown status ${status}`);
    }

    return { task, runtime };
  }

  private stopTask(task: Task, runtime: IAgentRuntime) {
    this.eventEmitter.emit(
      TaskEventName.TASK_STOP,
      new TaskEvent({
        task,
        runtime,
        message: `Task ${task.title} stopped`,
      }),
    );
    // TODO, what if stop failed
    this.tasks.delete(task.title);
    this.taskRuntime.delete(task.title);
  }

  @CatchCronError(CronExpression.EVERY_MINUTE)
  // @CatchCronError(CronExpression.EVERY_10_SECONDS)
  async getNewTasks() {
    this.logger.debug(`start getNewTasks`);

    const tasks = await this.tasksService.getNewTasks();
    for (const task of tasks) {
      if (this.tasks.has(task.title)) {
        this.logger.warn(`task ${task.title} already in local tasks`);
        continue;
      }

      if (!this.taskRuntime.has(task.title)) {
        this.logger.error(`task ${task.title} runtime not found`);
        continue;
      }

      if (
        task.status === TaskStatusName.STOPPED || 
        task.updatedAt.getTime() + taskTimeout < Date.now()
      ) {
        // start the task
        this.eventEmitter.emit(
          TaskEventName.TASK_CREATED,
          new TaskEvent({
            task,
            runtime: this.taskRuntime.get(task.title)!,
            message: `Task ${task.id} created`,
          }),
        );
        // set tasks
        this.tasks.set(task.title, task);
      } else {
        this.logger.warn(`task ${task.title} is processed by other worker`);
      }
    }

    this.logger.debug(`end getNewTasks ${tasks.length}`);
  }

  // TODO add action when a twitter client is tagged suspended
  @CatchCronError(CronExpression.EVERY_MINUTE)
  // @CatchCronError(CronExpression.EVERY_10_SECONDS)
  async checkTaskActionOrConfigurationChanged() {
    const prefix = 'checkTaskActionOrConfigurationChanged';
    this.logger.debug(`${prefix} start`);

    const tasks = await this.tasksService.getTaskByTitles(Array.from(this.tasks.keys()));
    for (const task of tasks) {
      const localTask = this.updateLocalTask(task.title);
      if (!localTask) {
        this.logger.error(`localTask ${task.title} not found`);
        continue;
      }

      // if action changed
      if (task.action !== this.tasks.get(task.title)!.action) {
        // the local task do not maintain stopped task, so ignore the task.action=start

        if (task.action === TaskActionName.STOP) {
          this.logger.debug(`${prefix} stop task`);
          this.stopTask(task, localTask.runtime);
        } else if (task.action === TaskActionName.RESTART) {
          // restart the task
          this.logger.debug(`${prefix} restart task`);
          this.eventEmitter.emit(
            TaskEventName.TASK_RESTART,
            new TaskEvent({
              task,
              runtime: localTask.runtime,
              message: `Task ${task.id} restarted`,
            }),
          );
          this.tasks.set(task.title, task);
        } else {
          this.logger.error(`unknown action ${task.action}`);
        }
      } else if (
        // configuration changed
        !_.isEqual(task.configuration, this.tasks.get(task.title)!.configuration)
      ) {
        // restart the task
        this.logger.debug(`${prefix} configuration changed.`);
        if (task.configuration.TWITTER_USERNAME) {
          this.eventEmitter.emit(
            TaskEventName.TASK_RESTART,
            new TaskEvent({
              task,
              runtime: localTask.runtime,
              message: `Task ${task.id} restarted`,
            }),
          );
          this.tasks.set(task.title, task);
        } else {
          // if twitter username is not set, stop the task
          this.eventEmitter.emit(
            TaskEventName.TASK_STOP,
            new TaskEvent({
              task,
              runtime: localTask.runtime,
              message: `Task ${task.id} stopped`,
            }),
          );
        }
      } else {
        if (task.pauseUntil && task.pauseUntil > new Date()) {
          this.logger.debug(`${prefix} task ${task.title} is paused`);
          this.stopTask(task, localTask.runtime);
        } else {
          // update task update time
          await this.tasksService.updateByTitle(task.title, { createdBy: workerUuid });
        }
      }
    }

    this.logger.debug(`${prefix} end, ${this.tasks.size}`);
  }

  @CatchCronError(CronExpression.EVERY_30_SECONDS)
  // @CatchCronError(CronExpression.EVERY_10_SECONDS)
  async checkLocalTasksStatus() {
    this.logger.debug(`start checkLocalTasksStatus`);

    for (const task of this.tasks) {
      const localTask = this.updateLocalTask(task[0]);
      if (!localTask) {
        this.logger.error(`localTask ${task[0]} not found`);
        continue;
      }

      if (localTask.task.action === TaskActionName.START && localTask.task.status !== TaskStatusName.RUNNING) {
        // start the task
        const ret = this.eventEmitter.emit(
          TaskEventName.TASK_START,
          new TaskEvent({
            task: localTask.task,
            runtime: localTask.runtime,
            message: `Task ${localTask.task.id} started`,
          }),
        );
        this.logger.debug(`task ${localTask.task.title} started, ${ret}`);
      } else if (localTask.task.action === TaskActionName.STOP && localTask.task.status !== TaskStatusName.STOPPED) {
        // stop the task
        this.eventEmitter.emit(
          TaskEventName.TASK_STOP,
          new TaskEvent({
            task: localTask.task,
            runtime: localTask.runtime,
            message: `Task ${localTask.task.id} stopped`,
          }),
        );
        this.logger.debug(`task ${localTask.task.title} stopped`);
      } else if (localTask.task.action === TaskActionName.RESTART && localTask.task.status !== TaskStatusName.RESTARTED) {
        // restar the task
        this.eventEmitter.emit(
          TaskEventName.TASK_RESTART,
          new TaskEvent({
            task: localTask.task,
            runtime: localTask.runtime,
            message: `Task ${localTask.task.id} restarted`,
          }),
        );
        this.logger.debug(`task ${localTask.task.title} restarted`);
      } else {
        this.logger.debug(`task ${localTask.task.title} status is expected`);
      }
    }

    this.logger.debug(`end checkLocalTasksStatus ${this.tasks.size}`);
  }
}
