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
    this.logger.debug(`start task ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          await TwitterClient.start(payload.runtime);
          const task = await this.tasksService.updateByTitle(
            payload.task.title, { createdBy: workerUuid, status: TaskStatusName.RUNNING }
          );
          if (!task) {
            this.logger.error(`restart task ${payload.task.title} error: task not found in db`);
          }
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`start task ${payload.task.title} error: lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`restart task ${payload.task.title} error: ${error.message}`);
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
    this.logger.debug(`restart task ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          await TwitterClient.stop(payload.runtime);
          await TwitterClient.start(payload.runtime);
          const task = await this.tasksService.updateByTitle(
            payload.task.title, { createdBy: workerUuid, status: TaskStatusName.RESTARTED }
          );
          if (!task) {
            this.logger.error(`restart task ${payload.task.title} error: task not found in db`);
          }
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`restart task ${payload.task.title} error: lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`restart task ${payload.task.title} error: ${error.message}`);
    }
  }

  @OnEvent(TaskEventName.TASK_STOP)
  async onTaskStop(payload: TaskEvent) {
    this.logger.debug(`stop task ${payload.task.title}`);

    try {
      if (await this.mongodbLockService.acquireLock(payload.task.title)) {
        try {
          await TwitterClient.stop(payload.runtime);
          const task = await this.tasksService.updateByTitle(
            payload.task.title, { createdBy: workerUuid, status: TaskStatusName.STOPPED }
          );
          if (!task) {
            this.logger.error(`stop task ${payload.task.title} error: task not found in db`);
          }
        } finally {
          await this.mongodbLockService.releaseLock(payload.task.title);
        }
      } else {
        this.logger.warn(`stop task ${payload.task.title} error: lock not acquired`);
      }
    } catch (error: any) {
      this.logger.error(`stop task ${payload.task.title} error: ${error.message}`);
    }
  }
}
