import { Controller, Post, Get, Put, Param, Body } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { Task, TaskStatusName } from './schemas/task.schema';
import { workerUuid } from '../constant';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskEvent, TaskEventName } from './interfaces/task.interface';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private eventEmitter: EventEmitter2
  ) { }

  @Post()
  async createTask(@Body() createTaskDto: CreateTaskDto) {
    const task: Task = {
      title: createTaskDto.title,
      action: createTaskDto.action,
      description: createTaskDto.description || '',
      configuration: createTaskDto.configuration || {},
      status: TaskStatusName.STOPPED,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: workerUuid,
      lock: new Date(2000, 1, 1),
    };

    const ret = await this.tasksService.create(task);
    this.eventEmitter.emit(
      TaskEventName.TASK_CREATED,
      new TaskEvent({
        task: ret,
        message: `Task ${ret.id} created`,
      }),
    );

    return ret;
  }

  @Put(':id')
  async updateTask(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // TODO task id not exists?

    const task: Partial<Task> = {
      ...updateTaskDto,
    };
    const ret = await this.tasksService.update(id, task);
    this.eventEmitter.emit(
      TaskEventName.TASK_UPDATED,
      new TaskEvent({
        task: ret,
        message: `Task ${ret.id} updated`,
      }),
    );

    return ret;
  }

  @Get(':id/status')
  async getTask(@Param('id') id: string) {
    const ret = await this.tasksService.getTask(id);
    return ret;
  }

  @Post(':id/start')
  async startTask(@Param('id') id: string) {
    const ret = await this.tasksService.startTask(id);
    this.eventEmitter.emit(
      TaskEventName.TASK_START,
      new TaskEvent({
        task: ret,
        message: `Task ${ret.id} started`,
      }),
    );

    return ret;
  }

  @Post(':id/stop')
  async stopTask(@Param('id') id: string) {
    const ret = await this.tasksService.stopTask(id);
    this.eventEmitter.emit(
      TaskEventName.TASK_STOP,
      new TaskEvent({
        task: ret,
        message: `Task ${ret.id} stopped`,
      }),
    );

    return ret;
  }

  @Post(':id/restart')
  async restartTask(@Param('id') id: string) {
    const ret = await  this.tasksService.restartTask(id);
    this.eventEmitter.emit(
      TaskEventName.TASK_RESTART,
      new TaskEvent({
        task: ret,
        message: `Task ${ret.id} restarted`,
      }),
    );

    return ret;
  }
}
