import { IsString, IsOptional, IsIn } from 'class-validator';
import { TaskAction, TaskActionName } from '../schemas/task.schema';
import { TwitterConfig } from '@elizaos/client-twitter';

export class CreateTaskDto {
  @IsString()
  readonly title: string;

  @IsString()
  @IsOptional()
  readonly description?: string;

  @IsIn(Object.values(TaskActionName))
  readonly action: TaskAction;

  @IsOptional()
  readonly configuration?: TwitterConfig & Record<string, any>;
}

export class UpdateTaskDto extends CreateTaskDto{};
