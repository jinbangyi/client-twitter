import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TasksModule } from './tasks/tasks.module';
import { WatcherModule } from './watcher/watcher.module';
import { HealthModule } from './health/health.module';
import { MongooseModule } from '@nestjs/mongoose';
import { mongodbCaFile, mongodbUri } from './constant';

@Module({
  imports: [
    TasksModule,
    WatcherModule,
    HealthModule,

    EventEmitterModule.forRoot(),
    MongooseModule.forRoot(
      mongodbUri,
      { tlsAllowInvalidHostnames: true, tlsCAFile: mongodbCaFile },
    ),
  ],
})
export class TaskManagerModule {}
