import { IsString, IsOptional, IsIn } from 'class-validator';
import { TwitterConfig as ExternalTwitterConfig } from '@elizaos/client-twitter';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TaskAction, TaskActionName } from '../schemas/task.schema.js';
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
