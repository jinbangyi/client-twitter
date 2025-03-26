import { Client, type IAgentRuntime } from '@elizaos/core';
import assert from 'assert';
import { Tasks } from '@xnomad/task-manager-cli'
import { TwitterConfig, validateTwitterConfig } from '@elizaos/client-twitter'
import { TaskActionName } from '@xnomad/task-manager-cli';

import { SHARED_SERVICE } from './shared.service.js';
import { taskManagerBaseEndpoint } from '../constant.js';

export class TwitterClientStarter implements Client {
  private runtime: IAgentRuntime;

  // one loop to start all actions, so that can easy stop the client
  async start(runtime: IAgentRuntime) {
    this.runtime = runtime;
    const twitterConfig: TwitterConfig = await validateTwitterConfig(runtime);
    assert(twitterConfig.TWITTER_USERNAME, 'TWITTER_USERNAME is required');

    const task = new Tasks({
      baseURL: taskManagerBaseEndpoint,
    });
    const resp = await task.tasksControllerCreateTask({
      title: twitterConfig.TWITTER_USERNAME!,
      action: TaskActionName.Start,
      configuration: twitterConfig as any,
    });
    if (resp) {
      SHARED_SERVICE.setTaskRuntime('twitter', runtime);
    }
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
