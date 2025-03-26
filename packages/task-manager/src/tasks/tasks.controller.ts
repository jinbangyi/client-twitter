import { Controller, Post, Get, Put, Param, Body, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TasksService } from './tasks.service.js';
import { CreateTaskDto, TaskResponseDto, UpdateTaskDto } from './dto/task.dto.js';
import { Task, TaskStatusName } from './schemas/task.schema.js';
import { workerUuid } from '../constant.js';
import { TaskEvent, TaskEventName } from './interfaces/task.interface.js';
import { SHARED_SERVICE } from '../shared/shared.service.js';
import { ApiCreatedResponse } from '@nestjs/swagger';

function mergeDtoAndTask(task: Task, dto: CreateTaskDto | UpdateTaskDto): Task {
  return {
    ...task,
    ...dto,
  };
}

@Controller('client-twitter/tasks')
export class TasksController {
  private readonly logger = new Logger(`${TasksController.name}_${workerUuid}`);
  private sharedService = SHARED_SERVICE;

  constructor(
    private readonly tasksService: TasksService,
    private eventEmitter: EventEmitter2,
  ) {}

  @Post()
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async createTask(@Body() createTaskDto: CreateTaskDto) {
    const task: Task = {
      title: createTaskDto.title,
      action: createTaskDto.action,
      description: createTaskDto.description || '',
      configuration: createTaskDto.configuration || {},
      status: TaskStatusName.STOPPED,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: workerUuid
    };

    if (!this.sharedService.taskRuntime.get(task.title)) {
      this.logger.warn(`task ${task.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${task.title} runtime not found`);
    }

    const dbTask = await this.tasksService.getTaskByTitle(task.title);
    if (dbTask) {
      // if task already exists, update it
      this.logger.warn(`task ${task.title} already exists, update it`);
      const ret = await this.updateTask(dbTask.id, mergeDtoAndTask(dbTask, createTaskDto));
      const ok = this.eventEmitter.emit(
        TaskEventName.TASK_UPDATED,
        new TaskEvent({
          task: ret,
          runtime: this.sharedService.taskRuntime.get(ret.title)!,
          message: `Task ${ret.id} created`,
        }),
      );
      this.logger.debug(`emit event ${TaskEventName.TASK_UPDATED} ${ok}`);
      return ret;
    }

    const ret = await this.tasksService.create(task);
    this.eventEmitter.emit(
      TaskEventName.TASK_CREATED,
      new TaskEvent({
        task: ret,
        runtime: this.sharedService.taskRuntime.get(ret.title)!,
        message: `Task ${ret.id} created`,
      }),
    );

    return ret;
  }

  @Put(':id')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async updateTask(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // TODO task id not exists?

    const task: Partial<Task> = {
      ...updateTaskDto,
    };
    const ret = await this.tasksService.update(id, task);
    if (!ret) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    if (!this.sharedService.taskRuntime.get(ret.title)) {
      this.logger.warn(`task ${ret.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${ret.title} runtime not found`);
    }

    this.eventEmitter.emit(
      TaskEventName.TASK_UPDATED,
      new TaskEvent({
        task: ret,
        runtime: this.sharedService.taskRuntime.get(ret.title)!,
        message: `Task ${ret.id} updated`,
      }),
    );

    return ret;
  }

  @Get(':id/status')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async getTask(@Param('id') id: string) {
    const ret = await this.tasksService.getTask(id);
    return ret;
  }

  @Post(':id/start')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async startTask(@Param('id') id: string) {
    const ret = await this.tasksService.startTask(id);
    if (!ret) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    if (!this.sharedService.taskRuntime.get(ret.title)) {
      this.logger.warn(`task ${ret.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${ret.title} runtime not found`);
    }

    this.eventEmitter.emit(
      TaskEventName.TASK_START,
      new TaskEvent({
        task: ret,
        runtime: this.sharedService.taskRuntime.get(ret.title)!,
        message: `Task ${ret.id} started`,
      }),
    );

    return ret;
  }

  @Post(':title/stop')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async stopTask(@Param('title') title: string) {
    const ret = await this.tasksService.stopTask(title);
    if (!ret) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    if (!this.sharedService.taskRuntime.get(ret.title)) {
      this.logger.warn(`task ${ret.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${ret.title} runtime not found`);
    }

    this.eventEmitter.emit(
      TaskEventName.TASK_STOP,
      new TaskEvent({
        task: ret,
        runtime: this.sharedService.taskRuntime.get(ret.title)!,
        message: `Task ${ret.id} stopped`,
      }),
    );

    return ret;
  }

  @Post(':id/restart')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async restartTask(@Param('id') id: string) {
    const ret = await this.tasksService.restartTask(id);
    if (!ret) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    if (!this.sharedService.taskRuntime.get(ret.title)) {
      this.logger.warn(`task ${ret.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${ret.title} runtime not found`);
    }

    this.eventEmitter.emit(
      TaskEventName.TASK_RESTART,
      new TaskEvent({
        task: ret,
        runtime: this.sharedService.taskRuntime.get(ret.title)!,
        message: `Task ${ret.id} restarted`,
      }),
    );

    return ret;
  }
}
