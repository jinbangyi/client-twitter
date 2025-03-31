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
  private agentIdTwitterUserName: Map<string, string> = new Map();

  // one loop to start all actions, so that can easy stop the client
  async start(runtime: IAgentRuntime) {
    this.runtime = runtime;
    const twitterConfig: TwitterConfig = await validateTwitterConfig(runtime);
    assert(twitterConfig.TWITTER_USERNAME, 'TWITTER_USERNAME is required');
    const agentId = runtime.agentId;
    this.agentIdTwitterUserName.set(agentId, twitterConfig.TWITTER_USERNAME!);

    const task = new Tasks({
      baseURL: taskManagerBaseEndpoint,
      headers: {
        'X-ADMIN-API-KEY': process.env.TASK_MANAGER_ADMIN_API_KEY!,
      }
    });

    if(SHARED_SERVICE.taskRuntime.has(twitterConfig.TWITTER_USERNAME!)) {
      this.logger.warn(`task ${twitterConfig.TWITTER_USERNAME!} runtime already exists, will be replaced`);
    }
    SHARED_SERVICE.setTaskRuntime(twitterConfig.TWITTER_USERNAME!, runtime);

    await task.tasksControllerCreateTask({
      title: twitterConfig.TWITTER_USERNAME!,
      action: TaskActionName.Start,
      configuration: twitterConfig as any,
    });
    return this;
  }

  async stop(runtime?: IAgentRuntime) {
    if (!runtime) runtime = this.runtime;
    const agentId = runtime.agentId;
    const twitterUsername = this.agentIdTwitterUserName.get(agentId);
    if (!twitterUsername) {
      this.logger.warn(`twitter username not found for agentId ${agentId}`);
      return;
    }

    const task = new Tasks({
      baseURL: taskManagerBaseEndpoint,
    });
    await task.tasksControllerStopTask(twitterUsername);
  }
};
