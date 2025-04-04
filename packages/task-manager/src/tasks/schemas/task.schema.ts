import { TwitterConfig } from '@elizaos/client-twitter';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { taskMongodbCollectionName, workerUuid } from '../../constant.js';

// completed mean the task is finished by it self
export enum TaskStatusName {
  RESTARTED = 'restarted',
  RUNNING = 'running',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
}
export type TaskStatus = 'restarted' | 'running' | 'completed' | 'stopped';

export enum TaskActionName {
  RESTART = 'restart',
  STOP = 'stop',
  START = 'start',
}
export type TaskAction = 'restart' | 'stop' | 'start';

export enum TaskTagName {
  SUSPENDED = 'suspended',
}
export type TaskTags = 'suspended';

export function isPaused(task: Task) {
  return task.pauseUntil && task.pauseUntil > new Date();
}

export function isRunningByAnotherWorker(task: Task) {
  return task.status === TaskStatusName.RUNNING && task.createdBy !== workerUuid;
}

@Schema({ collection: taskMongodbCollectionName })
export class Task {
  id?: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, enum: TaskActionName, required: true })
  action: TaskAction;

  @Prop({ type: String })
  description: string;

  @Prop({ type: String, enum: TaskStatusName })
  status: TaskStatus;

  @Prop({ type: Object, required: true })
  configuration: TwitterConfig & Record<string, any>;

  @Prop({ type: [String], enum: TaskTagName })
  tags: TaskTags[];

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: String })
  createdBy: string;

  @Prop({ type: Date })
  updatedAt: Date;

  @Prop({ type: Date })
  eventUpdatedAt: Date;

  @Prop({ type: Date })
  pauseUntil?: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ title: 1 }, { unique: true });
TaskSchema.index({ createdBy: 1, status: 1 });
TaskSchema.index({ updatedAt: 1, status: 1 });
TaskSchema.index({ action: 1, status: 1 });
