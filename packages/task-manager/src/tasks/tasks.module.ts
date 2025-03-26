import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TaskSchema, Task } from './schemas/task.schema.js';
// import { SharedModule } from '../shared/shared.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    // SharedModule
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule { }
