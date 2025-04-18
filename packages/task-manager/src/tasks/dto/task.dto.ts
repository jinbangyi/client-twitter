import { IsString, IsOptional, IsIn } from 'class-validator';
import { TwitterConfig as ExternalTwitterConfig } from '@elizaos/client-twitter';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TaskAction, TaskActionName, TaskStatus, TaskStatusName, TaskTagName, TaskTags } from '../schemas/task.schema.js';
import { TwitterConfig } from './external.dto.js';

export class CreateTaskDto {
  @ApiProperty({
    description: 'The title of the task',
    example: 'Twitter Post Scheduler'
  })
  @IsString()
  readonly title: string;

  @ApiPropertyOptional({
    description: 'Optional description of the task',
    example: 'A task that schedules Twitter posts'
  })
  @IsString()
  @IsOptional()
  readonly description?: string;

  @ApiProperty({
    description: 'The type of action this task will perform',
    enum: TaskActionName,
    enumName: 'TaskActionName',
    example: TaskActionName.RESTART
  })
  @IsIn(Object.values(TaskActionName))
  readonly action: TaskAction;

  @ApiPropertyOptional({
    type: TwitterConfig,
  })
  @IsOptional()
  readonly configuration?: ExternalTwitterConfig & Record<string, any>;
}

export class UpdateTaskDto extends CreateTaskDto {
}

export class TaskResponseDto {
  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty({ required: true })
  title: string;

  @ApiProperty({
    required: true,
    enum: TaskActionName,
    description: 'Available actions: restart, stop, start'
  })
  action: TaskAction;

  @ApiProperty({ required: false })
  description: string;

  @ApiProperty({
    enum: TaskStatusName,
    default: TaskStatusName.STOPPED,
    description: 'Task status: restarted, running, completed, stopped'
  })
  status: TaskStatus;

  @ApiProperty({
    required: true,
    type: TwitterConfig,
    description: 'Twitter configuration and additional settings'
  })
  configuration: TwitterConfig & Record<string, any>;

  @ApiProperty({
    type: Date,
    default: 'Date.now()',
    description: 'Task creation timestamp'
  })
  createdAt: Date;

  @ApiProperty({ required: false })
  createdBy: string;

  @ApiProperty({
    type: Date,
    default: 'Date.now()',
    description: 'Last update timestamp'
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    type: Date,
    description: 'Pause until this date'
  })
  pauseUntil?: Date;

  @ApiPropertyOptional({
    type: [String],
    enum: TaskTagName,
    description: 'Task tags'
  })
  tags: TaskTags[];
}
