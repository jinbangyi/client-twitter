import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskStatusName } from './schemas/task.schema';
import { lockTimeout, taskTimeout, workerUuid } from '../constant';

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private readonly taskModel: Model<Task>) {}

  async create(createTask: Task): Promise<Task> {
    const createdTask = new this.taskModel(createTask);
    return createdTask.save();
  }

  async update(id: string, updateTask: Partial<Task>): Promise<Task> {
    updateTask.updatedAt = new Date();
    return this.taskModel.findByIdAndUpdate(id, updateTask, { new: true });
  }

  async getTask(id: string): Promise<Task> {
    return this.taskModel.findById(id);
  }

  async startTask(id: string): Promise<Task> {
    return this.update(id, { action: 'start' });
  }

  async stopTask(id: string): Promise<Task> {
    return this.update(id, { action: 'stop' });
  }

  async restartTask(id: string): Promise<Task> {
    return this.update(id, { action: 'restart' });
  }

  async getActiveWorkerOwnedOrTimeoutTasks(): Promise<Task[]> {
    // get all timeout tasks
    // get all managed tasks
    const tasks = await this.taskModel.find({
      $or: [
        { createdBy: workerUuid, status: TaskStatusName.RUNNING },
        { updatedAt: { $lt: new Date(Date.now() - taskTimeout) } },
      ]
    });

    return tasks;
  }

  async checkTimeoutTaskLock(timeoutTaskName: string): Promise<boolean> {
    const task = await this.taskModel.findOneAndUpdate(
      { title: timeoutTaskName, lock: { $lt: new Date(Date.now() - lockTimeout) } },
      { lock: new Date(), updatedAt: new Date(), createdBy: workerUuid },
    );
    return task && task.updatedAt < new Date(Date.now() - taskTimeout);
  }
}
