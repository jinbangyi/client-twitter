import { type Client, elizaLogger, type IAgentRuntime } from '@elizaos/core';
import { ClientBase } from './base.ts';
import { validateTwitterConfig, type TwitterConfig } from './environment.ts';
import { TwitterInteractionClient } from './interactions.ts';
import { TwitterPostClient } from './post.ts';
import { TwitterSearchClient } from './search.ts';
import { TwitterSpaceClient } from './spaces.ts';
import { Logger } from './settings/index.ts';

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
class TwitterManager {
  client: ClientBase;
  post: TwitterPostClient;
  search: TwitterSearchClient;
  interaction: TwitterInteractionClient;
  space?: TwitterSpaceClient;

  constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
    // Pass twitterConfig to the base client
    this.client = new ClientBase(runtime, twitterConfig);

    // Posting logic
    this.post = new TwitterPostClient(this.client, runtime);

    // Optional search logic (enabled if TWITTER_SEARCH_ENABLE is true)
    if (twitterConfig.TWITTER_SEARCH_ENABLE) {
      Logger.warn('Twitter/X client running in a mode that:');
      Logger.warn('1. violates consent of random users');
      Logger.warn('2. burns your rate limit');
      Logger.warn('3. can get your account banned');
      Logger.warn('use at your own risk');
      this.search = new TwitterSearchClient(this.client, runtime);
    }

    // Mentions and interactions
    this.interaction = new TwitterInteractionClient(this.client, runtime);

    // Optional Spaces logic (enabled if TWITTER_SPACES_ENABLE is true)
    if (twitterConfig.TWITTER_SPACES_ENABLE) {
      this.space = new TwitterSpaceClient(this.client, runtime);
    }

    // console.log('TwitterManager constructor end');
  }

  // TODO stop the manager
  // TODO get current state of the manager
  // TODO get the queue length
  // TODO get the manager's health
  // TODO count the errors
}

export const TwitterClientInterface: Client = {
  // one loop to start all actions, so that can easy stop the client
  async start(runtime: IAgentRuntime) {
    const twitterConfig: TwitterConfig = await validateTwitterConfig(runtime);

    elizaLogger.log(
      `Twitter client started username=${twitterConfig.TWITTER_USERNAME}`,
    );

    const manager = new TwitterManager(runtime, twitterConfig);

    // Initialize login/session
    await manager.client.init();

    // Start the posting loop
    await manager.post.start();

    // Start the search logic if it exists
    if (manager.search) {
      await manager.search.start();
    }

    // Start interactions (mentions, replies)
    await manager.interaction.start();

    // If Spaces are enabled, start the periodic check
    if (manager.space) {
      manager.space.startPeriodicSpaceCheck();
    }

    return manager;
  },

  async stop(_runtime: IAgentRuntime) {
    elizaLogger.warn('Twitter client does not support stopping yet');
  },
};

export default TwitterClientInterface;
