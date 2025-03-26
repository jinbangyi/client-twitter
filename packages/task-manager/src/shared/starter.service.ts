import { Client, type IAgentRuntime } from '@elizaos/core';
import assert from 'assert';
import { Tasks } from '@xnomad/task-manager-cli'
import { Logger } from '@nestjs/common';
import { TwitterConfig, validateTwitterConfig } from '@elizaos/client-twitter'
import { TaskActionName } from '@xnomad/task-manager-cli';

import { SHARED_SERVICE } from './shared.service.js';
import { taskManagerBaseEndpoint } from '../constant.js';

export class TwitterClientStarter implements Client {
  private runtime: IAgentRuntime;
  private logger = new Logger(TwitterClientStarter.name);

  // one loop to start all actions, so that can easy stop the client
  async start(runtime: IAgentRuntime) {
    this.runtime = runtime;
    const twitterConfig: TwitterConfig = await validateTwitterConfig(runtime);
    assert(twitterConfig.TWITTER_USERNAME, 'TWITTER_USERNAME is required');

    const task = new Tasks({
      baseURL: taskManagerBaseEndpoint,
      headers: {
        'X-ADMIN-API-KEY': process.env.TASK_MANAGER_ADMIN_API_KEY!,
      }
    });
    if(!SHARED_SERVICE.taskRuntime.has(twitterConfig.TWITTER_USERNAME!)) {
      SHARED_SERVICE.setTaskRuntime(twitterConfig.TWITTER_USERNAME!, runtime);
    } else {
      this.logger.warn(`task ${twitterConfig.TWITTER_USERNAME!} runtime already exists`);
    }

    await task.tasksControllerCreateTask({
      title: twitterConfig.TWITTER_USERNAME!,
      action: TaskActionName.Start,
      configuration: twitterConfig as any,
    });
    return this;
  }

  async stop(runtime?: IAgentRuntime) {
    if (!runtime) runtime = this.runtime;
    const twitterConfig: TwitterConfig = await validateTwitterConfig(runtime);
    assert(twitterConfig.TWITTER_USERNAME, 'TWITTER_USERNAME is required');

    const task = new Tasks({
      baseURL: taskManagerBaseEndpoint,
    });
    await task.tasksControllerStopTask(twitterConfig.TWITTER_USERNAME!);
  }
};
