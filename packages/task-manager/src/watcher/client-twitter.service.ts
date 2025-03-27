import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { TwitterClient } from '@elizaos/client-twitter';

import { TasksService } from '../tasks/tasks.service.js';
import { workerUuid } from '../constant.js';
import { TaskEvent, TaskEventName } from '../tasks/interfaces/task.interface.js';
import { TaskStatusName } from '../tasks/schemas/task.schema.js';
import { MongodbLockService } from './lock.service.js';

@Injectable()
export class ClientTwitterService {
  private readonly logger = new Logger(`${ClientTwitterService.name}_${workerUuid}`);

  constructor(
    private readonly tasksService: TasksService,
    private readonly mongodbLockService: MongodbLockService,
    private eventEmitter: EventEmitter2
  ) { }

  @OnEvent(TaskEventName.TASK_CREATED)
  async onTaskCreated(payload: TaskEvent) {
    return this.taskStart(payload);
  }

  @OnEvent(TaskEventName.TASK_START)
  async onTaskStart(payload: TaskEvent) {
    return this.taskStart(payload);
  }

  // can not combine multi event
  private async taskStart(payload: TaskEvent) {
    const prefix = 'taskStart';
    this.logger.debug(`${prefix} ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          // check if the task is already running
          const latestTask = await this.tasksService.getTaskByTitle(payload.task.title);
          if (!latestTask) {
            this.logger.error(`${prefix} ${payload.task.title} error: task not found in db`);
            return;
          }

          if (latestTask.status === TaskStatusName.RUNNING) {
            this.logger.warn(`${prefix} ${payload.task.title} error: task is already running`);
            return;
          }

          await TwitterClient.start(payload.runtime);
          await this.tasksService.updateByTitle(
            payload.task.title, { createdBy: workerUuid, status: TaskStatusName.RUNNING }
          );
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`${prefix} ${payload.task.title} error: lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} ${payload.task.title} error: ${error.message}`);
    }
  }

  @OnEvent(TaskEventName.TASK_RESTART)
  async onTaskRestart(payload: TaskEvent) {
    return this.taskRestart(payload);
  }

  @OnEvent(TaskEventName.TASK_UPDATED)
  async onTaskUpdate(payload: TaskEvent) {
    return this.taskRestart(payload);
  }

  private async taskRestart(payload: TaskEvent) {
    const prefix = 'taskRestart';
    this.logger.debug(`${prefix} ${payload.task.title}`);

    try {
      // do not update the db status, so do not invoke this.onTaskStop
      await TwitterClient.stop(payload.runtime);
      await this.taskStart(payload);
    } catch (error: any) {
      this.logger.error(`${prefix} ${payload.task.title} error: ${error.message}`);
    }
  }

  @OnEvent(TaskEventName.TASK_STOP)
  async onTaskStop(payload: TaskEvent) {
    const prefix = 'onTaskStop';
    this.logger.debug(`${prefix} ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          await TwitterClient.stop(payload.runtime);
          const task = await this.tasksService.updateByTitle(
            payload.task.title, { createdBy: workerUuid, status: TaskStatusName.STOPPED }
          );
          if (!task) {
            this.logger.error(`${prefix} ${payload.task.title} error: task not found in db`);
          }
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`${prefix} ${payload.task.title} error: lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} ${payload.task.title} error: ${error.message}`);
    }
  }
}
