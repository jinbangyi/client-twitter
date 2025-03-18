import { Task } from "../schemas/task.schema";

export enum TaskEventName {
  TASK_CREATED = 'tasks.created',
  TASK_UPDATED = 'tasks.updated',
  TASK_START = 'tasks.start',
  TASK_STOP = 'tasks.stop',
  TASK_RESTART = 'tasks.restart',
}

export class TaskEvent {
  task: Task;
  message?: string;

  constructor(data: Partial<TaskEvent>) {
    Object.assign(this, data);
  }
}
