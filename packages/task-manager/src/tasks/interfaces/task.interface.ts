import { type IAgentRuntime } from '@elizaos/core';

import { Task } from "../schemas/task.schema.js";

export enum TaskEventName {
  TASK_CREATED = 'tasks.created',
  TASK_UPDATED = 'tasks.updated',
  TASK_START = 'tasks.start',
  TASK_STOP = 'tasks.stop',
  TASK_RESTART = 'tasks.restart',
}

export class TaskEvent {
  // the conig of task
  task: Task;
  // the runtime of task
  runtime: IAgentRuntime;
  message?: string;

  constructor(data: { task: Task, runtime: IAgentRuntime, message?: string }) {
    this.task = data.task;
    this.runtime = data.runtime;
    this.message = data.message;
  }
}
