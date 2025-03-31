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
  ) { }

  get tasks(): Map<string, Task> {
    return this.sharedService.tasks;
  }

  get taskRuntime(): Map<string, IAgentRuntime> {
    return this.sharedService.taskRuntime;
  }

  // update local task status return task and runtime
  private updateLocalTask(taskTitle: string) {
    const prefix = 'updateLocalTask';

    const task = this.tasks.get(taskTitle);
    if (!task) {
      this.logger.warn(`${prefix} ${taskTitle} not found`);
      return;
    }

    const runtime = this.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.warn(`${prefix} ${task.title} runtime not found`);
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
      this.logger.error(`${prefix} unknown status ${status}`);
    }

    return { task, runtime };
  }

  stopTask(task: Task, options: { clear: boolean } = { clear: true }) {
    const prefix = 'stopTask';
    this.logger.debug(`${prefix} ${task.title}`);

    const runtime = this.sharedService.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.error(`${prefix} ${task.title} runtime not found`);
      return;
    }

    TaskEvent.createTaskStopEvent(
      this.eventEmitter,
      task,
      runtime,
    );

    if (options.clear) {
      // TODO, what if stop failed
      this.tasks.delete(task.title);
      this.taskRuntime.delete(task.title);
    }
  }

  private restartTask(
    task: Task,
    runtime: IAgentRuntime,
    options: { overwriteTask: boolean } = { overwriteTask: true }
  ) {
    this.logger.debug(`restartTask ${task.title}`);

    if (options.overwriteTask) {
      this.tasks.set(task.title, task);
    }

    TaskEvent.createTaskRestartEvent(
      this.eventEmitter,
      task,
      runtime,
    );
  }

  updateTask(
    task: Task,
    options: { overwriteTask: boolean } = { overwriteTask: true }
  ) {
    const prefix = 'updateTask';
    this.logger.debug(`${prefix} ${task.title}`);

    const runtime = this.sharedService.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.error(`${prefix} ${task.title} runtime not found`);
      return;
    }

    if (options.overwriteTask) {
      this.tasks.set(task.title, task);
    }

    TaskEvent.createTaskUpdatedEvent(
      this.eventEmitter,
      task,
      runtime,
    );
  }

  private startTask(
    task: Task,
    runtime: IAgentRuntime
  ) {
    this.logger.debug(`startTask ${task.title}`);

    TaskEvent.createTaskStartEvent(
      this.eventEmitter,
      task,
      runtime,
    );
  }

  createTask(
    task: Task
  ) {
    const prefix = 'createTask';
    this.logger.debug(`${prefix} ${task.title}`);

    const runtime = this.sharedService.taskRuntime.get(task.title);
    if (!runtime) {
      this.logger.error(`${prefix} ${task.title} runtime not found`);
      return;
    }

    this.tasks.set(task.title, task);
    TaskEvent.createTaskCreatedEvent(
      this.eventEmitter,
      task,
      runtime,
    );
  }

  @CatchCronError(CronExpression.EVERY_MINUTE)
  // @CatchCronError(CronExpression.EVERY_10_SECONDS)
  async getNewTasks() {
    const prefix = 'getNewTasks';
    this.logger.debug(`${prefix} start`);

    const tasks = await this.tasksService.getNewTasks();
    for (const task of tasks) {
      if (this.tasks.has(task.title)) {
        this.logger.warn(`${prefix} ${task.title} already in local tasks`);
        continue;
      }

      if (!this.taskRuntime.has(task.title)) {
        this.logger.error(`${prefix} ${task.title} runtime not found`);
        continue;
      }

      if (
        task.status === TaskStatusName.STOPPED ||
        task.updatedAt.getTime() + taskTimeout < Date.now()
      ) {
        this.createTask(task);
      } else {
        this.logger.warn(`${prefix} ${task.title} is processed by other worker`);
      }
    }

    this.logger.debug(`${prefix} end ${tasks.length}`);
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
        this.logger.error(`${prefix} localTask ${task.title} not found`);
        continue;
      }

      // if owner changed
      if (localTask.task.createdBy !== task.createdBy && localTask.task.createdBy === workerUuid) {
        this.logger.debug(`${prefix} ${task.title} owner changed`);
        this.stopTask(task);
      } else if (
        // if action changed
        task.action !== this.tasks.get(task.title)!.action
      ) {
        this.logger.debug(`${prefix} ${task.title} action changed`);
        // the local task do not maintain stopped task, so ignore the task.action=start
        if (task.action === TaskActionName.STOP) {
          this.stopTask(task);
        } else if (task.action === TaskActionName.RESTART) {
          this.restartTask(task, localTask.runtime);
        } else if (task.action === TaskActionName.START) {
          this.logger.debug(`${prefix} ignore changed action ${task.action}`);
        } else {
          this.logger.error(`${prefix} unknown changed action ${task.action}`);
        }
      } else if (
        // configuration changed
        !_.isEqual(task.configuration, this.tasks.get(task.title)!.configuration)
      ) {
        // restart the task
        this.logger.debug(`${prefix} configuration changed.`);
        if (task.configuration.TWITTER_USERNAME) {
          this.restartTask(task, localTask.runtime);
        } else {
          // if twitter username is not set, stop the task
          this.stopTask(task);
        }
      } else {
        if (task.pauseUntil && task.pauseUntil > new Date()) {
          this.logger.debug(`${prefix} task ${task.title} is paused`);
          this.stopTask(task);
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
    const prefix = 'checkLocalTasksStatus';
    this.logger.debug(`${prefix} start`);

    for (const task of this.tasks) {
      const localTask = this.updateLocalTask(task[0]);
      if (!localTask) {
        this.logger.error(`${prefix} localTask ${task[0]} not found`);
        continue;
      }

      if (localTask.task.action === TaskActionName.START && localTask.task.status !== TaskStatusName.RUNNING) {
        this.startTask(localTask.task, localTask.runtime);
      } else if (localTask.task.action === TaskActionName.STOP && localTask.task.status !== TaskStatusName.STOPPED) {
        this.stopTask(localTask.task, { clear: false });
      } else if (localTask.task.action === TaskActionName.RESTART && localTask.task.status !== TaskStatusName.RESTARTED) {
        this.restartTask(localTask.task, localTask.runtime, { overwriteTask: false });
      } else {
        this.logger.debug(`${prefix} ${localTask.task.title} status is expected`);
      }
    }

    this.logger.debug(`${prefix} end ${this.tasks.size}`);
  }
}
