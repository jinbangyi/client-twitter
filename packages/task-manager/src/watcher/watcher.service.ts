import { Injectable, Logger } from '@nestjs/common';
import { type IAgentRuntime } from '@elizaos/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TwitterClient, TwitterClientStatus } from '@elizaos/client-twitter';
import { TasksService } from '../tasks/tasks.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { workerUuid } from '../constant';
import { TaskEvent, TaskEventName } from '../tasks/interfaces/task.interface';
import { Task, TaskActionName, TaskStatusName } from '../tasks/schemas/task.schema';

@Injectable()
export class WatcherService {
  private readonly logger = new Logger(TasksService.name);
  // task.title -> task
  private tasks: Map<string, Task> = new Map();
  // task.title -> runtime
  private taskRuntime: Map<string, IAgentRuntime> = new Map();

  constructor(
    private readonly tasksService: TasksService,
    private eventEmitter: EventEmitter2
  ) { }

  /**
   * inject task runtime to watcher service
   * @param taskTitle task title
   * @param runtime client twitter's runtime
   */
  async setTaskRuntime(taskTitle: string, runtime: IAgentRuntime) {
    if (this.taskRuntime.has(taskTitle)) {
      if (this.tasks.has(taskTitle)) {
        await this.onTaskStop(new TaskEvent({
          task: this.tasks.get(taskTitle),
          message: `Task ${taskTitle} stopped`,
        }));
      }
    }
    this.taskRuntime.set(taskTitle, runtime);
  }

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

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkTasksStatus() {
    this.logger.debug(`start check ${workerUuid} tasks`);

    const tasks = await this.tasksService.getActiveWorkerOwnedOrTimeoutTasks();
    for (const task of tasks) {
      if (task.createdBy === workerUuid) {
        // check local tasks
        const localTask = this.updateLocalTask(task.title)?.task;
        if (!localTask) {
          // start task
          this.eventEmitter.emit(
            TaskEventName.TASK_START,
            new TaskEvent({
              task,
              message: `Task ${task.id} started`,
            }),
          );
        } else {
          // check local task status
          if (task.action === TaskActionName.START && localTask.status === TaskStatusName.RUNNING) {
            await this.tasksService.update(task.id, { createdBy: workerUuid });
          } else if (task.action === TaskActionName.STOP && localTask.status === TaskStatusName.STOPPED) {
            await this.tasksService.update(task.id, { createdBy: workerUuid });
          } else if (task.action === TaskActionName.RESTART && localTask.status === TaskStatusName.RESTARTED) {
            await this.tasksService.update(task.id, { createdBy: workerUuid });
          } else {
            // if status not match the action, then execute the action
            if (task.action === TaskActionName.START) {
              this.eventEmitter.emit(
                TaskEventName.TASK_START,
                new TaskEvent({
                  task,
                  message: `Task ${task.id} started`,
                }),
              );
            } else if (task.action === TaskActionName.STOP) {
              this.eventEmitter.emit(
                TaskEventName.TASK_STOP,
                new TaskEvent({
                  task,
                  message: `Task ${task.id} stopped`,
                }),
              );
            } else if (task.action === TaskActionName.RESTART) {
              this.eventEmitter.emit(
                TaskEventName.TASK_RESTART,
                new TaskEvent({
                  task,
                  message: `Task ${task.id} restarted`,
                }),
              );
            } else {
              this.logger.error(`unknown action ${task.action}`);
            }
          }
        }
      } else {
        // if task not started by any worker, start it
        const ok = await this.tasksService.checkTimeoutTaskLock(task.title);
        if (ok) {
          // if task timeout, start it
          this.eventEmitter.emit(
            TaskEventName.TASK_START,
            new TaskEvent({
              task,
              message: `Task ${task.id} restarted`,
            }),
          );
        } else {
          this.logger.warn(`ignore the timeout task ${task.title}`);
        }
      }
    }

    const notCheckedTasks = tasks.filter(task => !this.tasks.has(task.title));
    // stop not checked tasks
    notCheckedTasks.forEach(task => {
      this.eventEmitter.emit(
        TaskEventName.TASK_STOP,
        new TaskEvent({
          task,
          message: `Task ${task.id} stopped`,
        }),
      );
    });

    this.logger.debug(`end check ${workerUuid} tasks`);
  }

  @OnEvent([TaskEventName.TASK_CREATED, TaskEventName.TASK_START])
  async onTaskCreated(payload: TaskEvent) {
    this.logger.debug(`start task ${payload.task.title}`);
    let localTask = this.updateLocalTask(payload.task.title);
    if (localTask) {
      await TwitterClient.start(localTask.runtime);
      // update task status
      await this.tasksService.update(payload.task.id, { createdBy: workerUuid, status: TaskStatusName.RUNNING });
      this.tasks.set(payload.task.title, payload.task);
    }
  }

  @OnEvent([TaskEventName.TASK_RESTART, TaskEventName.TASK_UPDATED])
  async onTaskRestarted(payload: TaskEvent) {
    // TODO not all config update require restart
    this.logger.debug(`restart task ${payload.task.title}`);
    let localTask = this.updateLocalTask(payload.task.title);
    if (localTask) {
      await TwitterClient.stop(localTask.runtime);
      await TwitterClient.start(localTask.runtime);
      await this.tasksService.update(payload.task.id, { createdBy: workerUuid, status: TaskStatusName.RESTARTED });
    }
  }

  @OnEvent(TaskEventName.TASK_STOP)
  async onTaskStop(payload: TaskEvent) {
    this.logger.debug(`stop task ${payload.task.title}`);
    let localTask = this.updateLocalTask(payload.task.title);
    if (localTask) {
      // if task status is stopped, then remove it
      if (localTask.task.status === TaskStatusName.STOPPED) {
        this.tasks.delete(payload.task.title);
      }

      await TwitterClient.stop(localTask.runtime);
      await this.tasksService.update(payload.task.id, { createdBy: workerUuid, status: TaskStatusName.STOPPED });
    }
  }
}
