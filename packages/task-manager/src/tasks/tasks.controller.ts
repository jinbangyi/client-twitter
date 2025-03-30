import { Controller, Post, Put, Param, Body, BadRequestException, Logger, UseGuards, Get } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiCreatedResponse, ApiHeader } from '@nestjs/swagger';

import { TasksService } from './tasks.service.js';
import { CreateTaskDto, TaskResponseDto, UpdateTaskDto } from './dto/task.dto.js';
import { Task, TaskStatusName } from './schemas/task.schema.js';
import { workerUuid } from '../constant.js';
import { TaskEvent, TaskEventName } from './interfaces/task.interface.js';
import { SHARED_SERVICE } from '../shared/shared.service.js';
import { AdminApiKeyGuard } from './tasks.guard.js';
import { TaskSettingsService } from './task-settings.service.js';

function mergeDtoAndTask(task: Task, dto: CreateTaskDto | UpdateTaskDto): Task {
  return {
    ...task,
    ...dto,
  };
}

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

  @Post(':title/stop')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async stopTask(
    @Param('title') title: string
  ) {
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

  @Post(':twitterUserName/report/suspended')
  @ApiCreatedResponse({
    type: TaskResponseDto,
  })
  async suspendedTask(
    @Param('twitterUserName') twitterUserName: string
  ) {
    // pause the task for 4 hours
    const oldTask = await this.tasksService.getTaskByTwitterUserName(twitterUserName);
    if (!oldTask) {
      throw new BadRequestException('the task not exists');
    }

    let tags: Task['tags'] = ['suspended'];
    if (oldTask.tags.includes('suspended')) {
      tags = [...oldTask.tags];
    } else {
      tags = [...oldTask.tags, 'suspended'];
    }

    const ret = await this.tasksService.updateByTitle(
      // 4h
      oldTask.title, { tags, pauseUntil: new Date(Date.now() + 1000 * 60 * 60 * 4) }
    );

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

  // @Post(':id/start')
  // @ApiCreatedResponse({
  //   type: TaskResponseDto,
  // })
  // async startTask(@Param('id') id: string) {
  //   const ret = await this.tasksService.startTask(id);
  //   if (!ret) {
  //     // http 400 error
  //     throw new BadRequestException('the task not exists');
  //   }

  //   if (!this.sharedService.taskRuntime.get(ret.title)) {
  //     this.logger.warn(`task ${ret.title} runtime not found`);
  //     // http 400 error
  //     throw new BadRequestException(`task ${ret.title} runtime not found`);
  //   }

  //   this.eventEmitter.emit(
  //     TaskEventName.TASK_START,
  //     new TaskEvent({
  //       task: ret,
  //       runtime: this.sharedService.taskRuntime.get(ret.title)!,
  //       message: `Task ${ret.id} started`,
  //     }),
  //   );

  //   return ret;
  // }

  // @Post(':id/restart')
  // @ApiCreatedResponse({
  //   type: TaskResponseDto,
  // })
  // async restartTask(@Param('id') id: string) {
  //   const ret = await this.tasksService.restartTask(id);
  //   if (!ret) {
  //     // http 400 error
  //     throw new BadRequestException('the task not exists');
  //   }

  //   if (!this.sharedService.taskRuntime.get(ret.title)) {
  //     this.logger.warn(`task ${ret.title} runtime not found`);
  //     // http 400 error
  //     throw new BadRequestException(`task ${ret.title} runtime not found`);
  //   }

  //   this.eventEmitter.emit(
  //     TaskEventName.TASK_RESTART,
  //     new TaskEvent({
  //       task: ret,
  //       runtime: this.sharedService.taskRuntime.get(ret.title)!,
  //       message: `Task ${ret.id} restarted`,
  //     }),
  //   );

  //   return ret;
  // }
}
