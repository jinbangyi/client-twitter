import { Controller, Post, Put, Param, Body, BadRequestException, Logger, UseGuards, Get } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiCreatedResponse, ApiHeader } from '@nestjs/swagger';

import { TasksService } from './tasks.service.js';
import { CreateTaskDto, TaskResponseDto, UpdateTaskDto } from './dto/task.dto.js';
import { Task, TaskStatusName } from './schemas/task.schema.js';
import { workerUuid } from '../constant.js';
import { TaskEvent } from './interfaces/task.interface.js';
import { SHARED_SERVICE } from '../shared/shared.service.js';
import { AdminApiKeyGuard } from './tasks.guard.js';
import { TaskSettingsService } from './task-settings.service.js';
import { WatcherService } from '../watcher/watcher.service.js';

@ApiHeader({
  name: 'X-ADMIN-API-KEY',
  description: 'API Key needed to access this route',
  required: true,
})
@Controller('client-twitter/tasks')
@UseGuards(AdminApiKeyGuard)
export class TasksController {
  private readonly logger = new Logger(`${TasksController.name}_${workerUuid}`);
  private sharedService = SHARED_SERVICE;

  constructor(
    private readonly tasksService: TasksService,
    private readonly taskSettingsService: TaskSettingsService,
    private watcherService: WatcherService,
    private eventEmitter: EventEmitter2,
  ) { }

  @Post()
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async createTask(
    @Body() createTaskDto: CreateTaskDto
  ) {
    const task: Task = {
      title: createTaskDto.title,
      action: createTaskDto.action,
      description: createTaskDto.description || '',
      configuration: createTaskDto.configuration || {},
      status: TaskStatusName.STOPPED,
      createdAt: new Date(),
      updatedAt: new Date(),
      eventUpdatedAt: new Date(),
      createdBy: workerUuid,
      tags: [],
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
      // using the old http proxy
      if (createTaskDto.configuration) {
        createTaskDto.configuration.TWITTER_HTTP_PROXY = dbTask.configuration.TWITTER_HTTP_PROXY;
      }
      return await this.updateTask(dbTask.id, createTaskDto);
    } else {
      if (!task.configuration.TWITTER_HTTP_PROXY) {
        const proxy = await this.taskSettingsService.randomGetHttpProxy();
        if (!proxy) {
          this.logger.error('no http proxy found');
        } else {
          task.configuration.TWITTER_HTTP_PROXY = proxy;
        }
      }
    }

    const createdTask = await this.tasksService.create(task);
    this.watcherService.createTask(createdTask);

    return createdTask;
  }

  @Post(':title/stop')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async stopTask(
    @Param('title') title: string
  ) {
    const task = await this.tasksService.stopTask(title);
    if (!task) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    if (!this.sharedService.taskRuntime.get(task.title)) {
      this.logger.warn(`task ${task.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${task.title} runtime not found`);
    }

    this.watcherService.stopTask(task);

    return task;
  }

  @Post(':twitterUserName/report/suspended')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async suspendedTask(
    @Param('twitterUserName') twitterUserName: string
  ) {
    // pause the task for 4 hours
    const tasks = await this.tasksService.getTaskByTwitterUserName(twitterUserName);
    if (tasks.length === 0) {
      throw new BadRequestException('the task not exists');
    }

    const ret: (Task | null)[] = [];

    for (const task of tasks) {
      let tags: Task['tags'] = ['suspended'];
      if (task.tags.includes('suspended')) {
        tags = [...task.tags];
      } else {
        tags = [...task.tags, 'suspended'];
      }
      const resp = await this.tasksService.updateByTitle(
        // 4h
        task.title, { tags, pauseUntil: new Date(Date.now() + 1000 * 60 * 60 * 4) }
      );
      ret.push(resp);
    }

    return ret;
  }

  @Put(':id')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async updateTask(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto
  ) {
    const task: Partial<Task> = {
      ...updateTaskDto,
    };
    const updatedTask = await this.tasksService.update(id, task);
    if (!updatedTask) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    if (!this.sharedService.taskRuntime.get(updatedTask.title)) {
      this.logger.warn(`task ${updatedTask.title} runtime not found`);
      // http 400 error
      throw new BadRequestException(`task ${updatedTask.title} runtime not found`);
    }

    this.watcherService.updateTask(updatedTask);
    return updatedTask;
  }

  @Get(':title/status')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async getTask(@Param('title') title: string) {
    const ret = await this.tasksService.getTaskByTitle(title);
    if (!ret) {
      // http 400 error
      throw new BadRequestException('the task not exists');
    }

    return ret;
  }
}
