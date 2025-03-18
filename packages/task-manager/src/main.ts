import { NestFactory } from '@nestjs/core';
import { TaskManagerModule } from './app.module';
import { taskManagerHttpServicePort } from './constant';
// import { WatcherService } from './watcher/watcher.service';

// const vars = { };

async function bootstrap() {
  const app = await NestFactory.create(TaskManagerModule);
  // const myService = app.get(WatcherService);
  // myService.setTaskRuntime('test', vars);
  
  await app.listen(taskManagerHttpServicePort);
}
// bootstrap();
