import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WatcherService } from './watcher.service';

@Module({
  imports: [
    ScheduleModule.forRoot()
  ],
  providers: [WatcherService],
  exports: [WatcherService],
})
export class WatcherModule {}
