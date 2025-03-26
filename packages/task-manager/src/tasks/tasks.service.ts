import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Task, TaskActionName, TaskStatusName } from './schemas/task.schema.js';
import { taskTimeout } from '../constant.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<Task>
  ) { }

  async create(createTask: Task): Promise<Task> {
    const createdTask = new this.taskModel(createTask);
    return createdTask.save();
  }

  async update(id: string, updateTask: Partial<Task>): Promise<Task | null> {
    updateTask.updatedAt = new Date();
    return this.taskModel.findByIdAndUpdate(id, updateTask, { new: true });
  }

  async updateByTitle(title: string, updateTask: Partial<Task>): Promise<Task | null> {
    updateTask.updatedAt = new Date();
    return this.taskModel.findOneAndUpdate({ title }, updateTask, { new: true });
  }

  async getTask(id: string): Promise<Task | null> {
    return this.taskModel.findById(id).exec();
  }

  async getTaskByTitle(title: string): Promise<Required<Task> | null> {
    return this.taskModel.findOne({ title });
  }

  async getTaskByTitles(titles: string[]): Promise<Task[]> {
    return this.taskModel.find({ title: { $in: titles } }).exec();
  }

  async startTask(id: string): Promise<Task | null> {
    return this.update(id, { action: 'start' });
  }

  async stopTask(title: string): Promise<Task | null> {
    return this.updateByTitle(title, { action: 'stop' });
  }

  async restartTask(id: string): Promise<Task | null> {
    return this.update(id, { action: 'restart' });
  }

  async getNewTasks(): Promise<Task[]> {
    const query = {
      $or: [
        // get the task require to start
        { action: TaskActionName.START, status: TaskStatusName.STOPPED },
        // get the timeout task
        { updatedAt: { $lt: new Date(Date.now() - taskTimeout) }, status: TaskStatusName.RUNNING },
      ]
    };
    const tasks = await this.taskModel.find(query);

    return tasks;
  }
}
