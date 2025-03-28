// src/base.ts
import {
  getEmbeddingZeroVector,
  stringToUuid,
  ActionTimelineType
} from "@elizaos/core";
import {
  SearchMode
} from "agent-twitter-client";
import { EventEmitter } from "events";

// src/scraper.ts
import { Scraper } from "agent-twitter-client";
import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";
function wrapperFetchFunction(proxyUrl) {
  let agent = void 0;
  if (proxyUrl) {
    agent = new HttpsProxyAgent(proxyUrl);
  }
  return async (input, init) => {
    let headers = void 0;
    try {
      if (init?.headers) headers = Object.fromEntries(init.headers);
    } catch (error) {
      if (error.toString() === "TypeError: object is not iterable (cannot read property Symbol(Symbol.iterator))") {
        headers = init?.headers;
      } else {
        throw error;
      }
    }
    const params = {
      url: input.toString(),
      method: init?.method || "GET",
      headers,
      data: init?.body,
      httpsAgent: agent
    };
    let response;
    try {
      response = await axios.request(params);
    } catch (error) {
      throw error;
    }
    const data = typeof response.data === "object" ? JSON.stringify(response.data) : response.data;
    return new Response(data, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    });
  };
}
var CustomScraper = class extends Scraper {
  constructor(options, proxyUrl) {
    super({
      fetch: wrapperFetchFunction(proxyUrl),
      // using options
      transform: options?.transform
    });
  }
};

// src/settings/index.ts
import { elizaLogger } from "@elizaos/core";
function getCurrentTwitterAccountStatus(username) {
  if (!SETTINGS.account[username]) return "STOPPED" /* STOPPED */;
  return SETTINGS.account[username].status;
}
function getCurrentAgentTwitterAccountStatus(agentId) {
  if (!SETTINGS.agent[agentId.toString()]) return "STOPPED" /* STOPPED */;
  const twitterConfig = SETTINGS.agent[agentId.toString()];
  return getCurrentTwitterAccountStatus(twitterConfig.TWITTER_USERNAME);
}
var Logger = elizaLogger.child({
  plugin: "client-twitter"
});
var SETTINGS = {
  account: {},
  agent: {}
};

// src/base.ts
var RequestQueue = class {
  queue = [];
  processing = false;
  async add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      try {
        await request();
      } catch (error) {
        console.error("Error processing request:", error);
        this.queue.unshift(request);
        await this.exponentialBackoff(this.queue.length);
      }
      await this.randomDelay();
    }
    this.processing = false;
  }
  async exponentialBackoff(retryCount) {
    const delay = Math.pow(2, retryCount) * 1e3;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  async randomDelay() {
    const delay = Math.floor(Math.random() * 2e3) + 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
};
var ClientBase = class _ClientBase extends EventEmitter {
  static _twitterClients = {};
  twitterClient;
  runtime;
  runtimeHelper;
  twitterConfig;
  directions;
  lastCheckedTweetId = null;
  imageDescriptionService;
  temperature = 0.5;
  requestQueue = new RequestQueue();
  profile;
  logger;
  async getTweet(tweetId) {
    const cachedTweet = await this.runtimeHelper.getCachedTweet(tweetId);
    if (cachedTweet) {
      return cachedTweet;
    }
    const tweet = await this.requestQueue.add(
      () => this.twitterClient.getTweet(tweetId)
    );
    await this.runtimeHelper.cacheTweet(tweet);
    return tweet;
  }
  callback = null;
  onReady() {
    throw new Error("Not implemented in base class, please call from subclass");
  }
  /**
   * Parse the raw tweet data into a standardized Tweet object.
   */
  parseTweet(raw, depth = 0, maxDepth = 3) {
    const canRecurse = depth < maxDepth;
    const quotedStatus = raw.quoted_status_result?.result && canRecurse ? this.parseTweet(raw.quoted_status_result.result, depth + 1, maxDepth) : void 0;
    const retweetedStatus = raw.retweeted_status_result?.result && canRecurse ? this.parseTweet(
      raw.retweeted_status_result.result,
      depth + 1,
      maxDepth
    ) : void 0;
    const t = {
      bookmarkCount: raw.bookmarkCount ?? raw.legacy?.bookmark_count ?? void 0,
      conversationId: raw.conversationId ?? raw.legacy?.conversation_id_str,
      hashtags: raw.hashtags ?? raw.legacy?.entities?.hashtags ?? [],
      html: raw.html,
      id: raw.id ?? raw.rest_id ?? raw.id_str ?? void 0,
      inReplyToStatus: raw.inReplyToStatus,
      inReplyToStatusId: raw.inReplyToStatusId ?? raw.legacy?.in_reply_to_status_id_str ?? void 0,
      isQuoted: raw.legacy?.is_quote_status === true,
      isPin: raw.isPin,
      isReply: raw.isReply,
      isRetweet: raw.legacy?.retweeted === true,
      isSelfThread: raw.isSelfThread,
      language: raw.legacy?.lang,
      likes: raw.legacy?.favorite_count ?? 0,
      name: raw.name ?? raw?.user_results?.result?.legacy?.name ?? raw.core?.user_results?.result?.legacy?.name,
      mentions: raw.mentions ?? raw.legacy?.entities?.user_mentions ?? [],
      permanentUrl: raw.permanentUrl ?? (raw.core?.user_results?.result?.legacy?.screen_name && raw.rest_id ? `https://x.com/${raw.core?.user_results?.result?.legacy?.screen_name}/status/${raw.rest_id}` : void 0),
      photos: raw.photos ?? (raw.legacy?.entities?.media?.filter((media) => media.type === "photo").map((media) => ({
        id: media.id_str,
        url: media.media_url_https,
        alt_text: media.alt_text
      })) || []),
      place: raw.place,
      poll: raw.poll ?? null,
      quotedStatus,
      quotedStatusId: raw.quotedStatusId ?? raw.legacy?.quoted_status_id_str ?? void 0,
      quotes: raw.legacy?.quote_count ?? 0,
      replies: raw.legacy?.reply_count ?? 0,
      retweets: raw.legacy?.retweet_count ?? 0,
      retweetedStatus,
      retweetedStatusId: raw.legacy?.retweeted_status_id_str ?? void 0,
      text: raw.text ?? raw.legacy?.full_text ?? void 0,
      thread: raw.thread || [],
      timeParsed: raw.timeParsed ? new Date(raw.timeParsed) : raw.legacy?.created_at ? new Date(raw.legacy?.created_at) : void 0,
      timestamp: raw.timestamp ?? (raw.legacy?.created_at ? new Date(raw.legacy.created_at).getTime() / 1e3 : void 0),
      urls: raw.urls ?? raw.legacy?.entities?.urls ?? [],
      userId: raw.userId ?? raw.legacy?.user_id_str ?? void 0,
      username: raw.username ?? raw.core?.user_results?.result?.legacy?.screen_name ?? void 0,
      videos: raw.videos ?? raw.legacy?.entities?.media?.filter(
        (media) => media.type === "video"
      ) ?? [],
      views: raw.views?.count ? Number(raw.views.count) : 0,
      sensitiveContent: raw.sensitiveContent
    };
    return t;
  }
  constructor(runtime, twitterConfig) {
    super();
    this.runtime = runtime;
    this.twitterConfig = twitterConfig;
    this.logger = Logger.child({
      twitterName: this.twitterConfig.TWITTER_USERNAME,
      name: this.twitterConfig.TWITTER_USERNAME
    });
    this.runtimeHelper = new RuntimeHelper(runtime, this.logger);
    const username = twitterConfig.TWITTER_USERNAME;
    if (_ClientBase._twitterClients[username]) {
      this.twitterClient = _ClientBase._twitterClients[username];
    } else {
      this.twitterClient = new CustomScraper(
        {
          transform: {
            response: (data) => {
              if (data.__typename === "Tweet") {
                return this.parseTweet(data);
              }
              return data;
            },
            request: (data) => {
              if (data.__typename === "Tweet") {
                return this.parseTweet(data);
              }
              return data;
            }
          }
        },
        this.twitterConfig.TWITTER_HTTP_PROXY
      );
      _ClientBase._twitterClients[username] = this.twitterClient;
    }
    this.directions = this.runtimeHelper.getDirections();
  }
  async twitterLoginInitCookies() {
    const username = this.twitterConfig.TWITTER_USERNAME;
    const authToken = this.twitterConfig.TWITTER_COOKIES_AUTH_TOKEN;
    const ct0 = this.twitterConfig.TWITTER_COOKIES_CT0;
    const guestId = this.twitterConfig.TWITTER_COOKIES_GUEST_ID;
    this.logger.debug("Waiting for Twitter login cookie init");
    SETTINGS.account[username] = {
      ...SETTINGS.account[username],
      state: "TWITTER_LOGIN_COOKIE_INIT" /* TWITTER_LOGIN_COOKIE_INIT */
    };
    const createTwitterCookies = (authToken2, ct02, guestId2) => authToken2 && ct02 && guestId2 ? [
      { key: "auth_token", value: authToken2, domain: ".twitter.com" },
      { key: "ct0", value: ct02, domain: ".twitter.com" },
      { key: "guest_id", value: guestId2, domain: ".twitter.com" }
    ] : null;
    const cachedCookies = await this.runtimeHelper.getCachedCookies(username) || createTwitterCookies(authToken, ct0, guestId);
    if (cachedCookies) {
      this.logger.info("Using cached cookies");
      await this.setCookiesFromArray(cachedCookies);
    }
  }
  async twitterLogin() {
    const username = this.twitterConfig.TWITTER_USERNAME;
    let retries = this.twitterConfig.TWITTER_RETRY_LIMIT;
    this.logger.debug("Waiting for Twitter login");
    SETTINGS.account[username] = {
      ...SETTINGS.account[username],
      state: "TWITTER_LOGIN" /* TWITTER_LOGIN */
    };
    while (retries > 0) {
      try {
        if (await this.twitterClient.isLoggedIn()) {
          this.logger.info("Successfully logged in.");
          break;
        } else {
          await this.twitterClient.login(
            username,
            this.twitterConfig.TWITTER_PASSWORD,
            this.twitterConfig.TWITTER_EMAIL,
            this.twitterConfig.TWITTER_2FA_SECRET
          );
          if (await this.twitterClient.isLoggedIn()) {
            this.logger.info("Successfully logged in.");
            this.logger.info("Caching cookies");
            await this.runtimeHelper.cacheCookies(
              username,
              await this.twitterClient.getCookies()
            );
            break;
          }
        }
      } catch (error) {
        this.logger.error(`Login attempt failed: ${error.message}`);
      }
      retries--;
      this.logger.error(
        `Failed to login to Twitter. Retrying... (${retries} attempts left)`
      );
      if (retries === 0) {
        this.logger.error("Max retries reached. Exiting login process.");
        throw new Error("Twitter login failed after maximum retries.");
      }
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }
  }
  async initTwitterProfile() {
    const username = this.twitterConfig.TWITTER_USERNAME;
    this.logger.debug("Waiting for Twitter profile init");
    SETTINGS.account[username] = {
      ...SETTINGS.account[username],
      state: "TWITTER_PROFILE_INIT" /* TWITTER_PROFILE_INIT */
    };
    this.profile = await this.fetchProfile(username);
    if (this.profile) {
      this.logger.debug("Twitter user ID:", this.profile.id);
      this.logger.debug("Twitter loaded:", JSON.stringify(this.profile));
      this.runtimeHelper.setTwitterProfile(this.profile);
    } else {
      throw new Error("Failed to load profile");
    }
  }
  async init() {
    await this.twitterLoginInitCookies();
    await this.twitterLogin();
    await this.initTwitterProfile();
    await this.loadLatestCheckedTweetId();
    await this.populateTimeline();
  }
  async fetchOwnPosts(count) {
    this.logger.debug("fetching own posts");
    const homeTimeline = await this.twitterClient.getUserTweets(
      this.profile.id,
      count
    );
    return homeTimeline.tweets.map((t) => this.parseTweet(t));
  }
  /**
   * Fetch timeline for twitter account, optionally only from followed accounts
   */
  async fetchHomeTimeline(count, following) {
    this.logger.debug("fetching home timeline");
    const homeTimeline = following ? await this.twitterClient.fetchFollowingTimeline(count, []) : await this.twitterClient.fetchHomeTimeline(count, []);
    const processedTimeline = homeTimeline.filter((t) => t.__typename !== "TweetWithVisibilityResults").map((tweet) => this.parseTweet(tweet));
    return processedTimeline;
  }
  async fetchTimelineForActions(count) {
    this.logger.debug("fetching timeline for actions");
    const agentUsername = this.twitterConfig.TWITTER_USERNAME;
    const homeTimeline = this.twitterConfig.ACTION_TIMELINE_TYPE === ActionTimelineType.Following ? await this.twitterClient.fetchFollowingTimeline(count, []) : await this.twitterClient.fetchHomeTimeline(count, []);
    return homeTimeline.map((tweet) => this.parseTweet(tweet)).filter((tweet) => tweet.username !== agentUsername).slice(0, count);
  }
  async fetchSearchTweets(query, maxTweets, searchMode, cursor) {
    try {
      const timeoutPromise = new Promise(
        (resolve) => setTimeout(() => resolve({ tweets: [] }), 15e3)
      );
      try {
        const result = await this.requestQueue.add(
          async () => await Promise.race([
            this.twitterClient.fetchSearchTweets(
              query,
              maxTweets,
              searchMode,
              cursor
            ),
            timeoutPromise
          ])
        );
        return result ?? { tweets: [] };
      } catch (error) {
        this.logger.error("Error fetching search tweets:", error);
        return { tweets: [] };
      }
    } catch (error) {
      this.logger.error("Error fetching search tweets:", error);
      return { tweets: [] };
    }
  }
  async populateTimeline() {
    const username = this.twitterConfig.TWITTER_USERNAME;
    this.logger.debug("populating timeline...");
    SETTINGS.account[username] = {
      ...SETTINGS.account[username],
      state: "TWITTER_POPULATE_TIMELINE" /* TWITTER_POPULATE_TIMELINE */
    };
    const cachedTimeline = await this.runtimeHelper.getOrCreateCachedTimeline(
      this.profile
    );
    if (cachedTimeline.ret) return;
    const timeline = await this.fetchHomeTimeline(cachedTimeline.res ? 10 : 50);
    const mentionsAndInteractions = await this.fetchSearchTweets(
      `@${username}`,
      20,
      SearchMode.Latest
    );
    const allTweets = [...timeline, ...mentionsAndInteractions.tweets];
    const roomIds = /* @__PURE__ */ new Set();
    for (const tweet of allTweets) {
      roomIds.add(this.runtimeHelper.getTweetRoomId(tweet.conversationId));
    }
    const existingMemoryIds = await this.runtimeHelper.getMemoryIdsByRoomIds(
      Array.from(roomIds)
    );
    const tweetsToSave = allTweets.filter(
      (tweet) => !existingMemoryIds.has(this.runtimeHelper.getTweetMemoryId(tweet.id))
    );
    this.logger.debug(
      "processingTweets: ",
      JSON.stringify({
        processingTweets: tweetsToSave.map((tweet) => tweet.id).join(",")
      })
    );
    await this.runtimeHelper.ensureUserExists(username);
    await this.runtimeHelper.saveTweets(this.profile, tweetsToSave, {
      inReplyToAddAgentId: false,
      checkMemoryExists: false
    });
    await this.cacheTimeline(timeline);
    await this.runtimeHelper.cacheMentions(
      username,
      mentionsAndInteractions.tweets
    );
  }
  async setCookiesFromArray(cookiesArray) {
    const cookieStrings = cookiesArray.map(
      (cookie) => `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${cookie.secure ? "Secure" : ""}; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${cookie.sameSite || "Lax"}`
    );
    await this.twitterClient.setCookies(cookieStrings);
  }
  async saveRequestMessage(message, state) {
    return this.runtimeHelper.saveRequestMessage(
      message,
      state,
      this.twitterClient
    );
  }
  async loadLatestCheckedTweetId() {
    const latestCheckedTweetId = await this.runtimeHelper.getCachedLatestCheckedTweetId(
      this.profile.username
    );
    if (latestCheckedTweetId) {
      this.lastCheckedTweetId = latestCheckedTweetId;
    }
  }
  async cacheLatestCheckedTweetId() {
    if (this.lastCheckedTweetId) {
      await this.runtimeHelper.cacheLatestCheckedTweetId(
        this.profile.username,
        this.lastCheckedTweetId
      );
    }
  }
  async cacheTimeline(timeline) {
    await this.runtimeHelper.cacheTimeline(this.profile.username, timeline);
  }
  async fetchProfile(username) {
    try {
      const profile = await this.twitterClient.getProfile(username);
      const character = this.runtimeHelper.getCharacter();
      return {
        id: profile.userId,
        username,
        screenName: profile.name || character.name,
        bio: profile.biography || typeof character.bio === "string" ? character.bio : character.bio.length > 0 ? character.bio[0] : "",
        nicknames: character.twitterProfile?.nicknames || []
      };
    } catch (error) {
      console.error("Error fetching Twitter profile:", error);
      throw error;
    }
  }
};
var RuntimeHelper = class {
  // TODO add runtime helper to base class
  constructor(runtime, logger) {
    this.runtime = runtime;
    this.logger = logger;
  }
  async saveRequestMessage(message, state, twitterClient) {
    if (message.content.text) {
      const recentMessage = await this.runtime.messageManager.getMemories({
        roomId: message.roomId,
        count: 1,
        unique: false
      });
      if (recentMessage.length > 0 && recentMessage[0].content === message.content) {
        this.logger.debug("Message already saved", recentMessage[0].id);
      } else {
        await this.runtime.messageManager.createMemory({
          ...message,
          embedding: getEmbeddingZeroVector()
        });
      }
      await this.runtime.evaluate(message, {
        ...state,
        twitterClient
      });
    }
  }
  getDirections() {
    const ret = "- " + this.runtime.character.style.all.join("\n- ") + "- " + this.runtime.character.style.post.join();
    return ret;
  }
  async cacheTweet(tweet) {
    if (!tweet) {
      console.warn("Tweet is undefined, skipping cache");
      return;
    }
    this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
  }
  async getCachedTweet(tweetId) {
    const cached = await this.runtime.cacheManager.get(
      `twitter/tweets/${tweetId}`
    );
    return cached;
  }
  async getCachedLatestCheckedTweetId(username) {
    const latestCheckedTweetId = await this.runtime.cacheManager.get(
      `twitter/${username}/latest_checked_tweet_id`
    );
    if (latestCheckedTweetId) {
      return BigInt(latestCheckedTweetId);
    }
  }
  async cacheLatestCheckedTweetId(username, lastCheckedTweetId) {
    await this.runtime.cacheManager.set(
      `twitter/${username}/latest_checked_tweet_id`,
      lastCheckedTweetId.toString()
    );
  }
  async getCachedTimeline(username) {
    return await this.runtime.cacheManager.get(
      `twitter/${username}/timeline`
    );
  }
  async ensureUserExists(username) {
    await this.runtime.ensureUserExists(
      this.runtime.agentId,
      username,
      this.runtime.character.name,
      "twitter"
    );
  }
  async getMemoryIdsByRoomIds(roomIds) {
    const existingMemories = await this.runtime.messageManager.getMemoriesByRoomIds({
      roomIds
    });
    const existingMemoryIds = new Set(
      existingMemories.map((memory) => memory.id)
    );
    return existingMemoryIds;
  }
  getTweetRoomId(conversationId) {
    return stringToUuid(conversationId + "-" + this.runtime.agentId);
  }
  getTweetMemoryId(tweetId) {
    return this.getTweetRoomId(tweetId);
  }
  async saveTweets(profile, tweetsToSave, options = {
    inReplyToAddAgentId: true,
    checkMemoryExists: true
  }) {
    for (const tweet of tweetsToSave) {
      this.logger.debug("Saving Tweet", tweet.id);
      const roomId = stringToUuid(
        tweet.conversationId + "-" + this.runtime.agentId
      );
      const userId = tweet.userId === profile.id ? this.runtime.agentId : stringToUuid(tweet.userId);
      if (tweet.userId === profile.id) {
        await this.runtime.ensureConnection(
          this.runtime.agentId,
          roomId,
          profile.username,
          profile.screenName,
          "twitter"
        );
      } else {
        await this.runtime.ensureConnection(
          userId,
          roomId,
          tweet.username,
          tweet.name,
          "twitter"
        );
      }
      const inReplyTo = () => {
        if (options.inReplyToAddAgentId) {
          return tweet.inReplyToStatusId ? stringToUuid(tweet.inReplyToStatusId + "-" + this.runtime.agentId) : void 0;
        } else {
          return tweet.inReplyToStatusId ? stringToUuid(tweet.inReplyToStatusId) : void 0;
        }
      };
      const content = {
        text: tweet.text,
        url: tweet.permanentUrl,
        source: "twitter",
        inReplyTo: inReplyTo()
      };
      this.logger.debug("Creating memory for tweet", tweet.id);
      if (options.checkMemoryExists) {
        const memory = await this.runtime.messageManager.getMemoryById(
          stringToUuid(tweet.id + "-" + this.runtime.agentId)
        );
        if (memory) {
          this.logger.info(
            "Memory already exists, skipping timeline population"
          );
          break;
        }
      }
      await this.runtime.messageManager.createMemory({
        id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
        userId,
        content,
        agentId: this.runtime.agentId,
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1e3
      });
      await this.cacheTweet(tweet);
    }
  }
  async getOrCreateCachedTimeline(profile) {
    const username = profile.username;
    const cachedTimeline = await this.getCachedTimeline(username);
    if (cachedTimeline) {
      const existingMemories = await this.runtime.messageManager.getMemoriesByRoomIds({
        roomIds: cachedTimeline.map(
          (tweet) => stringToUuid(tweet.conversationId + "-" + this.runtime.agentId)
        )
      });
      const existingMemoryIds = new Set(
        existingMemories.map((memory) => memory.id.toString())
      );
      const someCachedTweetsExist = cachedTimeline.some(
        (tweet) => existingMemoryIds.has(
          stringToUuid(tweet.id + "-" + this.runtime.agentId)
        )
      );
      if (someCachedTweetsExist) {
        const tweetsToSave = cachedTimeline.filter(
          (tweet) => !existingMemoryIds.has(
            stringToUuid(tweet.id + "-" + this.runtime.agentId)
          )
        );
        this.logger.debug({
          processingTweets: tweetsToSave.map((tweet) => tweet.id).join(",")
        });
        await this.saveTweets(profile, tweetsToSave);
        this.logger.debug(
          `Populated ${tweetsToSave.length} missing tweets from the cache.`
        );
        return { ret: true };
      }
    }
    return { ret: false, res: cachedTimeline };
  }
  async cacheTimeline(username, timeline) {
    await this.runtime.cacheManager.set(
      `twitter/${username}/timeline`,
      timeline,
      { expires: Date.now() + 10 * 1e3 }
    );
  }
  async cacheMentions(username, mentions) {
    await this.runtime.cacheManager.set(
      `twitter/${username}/mentions`,
      mentions,
      { expires: Date.now() + 10 * 1e3 }
    );
  }
  async getCachedCookies(username) {
    return await this.runtime.cacheManager.get(
      `twitter/${username}/cookies`
    );
  }
  async cacheCookies(username, cookies) {
    await this.runtime.cacheManager.set(`twitter/${username}/cookies`, cookies);
  }
  setTwitterProfile(profile) {
    this.runtime.character.twitterProfile = {
      id: profile.id,
      username: profile.username,
      screenName: profile.screenName,
      bio: profile.bio,
      nicknames: profile.nicknames
    };
  }
  getCharacter() {
    return this.runtime.character;
  }
};

// src/environment.ts
import {
  parseBooleanFromText,
  ActionTimelineType as ActionTimelineType2
} from "@elizaos/core";
import { z, ZodError } from "zod";
var DEFAULT_MAX_TWEET_LENGTH = 280;
var twitterUsernameSchema = z.string().min(1, "An X/Twitter Username must be at least 1 character long").max(15, "An X/Twitter Username cannot exceed 15 characters").refine((username) => {
  if (username === "*") return true;
  return /^[A-Za-z0-9_]+$/.test(username);
}, "An X Username can only contain letters, numbers, and underscores");
var twitterEnvSchema = z.object({
  TWITTER_DRY_RUN: z.boolean(),
  TWITTER_USERNAME: z.string().min(1, "X/Twitter username is required"),
  TWITTER_PASSWORD: z.string().min(1, "X/Twitter password is required"),
  TWITTER_EMAIL: z.string().email("Valid X/Twitter email is required"),
  MAX_TWEET_LENGTH: z.number().int().default(DEFAULT_MAX_TWEET_LENGTH),
  TWITTER_SEARCH_ENABLE: z.boolean().default(false),
  TWITTER_2FA_SECRET: z.string(),
  TWITTER_RETRY_LIMIT: z.number().int(),
  TWITTER_POLL_INTERVAL: z.number().int(),
  TWITTER_TARGET_USERS: z.array(twitterUsernameSchema).default([]),
  // I guess it's possible to do the transformation with zod
  // not sure it's preferable, maybe a readability issue
  // since more people will know js/ts than zod
  /*
        z
        .string()
        .transform((val) => val.trim())
        .pipe(
            z.string()
                .transform((val) =>
                    val ? val.split(',').map((u) => u.trim()).filter(Boolean) : []
                )
                .pipe(
                    z.array(
                        z.string()
                            .min(1)
                            .max(15)
                            .regex(
                                /^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$|^[A-Za-z]$/,
                                'Invalid Twitter username format'
                            )
                    )
                )
                .transform((users) => users.join(','))
        )
        .optional()
        .default(''),
    */
  ENABLE_TWITTER_POST_GENERATION: z.boolean(),
  POST_INTERVAL_MIN: z.number().int(),
  POST_INTERVAL_MAX: z.number().int(),
  ENABLE_ACTION_PROCESSING: z.boolean(),
  ACTION_INTERVAL: z.number().int(),
  POST_IMMEDIATELY: z.boolean(),
  TWITTER_SPACES_ENABLE: z.boolean().default(false),
  MAX_ACTIONS_PROCESSING: z.number().int(),
  ACTION_TIMELINE_TYPE: z.nativeEnum(ActionTimelineType2).default(ActionTimelineType2.ForYou),
  TWITTER_HTTP_PROXY: z.string().optional(),
  TWITTER_COOKIES_AUTH_TOKEN: z.string().optional(),
  TWITTER_COOKIES_CT0: z.string().optional(),
  TWITTER_COOKIES_GUEST_ID: z.string().optional()
});
function parseTargetUsers(targetUsersStr) {
  if (!targetUsersStr?.trim()) {
    return [];
  }
  return targetUsersStr.split(",").map((user) => user.trim()).filter(Boolean);
}
function safeParseInt(value, defaultValue) {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : Math.max(1, parsed);
}
async function validateTwitterConfig(runtime) {
  try {
    const twitterConfig = {
      TWITTER_DRY_RUN: parseBooleanFromText(
        runtime.getSetting("TWITTER_DRY_RUN") || process.env.TWITTER_DRY_RUN
      ) ?? false,
      // parseBooleanFromText return null if "", map "" to false
      TWITTER_USERNAME: runtime.getSetting("TWITTER_USERNAME") || process.env.TWITTER_USERNAME,
      TWITTER_PASSWORD: runtime.getSetting("TWITTER_PASSWORD") || process.env.TWITTER_PASSWORD,
      TWITTER_EMAIL: runtime.getSetting("TWITTER_EMAIL") || process.env.TWITTER_EMAIL,
      // number as string?
      MAX_TWEET_LENGTH: safeParseInt(
        runtime.getSetting("MAX_TWEET_LENGTH") || process.env.MAX_TWEET_LENGTH,
        DEFAULT_MAX_TWEET_LENGTH
      ),
      TWITTER_SEARCH_ENABLE: parseBooleanFromText(
        runtime.getSetting("TWITTER_SEARCH_ENABLE") || process.env.TWITTER_SEARCH_ENABLE
      ) ?? false,
      // string passthru
      TWITTER_2FA_SECRET: runtime.getSetting("TWITTER_2FA_SECRET") || process.env.TWITTER_2FA_SECRET || "",
      // int
      TWITTER_RETRY_LIMIT: safeParseInt(
        runtime.getSetting("TWITTER_RETRY_LIMIT") || process.env.TWITTER_RETRY_LIMIT,
        5
      ),
      // int in seconds
      TWITTER_POLL_INTERVAL: safeParseInt(
        runtime.getSetting("TWITTER_POLL_INTERVAL") || process.env.TWITTER_POLL_INTERVAL,
        120
        // 2m
      ),
      // comma separated string
      TWITTER_TARGET_USERS: parseTargetUsers(
        runtime.getSetting("TWITTER_TARGET_USERS") || process.env.TWITTER_TARGET_USERS
      ),
      // bool
      ENABLE_TWITTER_POST_GENERATION: parseBooleanFromText(
        runtime.getSetting("ENABLE_TWITTER_POST_GENERATION") || process.env.ENABLE_TWITTER_POST_GENERATION
      ) ?? true,
      // int in minutes
      POST_INTERVAL_MIN: safeParseInt(
        runtime.getSetting("POST_INTERVAL_MIN") || process.env.POST_INTERVAL_MIN,
        90
        // 1.5 hours
      ),
      // int in minutes
      POST_INTERVAL_MAX: safeParseInt(
        runtime.getSetting("POST_INTERVAL_MAX") || process.env.POST_INTERVAL_MAX,
        180
        // 3 hours
      ),
      // bool
      ENABLE_ACTION_PROCESSING: parseBooleanFromText(
        runtime.getSetting("ENABLE_ACTION_PROCESSING") || process.env.ENABLE_ACTION_PROCESSING
      ) ?? false,
      // init in minutes (min 1m)
      ACTION_INTERVAL: safeParseInt(
        runtime.getSetting("ACTION_INTERVAL") || process.env.ACTION_INTERVAL,
        5
        // 5 minutes
      ),
      // bool
      POST_IMMEDIATELY: parseBooleanFromText(
        runtime.getSetting("POST_IMMEDIATELY") || process.env.POST_IMMEDIATELY
      ) ?? false,
      TWITTER_SPACES_ENABLE: parseBooleanFromText(
        runtime.getSetting("TWITTER_SPACES_ENABLE") || process.env.TWITTER_SPACES_ENABLE
      ) ?? false,
      MAX_ACTIONS_PROCESSING: safeParseInt(
        runtime.getSetting("MAX_ACTIONS_PROCESSING") || process.env.MAX_ACTIONS_PROCESSING,
        1
      ),
      ACTION_TIMELINE_TYPE: runtime.getSetting("ACTION_TIMELINE_TYPE") || process.env.ACTION_TIMELINE_TYPE,
      TWITTER_HTTP_PROXY: runtime.getSetting("TWITTER_HTTP_PROXY") || process.env.TWITTER_HTTP_PROXY,
      // cookies settings
      TWITTER_COOKIES_AUTH_TOKEN: runtime.getSetting("TWITTER_COOKIES_AUTH_TOKEN") || process.env.TWITTER_COOKIES_AUTH_TOKEN,
      TWITTER_COOKIES_CT0: runtime.getSetting("TWITTER_COOKIES_CT0") || process.env.TWITTER_COOKIES_CT0,
      TWITTER_COOKIES_GUEST_ID: runtime.getSetting("TWITTER_COOKIES_GUEST_ID") || process.env.TWITTER_COOKIES_GUEST_ID
    };
    return twitterEnvSchema.parse(twitterConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `X/Twitter configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/interactions.ts
import { SearchMode as SearchMode2 } from "agent-twitter-client";
import {
  composeContext,
  generateMessageResponse,
  generateShouldRespond,
  messageCompletionFooter,
  shouldRespondFooter,
  ModelClass,
  stringToUuid as stringToUuid3,
  getEmbeddingZeroVector as getEmbeddingZeroVector3,
  ServiceType
} from "@elizaos/core";

// src/utils.ts
import { getEmbeddingZeroVector as getEmbeddingZeroVector2 } from "@elizaos/core";
import { stringToUuid as stringToUuid2 } from "@elizaos/core";
import { elizaLogger as elizaLogger2 } from "@elizaos/core";
import fs from "fs";
import path from "path";
var wait = (minTime = 1e3, maxTime = 3e3) => {
  const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};
async function buildConversationThread(tweet, client2, maxReplies = 10) {
  const thread = [];
  const visited = /* @__PURE__ */ new Set();
  async function processThread(currentTweet, depth = 0) {
    elizaLogger2.debug("Processing tweet:", {
      id: currentTweet.id,
      inReplyToStatusId: currentTweet.inReplyToStatusId,
      depth
    });
    if (!currentTweet) {
      elizaLogger2.debug("No current tweet found for thread building");
      return;
    }
    if (depth >= maxReplies) {
      elizaLogger2.debug("Reached maximum reply depth", depth);
      return;
    }
    const memory = await client2.runtime.messageManager.getMemoryById(
      stringToUuid2(currentTweet.id + "-" + client2.runtime.agentId)
    );
    if (!memory) {
      const roomId = stringToUuid2(
        currentTweet.conversationId + "-" + client2.runtime.agentId
      );
      const userId = stringToUuid2(currentTweet.userId);
      await client2.runtime.ensureConnection(
        userId,
        roomId,
        currentTweet.username,
        currentTweet.name,
        "twitter"
      );
      await client2.runtime.messageManager.createMemory({
        id: stringToUuid2(currentTweet.id + "-" + client2.runtime.agentId),
        agentId: client2.runtime.agentId,
        content: {
          text: currentTweet.text,
          source: "twitter",
          url: currentTweet.permanentUrl,
          imageUrls: currentTweet.photos.map((p) => p.url) || [],
          inReplyTo: currentTweet.inReplyToStatusId ? stringToUuid2(
            currentTweet.inReplyToStatusId + "-" + client2.runtime.agentId
          ) : void 0
        },
        createdAt: currentTweet.timestamp * 1e3,
        roomId,
        userId: currentTweet.userId === client2.profile.id ? client2.runtime.agentId : stringToUuid2(currentTweet.userId),
        embedding: getEmbeddingZeroVector2()
      });
    }
    if (visited.has(currentTweet.id)) {
      elizaLogger2.debug("Already visited tweet:", currentTweet.id);
      return;
    }
    visited.add(currentTweet.id);
    thread.unshift(currentTweet);
    elizaLogger2.debug("Current thread state:", {
      length: thread.length,
      currentDepth: depth,
      tweetId: currentTweet.id
    });
    if (currentTweet.inReplyToStatusId) {
      elizaLogger2.debug(
        "Fetching parent tweet:",
        currentTweet.inReplyToStatusId
      );
      try {
        const parentTweet = await client2.twitterClient.getTweet(
          currentTweet.inReplyToStatusId
        );
        if (parentTweet) {
          elizaLogger2.debug("Found parent tweet:", {
            id: parentTweet.id,
            text: parentTweet.text?.slice(0, 50)
          });
          await processThread(parentTweet, depth + 1);
        } else {
          elizaLogger2.debug(
            "No parent tweet found for:",
            currentTweet.inReplyToStatusId
          );
        }
      } catch (error) {
        elizaLogger2.error("Error fetching parent tweet:", {
          tweetId: currentTweet.inReplyToStatusId,
          error
        });
      }
    } else {
      elizaLogger2.debug("Reached end of reply chain at:", currentTweet.id);
    }
  }
  await processThread(tweet, 0);
  elizaLogger2.debug("Final thread built:", {
    totalTweets: thread.length,
    tweetIds: thread.map((t) => ({
      id: t.id,
      text: t.text?.slice(0, 50)
    }))
  });
  return thread;
}
async function fetchMediaData(attachments) {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (/^(http|https):\/\//.test(attachment.url)) {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${attachment.url}`);
        }
        const mediaBuffer = Buffer.from(await response.arrayBuffer());
        const mediaType = attachment.contentType;
        return { data: mediaBuffer, mediaType };
      } else if (fs.existsSync(attachment.url)) {
        const mediaBuffer = await fs.promises.readFile(
          path.resolve(attachment.url)
        );
        const mediaType = attachment.contentType;
        return { data: mediaBuffer, mediaType };
      } else {
        throw new Error(
          `File not found: ${attachment.url}. Make sure the path is correct.`
        );
      }
    })
  );
}
async function sendTweet(client2, content, roomId, twitterUsername, inReplyTo) {
  const maxTweetLength = client2.twitterConfig.MAX_TWEET_LENGTH;
  const isLongTweet = maxTweetLength > 280;
  const tweetChunks = splitTweetContent(content.text, maxTweetLength);
  const sentTweets = [];
  let previousTweetId = inReplyTo;
  for (const chunk of tweetChunks) {
    let mediaData = null;
    if (content.attachments && content.attachments.length > 0) {
      mediaData = await fetchMediaData(content.attachments);
    }
    const cleanChunk = deduplicateMentions(chunk.trim());
    const result = await client2.requestQueue.add(
      async () => isLongTweet ? client2.twitterClient.sendLongTweet(
        cleanChunk,
        previousTweetId,
        mediaData
      ) : client2.twitterClient.sendTweet(
        cleanChunk,
        previousTweetId,
        mediaData
      )
    );
    const body = await result.json();
    const tweetResult = isLongTweet ? body?.data?.notetweet_create?.tweet_results?.result : body?.data?.create_tweet?.tweet_results?.result;
    if (tweetResult) {
      const finalTweet = {
        id: tweetResult.rest_id,
        text: tweetResult.legacy.full_text,
        conversationId: tweetResult.legacy.conversation_id_str,
        timestamp: new Date(tweetResult.legacy.created_at).getTime() / 1e3,
        userId: tweetResult.legacy.user_id_str,
        inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
        permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: []
      };
      sentTweets.push(finalTweet);
      previousTweetId = finalTweet.id;
    } else {
      elizaLogger2.error("Error sending tweet chunk:", {
        chunk,
        response: body
      });
    }
    await wait(1e3, 2e3);
  }
  const memories = sentTweets.map((tweet) => ({
    id: stringToUuid2(tweet.id + "-" + client2.runtime.agentId),
    agentId: client2.runtime.agentId,
    userId: client2.runtime.agentId,
    content: {
      tweetId: tweet.id,
      text: tweet.text,
      source: "twitter",
      url: tweet.permanentUrl,
      imageUrls: tweet.photos.map((p) => p.url) || [],
      inReplyTo: tweet.inReplyToStatusId ? stringToUuid2(tweet.inReplyToStatusId + "-" + client2.runtime.agentId) : void 0
    },
    roomId,
    embedding: getEmbeddingZeroVector2(),
    createdAt: tweet.timestamp * 1e3
  }));
  return memories;
}
function splitTweetContent(content, maxLength) {
  const paragraphs = content.split("\n\n").map((p) => p.trim());
  const tweets = [];
  let currentTweet = "";
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if ((currentTweet + "\n\n" + paragraph).trim().length <= maxLength) {
      if (currentTweet) {
        currentTweet += "\n\n" + paragraph;
      } else {
        currentTweet = paragraph;
      }
    } else {
      if (currentTweet) {
        tweets.push(currentTweet.trim());
      }
      if (paragraph.length <= maxLength) {
        currentTweet = paragraph;
      } else {
        const chunks = splitParagraph(paragraph, maxLength);
        tweets.push(...chunks.slice(0, -1));
        currentTweet = chunks[chunks.length - 1];
      }
    }
  }
  if (currentTweet) {
    tweets.push(currentTweet.trim());
  }
  return tweets;
}
function extractUrls(paragraph) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const placeholderMap = /* @__PURE__ */ new Map();
  let urlIndex = 0;
  const textWithPlaceholders = paragraph.replace(urlRegex, (match) => {
    const placeholder = `<<URL_CONSIDERER_23_${urlIndex}>>`;
    placeholderMap.set(placeholder, match);
    urlIndex++;
    return placeholder;
  });
  return { textWithPlaceholders, placeholderMap };
}
function splitSentencesAndWords(text, maxLength) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let currentChunk = "";
  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length <= maxLength) {
      if (currentChunk) {
        currentChunk += " " + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      if (sentence.length <= maxLength) {
        currentChunk = sentence;
      } else {
        const words = sentence.split(" ");
        currentChunk = "";
        for (const word of words) {
          if ((currentChunk + " " + word).trim().length <= maxLength) {
            if (currentChunk) {
              currentChunk += " " + word;
            } else {
              currentChunk = word;
            }
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = word;
          }
        }
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
function deduplicateMentions(paragraph) {
  const mentionRegex = /^@(\w+)(?:\s+@(\w+))*(\s+|$)/;
  const matches = paragraph.match(mentionRegex);
  if (!matches) {
    return paragraph;
  }
  let mentions = matches.slice(0, 1)[0].trim().split(" ");
  mentions = [...new Set(mentions)];
  const uniqueMentionsString = mentions.join(" ");
  const endOfMentions = paragraph.indexOf(matches[0]) + matches[0].length;
  return uniqueMentionsString + " " + paragraph.slice(endOfMentions);
}
function restoreUrls(chunks, placeholderMap) {
  return chunks.map((chunk) => {
    return chunk.replace(/<<URL_CONSIDERER_23_(\d+)>>/g, (match) => {
      const original = placeholderMap.get(match);
      return original || match;
    });
  });
}
function splitParagraph(paragraph, maxLength) {
  const { textWithPlaceholders, placeholderMap } = extractUrls(paragraph);
  const splittedChunks = splitSentencesAndWords(
    textWithPlaceholders,
    maxLength
  );
  const restoredChunks = restoreUrls(splittedChunks, placeholderMap);
  return restoredChunks;
}

// src/interactions.ts
var twitterMessageHandlerTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}

# TASK: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:

Current Post:
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). You MUST include an action if the current post text includes a prompt that is similar to one of the available actions mentioned here:
{{actionNames}}
{{actions}}

Here is the current post text again. Remember to include an action if the current post text includes a prompt that asks for one of the available actions mentioned above (does not need to be exact)
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}
` + messageCompletionFooter;
var twitterShouldRespondTemplate = (targetUsersStr) => `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should respond to the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

Response options are RESPOND, IGNORE and STOP.

PRIORITY RULE: ALWAYS RESPOND to these users regardless of topic or message content: ${targetUsersStr}. Topic relevance should be ignored for these users.

For other users:
- {{agentName}} should RESPOND to messages directed at them
- {{agentName}} should RESPOND to conversations relevant to their background
- {{agentName}} should IGNORE irrelevant messages
- {{agentName}} should IGNORE very short messages unless directly addressed
- {{agentName}} should STOP if asked to stop
- {{agentName}} should STOP if conversation is concluded
- {{agentName}} is in a room with other users and wants to be conversational, but not annoying.

IMPORTANT:
- {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.
- For users not in the priority list, {{agentName}} (@{{twitterUserName}}) should err on the side of IGNORE rather than RESPOND if in doubt.

Recent Posts:
{{recentPosts}}

Current Post:
{{currentPost}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
` + shouldRespondFooter;
var TwitterInteractionClient = class {
  client;
  runtime;
  isDryRun;
  handleTwitterInteractionsInterval;
  logger;
  constructor(client2, runtime) {
    this.client = client2;
    this.runtime = runtime;
    this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    this.logger = client2.logger;
  }
  async start() {
    this.handleTwitterInteractionsInterval = setInterval(async () => {
      await this.handleTwitterInteractions();
    }, this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1e3);
  }
  async stop() {
    if (this.handleTwitterInteractionsInterval) {
      clearInterval(this.handleTwitterInteractionsInterval);
      this.handleTwitterInteractionsInterval = null;
      const twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
      this.logger.info(
        `${twitterUsername} task handleTwitterInteractions stopped`
      );
    }
    return true;
  }
  async handleTwitterInteractions() {
    this.logger.log("Checking Twitter interactions");
    const twitterUsername = this.client.profile.username;
    try {
      const mentionCandidates = (await this.client.fetchSearchTweets(
        `@${twitterUsername}`,
        20,
        SearchMode2.Latest
      )).tweets;
      this.logger.log(
        "Completed checking mentioned tweets:",
        mentionCandidates.length
      );
      let uniqueTweetCandidates = [...mentionCandidates];
      if (this.client.twitterConfig.TWITTER_TARGET_USERS.length) {
        const TARGET_USERS = this.client.twitterConfig.TWITTER_TARGET_USERS;
        this.logger.log("Processing target users:", TARGET_USERS);
        if (TARGET_USERS.length > 0) {
          const tweetsByUser = /* @__PURE__ */ new Map();
          for (const username of TARGET_USERS) {
            try {
              const userTweets = (await this.client.twitterClient.fetchSearchTweets(
                `from:${username}`,
                3,
                SearchMode2.Latest
              )).tweets;
              const validTweets = userTweets.filter((tweet) => {
                const isUnprocessed = !this.client.lastCheckedTweetId || Number.parseInt(tweet.id) > this.client.lastCheckedTweetId;
                const isRecent = Date.now() - tweet.timestamp * 1e3 < 2 * 60 * 60 * 1e3;
                this.logger.log(`Tweet ${tweet.id} checks:`, {
                  isUnprocessed,
                  isRecent,
                  isReply: tweet.isReply,
                  isRetweet: tweet.isRetweet
                });
                return isUnprocessed && !tweet.isReply && !tweet.isRetweet && isRecent;
              });
              if (validTweets.length > 0) {
                tweetsByUser.set(username, validTweets);
                this.logger.log(
                  `Found ${validTweets.length} valid tweets from ${username}`
                );
              }
            } catch (error) {
              this.logger.error(
                `Error fetching tweets for ${username}:`,
                error
              );
              continue;
            }
          }
          const selectedTweets = [];
          for (const [username, tweets] of tweetsByUser) {
            if (tweets.length > 0) {
              const randomTweet = tweets[Math.floor(Math.random() * tweets.length)];
              selectedTweets.push(randomTweet);
              this.logger.log(
                `Selected tweet from ${username}: ${randomTweet.text?.substring(0, 100)}`
              );
            }
          }
          uniqueTweetCandidates = [...mentionCandidates, ...selectedTweets];
        }
      } else {
        this.logger.log("No target users configured, processing only mentions");
      }
      uniqueTweetCandidates.sort((a, b) => a.id.localeCompare(b.id)).filter((tweet) => tweet.userId !== this.client.profile.id);
      for (const tweet of uniqueTweetCandidates) {
        if (!this.client.lastCheckedTweetId || BigInt(tweet.id) > this.client.lastCheckedTweetId) {
          const tweetId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
          const existingResponse = await this.runtime.messageManager.getMemoryById(tweetId);
          if (existingResponse) {
            this.logger.log(`Already responded to tweet ${tweet.id}, skipping`);
            continue;
          }
          this.logger.log("New Tweet found", tweet.permanentUrl);
          const roomId = stringToUuid3(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const userIdUUID = tweet.userId === this.client.profile.id ? this.runtime.agentId : stringToUuid3(tweet.userId);
          await this.runtime.ensureConnection(
            userIdUUID,
            roomId,
            tweet.username,
            tweet.name,
            "twitter"
          );
          const thread = await buildConversationThread(tweet, this.client);
          const message = {
            content: {
              text: tweet.text,
              imageUrls: tweet.photos?.map((photo) => photo.url) || []
            },
            agentId: this.runtime.agentId,
            userId: userIdUUID,
            roomId
          };
          await this.handleTweet({
            tweet,
            message,
            thread
          });
          this.client.lastCheckedTweetId = BigInt(tweet.id);
        }
      }
      await this.client.cacheLatestCheckedTweetId();
      this.logger.log("Finished checking Twitter interactions");
    } catch (error) {
      this.logger.error(error);
      this.logger.error(`Error handling Twitter interactions: ${error}`);
    }
  }
  async handleTweet({
    tweet,
    message,
    thread
  }) {
    if (tweet.userId === this.client.profile.id && !this.client.twitterConfig.TWITTER_TARGET_USERS.includes(tweet.username)) {
      return;
    }
    if (!message.content.text) {
      this.logger.log("Skipping Tweet with no text", tweet.id);
      return { text: "", action: "IGNORE" };
    }
    this.logger.log("Processing Tweet: ", tweet.id);
    const formatTweet = (tweet2) => {
      return `  ID: ${tweet2.id}
  From: ${tweet2.name} (@${tweet2.username})
  Text: ${tweet2.text}`;
    };
    const currentPost = formatTweet(tweet);
    const formattedConversation = thread.map(
      (tweet2) => `@${tweet2.username} (${new Date(
        tweet2.timestamp * 1e3
      ).toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric"
      })}):
        ${tweet2.text}`
    ).join("\n\n");
    const imageDescriptionsArray = [];
    try {
      for (const photo of tweet.photos) {
        const description = await this.runtime.getService(ServiceType.IMAGE_DESCRIPTION).describeImage(photo.url);
        imageDescriptionsArray.push(description);
      }
    } catch (error) {
      this.logger.error("Error Occured during describing image: ", error);
    }
    let state = await this.runtime.composeState(message, {
      twitterClient: this.client.twitterClient,
      twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
      currentPost,
      formattedConversation,
      imageDescriptions: imageDescriptionsArray.length > 0 ? `
Images in Tweet:
${imageDescriptionsArray.map(
        (desc, i) => `Image ${i + 1}: Title: ${desc.title}
Description: ${desc.description}`
      ).join("\n\n")}` : ""
    });
    const tweetId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
    const tweetExists = await this.runtime.messageManager.getMemoryById(tweetId);
    if (!tweetExists) {
      this.logger.log("tweet does not exist, saving");
      const userIdUUID = stringToUuid3(tweet.userId);
      const roomId = stringToUuid3(tweet.conversationId);
      const message2 = {
        id: tweetId,
        agentId: this.runtime.agentId,
        content: {
          text: tweet.text,
          url: tweet.permanentUrl,
          imageUrls: tweet.photos?.map((photo) => photo.url) || [],
          inReplyTo: tweet.inReplyToStatusId ? stringToUuid3(tweet.inReplyToStatusId + "-" + this.runtime.agentId) : void 0
        },
        userId: userIdUUID,
        roomId,
        createdAt: tweet.timestamp * 1e3
      };
      this.client.saveRequestMessage(message2, state);
    }
    const validTargetUsersStr = this.client.twitterConfig.TWITTER_TARGET_USERS.join(",");
    const shouldRespondContext = composeContext({
      state,
      template: this.runtime.character.templates?.twitterShouldRespondTemplate || this.runtime.character?.templates?.shouldRespondTemplate || twitterShouldRespondTemplate(validTargetUsersStr)
    });
    const shouldRespond = await generateShouldRespond({
      runtime: this.runtime,
      context: shouldRespondContext,
      modelClass: ModelClass.MEDIUM
    });
    if (shouldRespond !== "RESPOND") {
      this.logger.log("Not responding to message");
      return { text: "Response Decision:", action: shouldRespond };
    }
    const context = composeContext({
      state: {
        ...state,
        // Convert actionNames array to string
        actionNames: Array.isArray(state.actionNames) ? state.actionNames.join(", ") : state.actionNames || "",
        actions: Array.isArray(state.actions) ? state.actions.join("\n") : state.actions || "",
        // Ensure character examples are included
        characterPostExamples: this.runtime.character.messageExamples ? this.runtime.character.messageExamples.map(
          (example) => example.map(
            (msg) => `${msg.user}: ${msg.content.text}${msg.content.action ? ` [Action: ${msg.content.action}]` : ""}`
          ).join("\n")
        ).join("\n\n") : ""
      },
      template: this.runtime.character.templates?.twitterMessageHandlerTemplate || this.runtime.character?.templates?.messageHandlerTemplate || twitterMessageHandlerTemplate
    });
    const response = await generateMessageResponse({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.LARGE
    });
    const removeQuotes = (str) => str.replace(/^['"](.*)['"]$/, "$1");
    const stringId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
    response.inReplyTo = stringId;
    response.text = removeQuotes(response.text);
    if (response.text) {
      if (this.isDryRun) {
        this.logger.info(
          `Dry run: Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}
Agent's Output:
${response.text}`
        );
      } else {
        try {
          const callback = async (response2, tweetId2) => {
            const memories = await sendTweet(
              this.client,
              response2,
              message.roomId,
              this.client.twitterConfig.TWITTER_USERNAME,
              tweetId2 || tweet.id
            );
            return memories;
          };
          const action = this.runtime.actions.find(
            (a) => a.name === response.action
          );
          const shouldSuppressInitialMessage = action?.suppressInitialMessage;
          let responseMessages = [];
          if (!shouldSuppressInitialMessage) {
            responseMessages = await callback(response);
          } else {
            responseMessages = [
              {
                id: stringToUuid3(tweet.id + "-" + this.runtime.agentId),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                content: response,
                roomId: message.roomId,
                embedding: getEmbeddingZeroVector3(),
                createdAt: Date.now()
              }
            ];
          }
          state = await this.runtime.updateRecentMessageState(state);
          for (const responseMessage of responseMessages) {
            if (responseMessage === responseMessages[responseMessages.length - 1]) {
              responseMessage.content.action = response.action;
            } else {
              responseMessage.content.action = "CONTINUE";
            }
            await this.runtime.messageManager.createMemory(responseMessage);
          }
          const responseTweetId = responseMessages[responseMessages.length - 1]?.content?.tweetId;
          await this.runtime.processActions(
            message,
            responseMessages,
            state,
            (response2) => {
              return callback(response2, responseTweetId);
            }
          );
          const responseInfo = `Context:

${context}

Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}
Agent's Output:
${response.text}`;
          await this.runtime.cacheManager.set(
            `twitter/tweet_generation_${tweet.id}.txt`,
            responseInfo
          );
          await wait();
        } catch (error) {
          this.logger.error(`Error sending response tweet: ${error}`);
        }
      }
    }
  }
  async buildConversationThread(tweet, maxReplies = 10) {
    const thread = [];
    const visited = /* @__PURE__ */ new Set();
    async function processThread(currentTweet, depth = 0) {
      this.logger.log("Processing tweet:", {
        id: currentTweet.id,
        inReplyToStatusId: currentTweet.inReplyToStatusId,
        depth
      });
      if (!currentTweet) {
        this.logger.log("No current tweet found for thread building");
        return;
      }
      if (depth >= maxReplies) {
        this.logger.log("Reached maximum reply depth", depth);
        return;
      }
      const memory = await this.runtime.messageManager.getMemoryById(
        stringToUuid3(currentTweet.id + "-" + this.runtime.agentId)
      );
      if (!memory) {
        const roomId = stringToUuid3(
          currentTweet.conversationId + "-" + this.runtime.agentId
        );
        const userId = stringToUuid3(currentTweet.userId);
        await this.runtime.ensureConnection(
          userId,
          roomId,
          currentTweet.username,
          currentTweet.name,
          "twitter"
        );
        this.runtime.messageManager.createMemory({
          id: stringToUuid3(currentTweet.id + "-" + this.runtime.agentId),
          agentId: this.runtime.agentId,
          content: {
            text: currentTweet.text,
            source: "twitter",
            url: currentTweet.permanentUrl,
            imageUrls: currentTweet.photos?.map((photo) => photo.url) || [],
            inReplyTo: currentTweet.inReplyToStatusId ? stringToUuid3(
              currentTweet.inReplyToStatusId + "-" + this.runtime.agentId
            ) : void 0
          },
          createdAt: currentTweet.timestamp * 1e3,
          roomId,
          userId: currentTweet.userId === this.twitterUserId ? this.runtime.agentId : stringToUuid3(currentTweet.userId),
          embedding: getEmbeddingZeroVector3()
        });
      }
      if (visited.has(currentTweet.id)) {
        this.logger.log("Already visited tweet:", currentTweet.id);
        return;
      }
      visited.add(currentTweet.id);
      thread.unshift(currentTweet);
      if (currentTweet.inReplyToStatusId) {
        this.logger.log(
          "Fetching parent tweet:",
          currentTweet.inReplyToStatusId
        );
        try {
          const parentTweet = await this.twitterClient.getTweet(
            currentTweet.inReplyToStatusId
          );
          if (parentTweet) {
            this.logger.log("Found parent tweet:", {
              id: parentTweet.id,
              text: parentTweet.text?.slice(0, 50)
            });
            await processThread(parentTweet, depth + 1);
          } else {
            this.logger.log(
              "No parent tweet found for:",
              currentTweet.inReplyToStatusId
            );
          }
        } catch (error) {
          this.logger.log("Error fetching parent tweet:", {
            tweetId: currentTweet.inReplyToStatusId,
            error
          });
        }
      } else {
        this.logger.log("Reached end of reply chain at:", currentTweet.id);
      }
    }
    await processThread.bind(this)(tweet, 0);
    return thread;
  }
};

// src/post.ts
import {
  composeContext as composeContext2,
  generateText,
  getEmbeddingZeroVector as getEmbeddingZeroVector4,
  ModelClass as ModelClass2,
  stringToUuid as stringToUuid4,
  truncateToCompleteSentence,
  parseJSONObjectFromText,
  extractAttributes,
  cleanJsonResponse
} from "@elizaos/core";
import { postActionResponseFooter } from "@elizaos/core";
import { generateTweetActions } from "@elizaos/core";
import { ServiceType as ServiceType2 } from "@elizaos/core";
import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  Partials
} from "discord.js";

// src/monitor/metrics.ts
import client from "prom-client";
var prefix = "client_twitter_";
var twitterAccountStatus = new client.Gauge({
  name: `${prefix}twitter_account_status`,
  help: "twitter account running status, 0 stopped, 1 running, 2 stopping",
  // registers: [register],
  labelNames: ["twitterName", "ip"]
});
var twitterPostInterval = new client.Gauge({
  name: `${prefix}twitter_post_interval`,
  help: "max post interval in minutes",
  // registers: [register],
  labelNames: ["twitterName"]
});
var twitterPostCount = new client.Counter({
  name: `${prefix}twitter_post_count`,
  help: "post count",
  // registers: [register],
  labelNames: ["twitterName"]
});

// src/post.ts
var MAX_TIMELINES_TO_FETCH = 15;
var twitterPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should be 1, 2, or 3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. No emojis. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.`;
var twitterActionTemplate = `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[LIKE] - Perfect topic match AND aligns with character (9.8/10)
[RETWEET] - Exceptional content that embodies character's expertise (9.5/10)
[QUOTE] - Can add substantial domain expertise (9.5/10)
[REPLY] - Can contribute meaningful, expert-level insight (9.5/10)

Tweet:
{{currentTweet}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance.` + postActionResponseFooter;
var RuntimeTwitterPostHelper = class {
  constructor(runtime, logger) {
    this.runtime = runtime;
    this.logger = logger;
  }
  /**
   * Generates and posts a new tweet. If isDryRun is true, only logs what would have been posted.
   */
  async generatePostTweet(username, max_tweet_length) {
    const roomId = stringToUuid4("twitter_generate_room-" + username);
    const topics = this.runtime.character.topics.join(", ");
    const maxTweetLength = Math.floor(max_tweet_length * 4 / 5);
    let tokenTweets;
    if (this.runtime.character.topics.includes("crypto currency news")) {
      const trendingTokens = await getTrendingTokens(
        this.runtime.getSetting("BIRDEYE_API_KEY")
      );
      for (const item of trendingTokens) {
        const itemKey = "token:analysis:" + item.symbol;
        const postTime = await this.runtime.cacheManager.get(itemKey);
        if (postTime && Date.now() - postTime < 1e3 * 60 * 60 * 12) {
          continue;
        }
        const pumpNewsApikey = this.runtime.getSetting("PUMPNEWS_API_KEY") || process.env?.PUMPNEWS_API_KEY;
        const tweets = await fetchPumpNews(pumpNewsApikey, item.address);
        if (!tweets || tweets.length < 8) {
          continue;
        }
        tokenTweets = {
          symbol: item.symbol,
          tweetContents: tweets.map((tweet) => tweet.text)
        };
        Logger.log(
          `Found trending token:, ${item.symbol} with ${tweets.length} tweets`
        );
        await this.runtime.cacheManager.set(itemKey, Date.now());
        break;
      }
    }
    const state = await this.runtime.composeState(
      {
        userId: this.runtime.agentId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          text: topics || "",
          action: "TWEET"
        }
      },
      {
        twitterUserName: username,
        maxTweetLength,
        tokenSymbol: tokenTweets?.symbol,
        tweetContents: tokenTweets?.tweetContents
      }
    );
    const context = composeContext2({
      state,
      template: this.runtime.character.templates?.twitterPostTemplate || twitterPostTemplate
    });
    this.logger.debug("generate post prompt:\n" + context);
    const response = await generateText({
      runtime: this.runtime,
      context,
      modelClass: ModelClass2.SMALL
    });
    const rawTweetContent = cleanJsonResponse(response);
    let tweetTextForPosting = null;
    let mediaData = null;
    const parsedResponse = parseJSONObjectFromText(rawTweetContent);
    if (parsedResponse?.text) {
      tweetTextForPosting = parsedResponse.text;
    } else {
      tweetTextForPosting = rawTweetContent.trim();
    }
    if (parsedResponse?.attachments && parsedResponse?.attachments.length > 0) {
      mediaData = await fetchMediaData(parsedResponse.attachments);
    }
    if (!tweetTextForPosting) {
      const parsingText = extractAttributes(rawTweetContent, ["text"]).text;
      if (parsingText) {
        tweetTextForPosting = truncateToCompleteSentence(
          extractAttributes(rawTweetContent, ["text"]).text,
          max_tweet_length
        );
      }
    }
    if (!tweetTextForPosting) {
      tweetTextForPosting = rawTweetContent;
    }
    if (maxTweetLength) {
      tweetTextForPosting = truncateToCompleteSentence(
        tweetTextForPosting,
        maxTweetLength
      );
    }
    const removeQuotes = (str) => str.replace(/^['"](.*)['"]$/, "$1");
    const fixNewLines = (str) => str.replaceAll(/\\n/g, "\n\n");
    tweetTextForPosting = removeQuotes(fixNewLines(tweetTextForPosting));
    return { tweetTextForPosting, rawTweetContent, mediaData, roomId };
  }
};
var TwitterPostClient = class {
  client;
  runtime;
  twitterUsername;
  isProcessing = false;
  lastProcessTime = 0;
  isDryRun;
  discordClientForApproval;
  approvalRequired = false;
  discordApprovalChannelId;
  approvalCheckInterval;
  runPendingTweetCheckInterval;
  runtimeTwitterPostHelper;
  backendTaskStatus = {
    generateNewTweet: 2,
    processTweetActions: 2,
    runPendingTweetCheck: 2
  };
  logger;
  constructor(client2, runtime) {
    this.client = client2;
    this.runtime = runtime;
    this.logger = client2.logger;
    this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
    this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    this.runtimeTwitterPostHelper = new RuntimeTwitterPostHelper(
      this.runtime,
      this.logger
    );
    this.logger.log(
      `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
    );
    this.logger.log(
      `- Enable Post: ${this.client.twitterConfig.ENABLE_TWITTER_POST_GENERATION ? "enabled" : "disabled"}`
    );
    this.logger.log(
      `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
    );
    this.logger.log(
      `- Action Processing: ${this.client.twitterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`
    );
    this.logger.log(
      `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
    );
    this.logger.log(
      `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
    );
    this.logger.log(
      `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
    );
    const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
    if (targetUsers) {
      this.logger.log(`- Target Users: ${targetUsers}`);
    }
    if (this.isDryRun) {
      this.logger.log(
        "Twitter client initialized in dry run mode - no actual tweets should be posted"
      );
    }
    const approvalRequired = this.runtime.getSetting("TWITTER_APPROVAL_ENABLED")?.toLocaleLowerCase() === "true";
    if (approvalRequired) {
      const discordToken = this.runtime.getSetting(
        "TWITTER_APPROVAL_DISCORD_BOT_TOKEN"
      );
      const approvalChannelId = this.runtime.getSetting(
        "TWITTER_APPROVAL_DISCORD_CHANNEL_ID"
      );
      const APPROVAL_CHECK_INTERVAL = Number.parseInt(
        this.runtime.getSetting("TWITTER_APPROVAL_CHECK_INTERVAL")
      ) || 5 * 60 * 1e3;
      this.approvalCheckInterval = APPROVAL_CHECK_INTERVAL;
      if (!discordToken || !approvalChannelId) {
        throw new Error(
          "TWITTER_APPROVAL_DISCORD_BOT_TOKEN and TWITTER_APPROVAL_DISCORD_CHANNEL_ID are required for approval workflow"
        );
      }
      this.approvalRequired = true;
      this.discordApprovalChannelId = approvalChannelId;
      this.setupDiscordClient();
    }
  }
  setupDiscordClient() {
    this.discordClientForApproval = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction]
    });
    this.discordClientForApproval.once(Events.ClientReady, (readyClient) => {
      this.logger.log(`Discord bot is ready as ${readyClient.user.tag}!`);
      const invite = `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user.id}&permissions=274877991936&scope=bot`;
      this.logger.log(
        `Use this link to properly invite the Twitter Post Approval Discord bot: ${invite}`
      );
    });
    this.discordClientForApproval.login(
      this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_BOT_TOKEN")
    );
  }
  async start() {
    if (!this.client.profile) {
      await this.client.init();
    }
    const generateNewTweetLoop = async () => {
      if (this.backendTaskStatus.generateNewTweet === 0) return;
      this.backendTaskStatus.generateNewTweet = 1;
      const lastPost = await this.runtime.cacheManager.get(`twitter/${this.client.profile.username}/lastPost`);
      const lastPostTimestamp = lastPost?.timestamp ?? 0;
      const minMinutes = this.client.twitterConfig.POST_INTERVAL_MIN;
      const maxMinutes = this.client.twitterConfig.POST_INTERVAL_MAX;
      const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
      const delay = randomMinutes * 60 * 1e3;
      while (Date.now() <= lastPostTimestamp + delay) {
        await new Promise((resolve) => setTimeout(resolve, 60 * 1e3));
      }
      await this.generateNewTweet();
      this.backendTaskStatus.generateNewTweet = 2;
      setTimeout(() => {
        generateNewTweetLoop().catch((err) => {
          this.logger.error("Error in generateNewTweetLoop:", err);
        });
      }, delay);
      this.logger.info(`Next tweet scheduled in ${randomMinutes} minutes`);
    };
    const processActionsLoop = async () => {
      const actionInterval = this.client.twitterConfig.ACTION_INTERVAL;
      while (!(this.backendTaskStatus.processTweetActions === 0)) {
        try {
          this.backendTaskStatus.processTweetActions = 1;
          const results = await this.processTweetActions();
          this.backendTaskStatus.processTweetActions = 2;
          if (results) {
            this.logger.log(`Processed ${results.length} tweets`);
            this.logger.log(
              `Next action processing scheduled in ${actionInterval} minutes`
            );
            await new Promise(
              (resolve) => setTimeout(resolve, actionInterval * 60 * 1e3)
              // now in minutes
            );
          }
        } catch (error) {
          this.logger.error("Error in action processing loop:", error);
          await new Promise((resolve) => setTimeout(resolve, 3e4));
        }
      }
    };
    if (this.client.twitterConfig.POST_IMMEDIATELY) {
      await this.generateNewTweet();
    }
    if (this.client.twitterConfig.ENABLE_TWITTER_POST_GENERATION) {
      generateNewTweetLoop();
      this.logger.info("Tweet generation loop started");
    }
    if (this.client.twitterConfig.ENABLE_ACTION_PROCESSING) {
      processActionsLoop().catch((error) => {
        this.logger.error("Fatal error in process actions loop:", error);
      });
    }
    if (this.approvalRequired) this.runPendingTweetCheckLoop();
  }
  runPendingTweetCheckLoop() {
    const interval = setInterval(async () => {
      this.backendTaskStatus.runPendingTweetCheck = 1;
      await this.handlePendingTweet();
      this.backendTaskStatus.runPendingTweetCheck = 2;
    }, this.approvalCheckInterval);
    this.runPendingTweetCheckInterval = interval;
  }
  createTweetObject(tweetResult, client2, twitterUsername) {
    return {
      id: tweetResult.rest_id,
      name: client2.profile.screenName,
      username: client2.profile.username,
      text: tweetResult.legacy.full_text,
      conversationId: tweetResult.legacy.conversation_id_str,
      createdAt: tweetResult.legacy.created_at,
      timestamp: new Date(tweetResult.legacy.created_at).getTime(),
      userId: client2.profile.id,
      inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
      permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
      hashtags: [],
      mentions: [],
      photos: [],
      thread: [],
      urls: [],
      videos: []
    };
  }
  async processAndCacheTweet(runtime, client2, tweet, roomId, rawTweetContent) {
    await runtime.cacheManager.set(
      `twitter/${client2.profile.username}/lastPost`,
      {
        id: tweet.id,
        timestamp: Date.now()
      }
    );
    await client2.runtimeHelper.cacheTweet(tweet);
    this.logger.log(`Tweet posted:
 ${tweet.permanentUrl}`);
    await runtime.ensureRoomExists(roomId);
    await runtime.ensureParticipantInRoom(runtime.agentId, roomId);
    await runtime.messageManager.createMemory({
      id: stringToUuid4(tweet.id + "-" + runtime.agentId),
      userId: runtime.agentId,
      agentId: runtime.agentId,
      content: {
        text: rawTweetContent.trim(),
        url: tweet.permanentUrl,
        source: "twitter"
      },
      roomId,
      embedding: getEmbeddingZeroVector4(),
      createdAt: tweet.timestamp
    });
  }
  async handleNoteTweet(client2, content, tweetId, mediaData) {
    try {
      const noteTweetResult = await client2.requestQueue.add(
        async () => await client2.twitterClient.sendNoteTweet(content, tweetId, mediaData)
      );
      if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
        const truncateContent = truncateToCompleteSentence(
          content,
          this.client.twitterConfig.MAX_TWEET_LENGTH
        );
        return await this.sendStandardTweet(client2, truncateContent, tweetId);
      } else {
        return noteTweetResult.data.notetweet_create.tweet_results.result;
      }
    } catch (error) {
      throw new Error(`Note Tweet failed: ${error}`);
    }
  }
  async sendStandardTweet(client2, content, tweetId, mediaData) {
    try {
      const standardTweetResult = await client2.requestQueue.add(
        async () => await client2.twitterClient.sendTweet(content, tweetId, mediaData)
      );
      const body = await standardTweetResult.json();
      if (!body?.data?.create_tweet?.tweet_results?.result) {
        const errorCode = body?.errors?.[0]?.code;
        if (errorCode === 187) {
          this.logger.warn(
            `Authorization: Status is a duplicate. (187), content: ${content}`
          );
        } else {
          this.logger.error("Error sending tweet; Bad response:", body);
          this.logger.error(
            `Error sending tweet; contentLen: ${content.length}, content: ${content}`
          );
        }
        return;
      }
      return body.data.create_tweet.tweet_results.result;
    } catch (error) {
      this.logger.error("Error sending standard Tweet:", error);
      throw error;
    }
  }
  async postTweet(runtime, client2, tweetTextForPosting, roomId, rawTweetContent, twitterUsername, mediaData) {
    try {
      this.logger.log(`Posting new tweet:
`);
      let result;
      if (tweetTextForPosting.length > DEFAULT_MAX_TWEET_LENGTH) {
        result = await this.handleNoteTweet(
          client2,
          tweetTextForPosting,
          void 0,
          mediaData
        );
      } else {
        result = await this.sendStandardTweet(
          client2,
          tweetTextForPosting,
          void 0,
          mediaData
        );
      }
      if (result === void 0) {
        this.logger.error("Error sending tweet; result is undefined");
        return;
      }
      twitterPostCount.labels(twitterUsername).inc();
      const tweet = this.createTweetObject(result, client2, twitterUsername);
      await this.processAndCacheTweet(
        runtime,
        client2,
        tweet,
        roomId,
        rawTweetContent
      );
    } catch (error) {
      this.logger.error("postTweet Error sending tweet:", error);
    }
  }
  /**
   * Generates and posts a new tweet. If isDryRun is true, only logs what would have been posted.
   */
  async generateNewTweet() {
    try {
      this.logger.log("generatePostTweet start");
      let postTweet = await this.runtimeTwitterPostHelper.generatePostTweet(
        this.client.profile.username,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
      this.logger.log("generatePostTweet end");
      const lastPost = await this.runtime.cacheManager.get(`twitter/${this.client.profile.username}/lastPost`);
      if (lastPost && lastPost.id) {
        const lastPostContent = await this.runtime.messageManager.getMemoryById(
          stringToUuid4(lastPost.id + "-" + this.runtime.agentId)
        );
        if (lastPostContent?.content.text === postTweet.tweetTextForPosting) {
          this.logger.warn(
            `The tweet content is the same as the last post, skipping: ${postTweet.tweetTextForPosting}`
          );
          postTweet = await this.runtimeTwitterPostHelper.generatePostTweet(
            this.client.profile.username,
            this.client.twitterConfig.MAX_TWEET_LENGTH
          );
        }
      }
      if (this.isDryRun) {
        this.logger.info(
          `Dry run: would have posted tweet: ${postTweet.tweetTextForPosting}`
        );
        return;
      }
      this.logger.log("postTweet start");
      if (this.approvalRequired) {
        this.logger.log(
          `Sending Tweet For Approval:
 ${postTweet.tweetTextForPosting}`
        );
        await this.sendForApproval(
          postTweet.tweetTextForPosting,
          postTweet.roomId,
          postTweet.rawTweetContent
        );
        this.logger.log("Tweet sent for approval");
      } else {
        this.logger.log(
          `Posting new tweet:
 ${postTweet.tweetTextForPosting}`
        );
        this.postTweet(
          this.runtime,
          this.client,
          postTweet.tweetTextForPosting,
          postTweet.roomId,
          postTweet.rawTweetContent,
          this.twitterUsername,
          postTweet.mediaData
        ).catch((error) => {
          this.logger.error("Error posting tweet:", error);
        });
      }
      this.logger.log("postTweet end");
    } catch (error) {
      this.logger.error("Error generateNewTweet:", error);
    }
  }
  async generateTweetContent(tweetState, options) {
    const context = composeContext2({
      state: tweetState,
      template: options?.template || this.runtime.character.templates?.twitterPostTemplate || twitterPostTemplate
    });
    const response = await generateText({
      runtime: this.runtime,
      context: options?.context || context,
      modelClass: ModelClass2.SMALL
    });
    this.logger.log("generate tweet content response:\n" + response);
    const cleanedResponse = cleanJsonResponse(response);
    const jsonResponse = parseJSONObjectFromText(cleanedResponse);
    if (jsonResponse.text) {
      const truncateContent2 = truncateToCompleteSentence(
        jsonResponse.text,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
      return truncateContent2;
    }
    if (typeof jsonResponse === "object") {
      const possibleContent = jsonResponse.content || jsonResponse.message || jsonResponse.response;
      if (possibleContent) {
        const truncateContent2 = truncateToCompleteSentence(
          possibleContent,
          this.client.twitterConfig.MAX_TWEET_LENGTH
        );
        return truncateContent2;
      }
    }
    let truncateContent = null;
    const parsingText = extractAttributes(cleanedResponse, ["text"]).text;
    if (parsingText) {
      truncateContent = truncateToCompleteSentence(
        parsingText,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
    }
    if (!truncateContent) {
      truncateContent = truncateToCompleteSentence(
        cleanedResponse,
        this.client.twitterConfig.MAX_TWEET_LENGTH
      );
    }
    return truncateContent;
  }
  /**
   * Processes tweet actions (likes, retweets, quotes, replies). If isDryRun is true,
   * only simulates and logs actions without making API calls.
   */
  async processTweetActions() {
    if (this.isProcessing) {
      this.logger.log("Already processing tweet actions, skipping");
      return null;
    }
    try {
      this.isProcessing = true;
      this.lastProcessTime = Date.now();
      this.logger.log("Processing tweet actions");
      await this.runtime.ensureUserExists(
        this.runtime.agentId,
        this.twitterUsername,
        this.runtime.character.name,
        "twitter"
      );
      const timelines = await this.client.fetchTimelineForActions(
        MAX_TIMELINES_TO_FETCH
      );
      const maxActionsProcessing = this.client.twitterConfig.MAX_ACTIONS_PROCESSING;
      const processedTimelines = [];
      for (const tweet of timelines) {
        try {
          const memory = await this.runtime.messageManager.getMemoryById(
            stringToUuid4(tweet.id + "-" + this.runtime.agentId)
          );
          if (memory) {
            this.logger.log(`Already processed tweet ID: ${tweet.id}`);
            continue;
          }
          const roomId = stringToUuid4(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const tweetState = await this.runtime.composeState(
            {
              userId: this.runtime.agentId,
              roomId,
              agentId: this.runtime.agentId,
              content: { text: "", action: "" }
            },
            {
              twitterUserName: this.twitterUsername,
              currentTweet: `ID: ${tweet.id}
From: ${tweet.name} (@${tweet.username})
Text: ${tweet.text}`
            }
          );
          const actionContext = composeContext2({
            state: tweetState,
            template: this.runtime.character.templates?.twitterActionTemplate || twitterActionTemplate
          });
          const actionResponse = await generateTweetActions({
            runtime: this.runtime,
            context: actionContext,
            modelClass: ModelClass2.SMALL
          });
          if (!actionResponse) {
            this.logger.log(`No valid actions generated for tweet ${tweet.id}`);
            continue;
          }
          processedTimelines.push({
            tweet,
            actionResponse,
            tweetState,
            roomId
          });
        } catch (error) {
          this.logger.error(`Error processing tweet ${tweet.id}:`, error);
          continue;
        }
      }
      const sortProcessedTimeline = (arr) => {
        return arr.sort((a, b) => {
          const countTrue = (obj) => Object.values(obj).filter(Boolean).length;
          const countA = countTrue(a.actionResponse);
          const countB = countTrue(b.actionResponse);
          if (countA !== countB) {
            return countB - countA;
          }
          if (a.actionResponse.like !== b.actionResponse.like) {
            return a.actionResponse.like ? -1 : 1;
          }
          return 0;
        });
      };
      const sortedTimelines = sortProcessedTimeline(processedTimelines).slice(
        0,
        maxActionsProcessing
      );
      return this.processTimelineActions(sortedTimelines);
    } catch (error) {
      this.logger.error("Error in processTweetActions:", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }
  /**
   * Processes a list of timelines by executing the corresponding tweet actions.
   * Each timeline includes the tweet, action response, tweet state, and room context.
   * Results are returned for tracking completed actions.
   *
   * @param timelines - Array of objects containing tweet details, action responses, and state information.
   * @returns A promise that resolves to an array of results with details of executed actions.
   */
  async processTimelineActions(timelines) {
    const results = [];
    for (const timeline of timelines) {
      const { actionResponse, tweetState, roomId, tweet } = timeline;
      try {
        const executedActions = [];
        if (actionResponse.like) {
          if (this.isDryRun) {
            this.logger.info(`Dry run: would have liked tweet ${tweet.id}`);
            executedActions.push("like (dry run)");
          } else {
            try {
              await this.client.twitterClient.likeTweet(tweet.id);
              executedActions.push("like");
              this.logger.log(`Liked tweet ${tweet.id}`);
            } catch (error) {
              this.logger.error(`Error liking tweet ${tweet.id}:`, error);
            }
          }
        }
        if (actionResponse.retweet) {
          if (this.isDryRun) {
            this.logger.info(`Dry run: would have retweeted tweet ${tweet.id}`);
            executedActions.push("retweet (dry run)");
          } else {
            try {
              await this.client.twitterClient.retweet(tweet.id);
              executedActions.push("retweet");
              this.logger.log(`Retweeted tweet ${tweet.id}`);
            } catch (error) {
              this.logger.error(`Error retweeting tweet ${tweet.id}:`, error);
            }
          }
        }
        if (actionResponse.quote) {
          try {
            const thread = await buildConversationThread(tweet, this.client);
            const formattedConversation = thread.map(
              (t) => `@${t.username} (${new Date(
                t.timestamp * 1e3
              ).toLocaleString()}): ${t.text}`
            ).join("\n\n");
            const imageDescriptions = [];
            if (tweet.photos?.length > 0) {
              this.logger.log("Processing images in tweet for context");
              for (const photo of tweet.photos) {
                const description = await this.runtime.getService(
                  ServiceType2.IMAGE_DESCRIPTION
                ).describeImage(photo.url);
                imageDescriptions.push(description);
              }
            }
            let quotedContent = "";
            if (tweet.quotedStatusId) {
              try {
                const quotedTweet = await this.client.twitterClient.getTweet(
                  tweet.quotedStatusId
                );
                if (quotedTweet) {
                  quotedContent = `
Quoted Tweet from @${quotedTweet.username}:
${quotedTweet.text}`;
                }
              } catch (error) {
                this.logger.error("Error fetching quoted tweet:", error);
              }
            }
            const enrichedState = await this.runtime.composeState(
              {
                userId: this.runtime.agentId,
                roomId: stringToUuid4(
                  tweet.conversationId + "-" + this.runtime.agentId
                ),
                agentId: this.runtime.agentId,
                content: {
                  text: tweet.text,
                  action: "QUOTE"
                }
              },
              {
                twitterUserName: this.twitterUsername,
                currentPost: `From @${tweet.username}: ${tweet.text}`,
                formattedConversation,
                imageContext: imageDescriptions.length > 0 ? `
Images in Tweet:
${imageDescriptions.map((desc, i) => `Image ${i + 1}: ${desc}`).join("\n")}` : "",
                quotedContent
              }
            );
            const quoteContent = await this.generateTweetContent(
              enrichedState,
              {
                template: this.runtime.character.templates?.twitterMessageHandlerTemplate || twitterMessageHandlerTemplate
              }
            );
            if (!quoteContent) {
              this.logger.error("Failed to generate valid quote tweet content");
              return;
            }
            this.logger.log("Generated quote tweet content:", quoteContent);
            if (this.isDryRun) {
              this.logger.info(
                `Dry run: A quote tweet for tweet ID ${tweet.id} would have been posted with the following content: "${quoteContent}".`
              );
              executedActions.push("quote (dry run)");
            } else {
              const result = await this.client.requestQueue.add(
                async () => await this.client.twitterClient.sendQuoteTweet(
                  quoteContent,
                  tweet.id
                )
              );
              const body = await result.json();
              if (body?.data?.create_tweet?.tweet_results?.result) {
                this.logger.log("Successfully posted quote tweet");
                executedActions.push("quote");
                await this.runtime.cacheManager.set(
                  `twitter/quote_generation_${tweet.id}.txt`,
                  `Context:
${enrichedState}

Generated Quote:
${quoteContent}`
                );
              } else {
                this.logger.error("Quote tweet creation failed:", body);
              }
            }
          } catch (error) {
            this.logger.error("Error in quote tweet generation:", error);
          }
        }
        if (actionResponse.reply) {
          try {
            await this.handleTextOnlyReply(tweet, tweetState, executedActions);
          } catch (error) {
            this.logger.error(`Error replying to tweet ${tweet.id}:`, error);
          }
        }
        await this.runtime.ensureRoomExists(roomId);
        await this.runtime.ensureUserExists(
          stringToUuid4(tweet.userId),
          tweet.username,
          tweet.name,
          "twitter"
        );
        await this.runtime.ensureParticipantInRoom(
          this.runtime.agentId,
          roomId
        );
        if (!this.isDryRun) {
          await this.runtime.messageManager.createMemory({
            id: stringToUuid4(tweet.id + "-" + this.runtime.agentId),
            userId: stringToUuid4(tweet.userId),
            content: {
              text: tweet.text,
              url: tweet.permanentUrl,
              source: "twitter",
              action: executedActions.join(",")
            },
            agentId: this.runtime.agentId,
            roomId,
            embedding: getEmbeddingZeroVector4(),
            createdAt: tweet.timestamp * 1e3
          });
        }
        results.push({
          tweetId: tweet.id,
          actionResponse,
          executedActions
        });
      } catch (error) {
        this.logger.error(`Error processing tweet ${tweet.id}:`, error);
        continue;
      }
    }
    return results;
  }
  /**
   * Handles text-only replies to tweets. If isDryRun is true, only logs what would
   * have been replied without making API calls.
   */
  async handleTextOnlyReply(tweet, tweetState, executedActions) {
    try {
      const thread = await buildConversationThread(tweet, this.client);
      const formattedConversation = thread.map(
        (t) => `@${t.username} (${new Date(
          t.timestamp * 1e3
        ).toLocaleString()}): ${t.text}`
      ).join("\n\n");
      const imageDescriptions = [];
      if (tweet.photos?.length > 0) {
        this.logger.log("Processing images in tweet for context");
        for (const photo of tweet.photos) {
          const description = await this.runtime.getService(ServiceType2.IMAGE_DESCRIPTION).describeImage(photo.url);
          imageDescriptions.push(description);
        }
      }
      let quotedContent = "";
      if (tweet.quotedStatusId) {
        try {
          const quotedTweet = await this.client.twitterClient.getTweet(
            tweet.quotedStatusId
          );
          if (quotedTweet) {
            quotedContent = `
Quoted Tweet from @${quotedTweet.username}:
${quotedTweet.text}`;
          }
        } catch (error) {
          this.logger.error("Error fetching quoted tweet:", error);
        }
      }
      const enrichedState = await this.runtime.composeState(
        {
          userId: this.runtime.agentId,
          roomId: stringToUuid4(
            tweet.conversationId + "-" + this.runtime.agentId
          ),
          agentId: this.runtime.agentId,
          content: { text: tweet.text, action: "" }
        },
        {
          twitterUserName: this.twitterUsername,
          currentPost: `From @${tweet.username}: ${tweet.text}`,
          formattedConversation,
          imageContext: imageDescriptions.length > 0 ? `
Images in Tweet:
${imageDescriptions.map((desc, i) => `Image ${i + 1}: ${desc}`).join("\n")}` : "",
          quotedContent
        }
      );
      const replyText = await this.generateTweetContent(enrichedState, {
        template: this.runtime.character.templates?.twitterMessageHandlerTemplate || twitterMessageHandlerTemplate
      });
      if (!replyText) {
        this.logger.error("Failed to generate valid reply content");
        return;
      }
      if (this.isDryRun) {
        this.logger.info(
          `Dry run: reply to tweet ${tweet.id} would have been: ${replyText}`
        );
        executedActions.push("reply (dry run)");
        return;
      }
      this.logger.debug("Final reply text to be sent:", replyText);
      let result;
      if (replyText.length > DEFAULT_MAX_TWEET_LENGTH) {
        result = await this.handleNoteTweet(this.client, replyText, tweet.id);
      } else {
        result = await this.sendStandardTweet(this.client, replyText, tweet.id);
      }
      if (result) {
        this.logger.log("Successfully posted reply tweet");
        executedActions.push("reply");
        await this.runtime.cacheManager.set(
          `twitter/reply_generation_${tweet.id}.txt`,
          `Context:
${enrichedState}

Generated Reply:
${replyText}`
        );
      } else {
        this.logger.error("Tweet reply creation failed");
      }
    } catch (error) {
      this.logger.error("Error in handleTextOnlyReply:", error);
    }
  }
  // if false, should stop again
  async stop() {
    if (this.backendTaskStatus.generateNewTweet === 2) {
      this.backendTaskStatus.generateNewTweet = 0;
      this.logger.info(`${this.twitterUsername} task generateNewTweet stopped`);
    } else if (this.backendTaskStatus.generateNewTweet === 0) {
    } else {
      return false;
    }
    if (this.backendTaskStatus.processTweetActions === 2) {
      this.backendTaskStatus.processTweetActions = 0;
      this.logger.info(
        `${this.twitterUsername} task processTweetActions stopped`
      );
    } else if (this.backendTaskStatus.processTweetActions === 0) {
    } else {
      return false;
    }
    if (this.runPendingTweetCheckInterval) {
      clearInterval(this.runPendingTweetCheckInterval);
      this.runPendingTweetCheckInterval = null;
      this.backendTaskStatus.runPendingTweetCheck = 0;
      this.logger.info(
        `${this.twitterUsername} task runPendingTweetCheckInterval stopped`
      );
    }
    return true;
  }
  async sendForApproval(tweetTextForPosting, roomId, rawTweetContent) {
    try {
      const embed = {
        title: "New Tweet Pending Approval",
        description: tweetTextForPosting,
        fields: [
          {
            name: "Character",
            value: this.client.profile.username,
            inline: true
          },
          {
            name: "Length",
            value: tweetTextForPosting.length.toString(),
            inline: true
          }
        ],
        footer: {
          text: "Reply with '\u{1F44D}' to post or '\u274C' to discard, This will automatically expire and remove after 24 hours if no response received"
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const channel = await this.discordClientForApproval.channels.fetch(
        this.discordApprovalChannelId
      );
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error("Invalid approval channel");
      }
      const message = await channel.send({ embeds: [embed] });
      const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
      const currentPendingTweets = await this.runtime.cacheManager.get(
        pendingTweetsKey
      ) || [];
      currentPendingTweets.push({
        tweetTextForPosting,
        roomId,
        rawTweetContent,
        discordMessageId: message.id,
        channelId: this.discordApprovalChannelId,
        timestamp: Date.now()
      });
      await this.runtime.cacheManager.set(
        pendingTweetsKey,
        currentPendingTweets
      );
      return message.id;
    } catch (error) {
      this.logger.error("Error Sending Twitter Post Approval Request:", error);
      return null;
    }
  }
  async checkApprovalStatus(discordMessageId) {
    try {
      const channel = await this.discordClientForApproval.channels.fetch(
        this.discordApprovalChannelId
      );
      this.logger.log(`channel ${JSON.stringify(channel)}`);
      if (!(channel instanceof TextChannel)) {
        this.logger.error("Invalid approval channel");
        return "PENDING";
      }
      const message = await channel.messages.fetch(discordMessageId);
      const thumbsUpReaction = message.reactions.cache.find(
        (reaction) => reaction.emoji.name === "\u{1F44D}"
      );
      const rejectReaction = message.reactions.cache.find(
        (reaction) => reaction.emoji.name === "\u274C"
      );
      if (rejectReaction) {
        const count = rejectReaction.count;
        if (count > 0) {
          return "REJECTED";
        }
      }
      if (thumbsUpReaction) {
        const count = thumbsUpReaction.count;
        if (count > 0) {
          return "APPROVED";
        }
      }
      return "PENDING";
    } catch (error) {
      this.logger.error("Error checking approval status:", error);
      return "PENDING";
    }
  }
  async cleanupPendingTweet(discordMessageId) {
    const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
    const currentPendingTweets = await this.runtime.cacheManager.get(pendingTweetsKey) || [];
    const updatedPendingTweets = currentPendingTweets.filter(
      (tweet) => tweet.discordMessageId !== discordMessageId
    );
    if (updatedPendingTweets.length === 0) {
      await this.runtime.cacheManager.delete(pendingTweetsKey);
    } else {
      await this.runtime.cacheManager.set(
        pendingTweetsKey,
        updatedPendingTweets
      );
    }
  }
  async handlePendingTweet() {
    this.logger.log("Checking Pending Tweets...");
    const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
    const pendingTweets = await this.runtime.cacheManager.get(pendingTweetsKey) || [];
    for (const pendingTweet of pendingTweets) {
      const isExpired = Date.now() - pendingTweet.timestamp > 24 * 60 * 60 * 1e3;
      if (isExpired) {
        this.logger.log("Pending tweet expired, cleaning up");
        try {
          const channel = await this.discordClientForApproval.channels.fetch(
            pendingTweet.channelId
          );
          if (channel instanceof TextChannel) {
            const originalMessage = await channel.messages.fetch(
              pendingTweet.discordMessageId
            );
            await originalMessage.reply(
              "This tweet approval request has expired (24h timeout)."
            );
          }
        } catch (error) {
          this.logger.error("Error sending expiration notification:", error);
        }
        await this.cleanupPendingTweet(pendingTweet.discordMessageId);
        return;
      }
      this.logger.log("Checking approval status...");
      const approvalStatus = await this.checkApprovalStatus(pendingTweet.discordMessageId);
      if (approvalStatus === "APPROVED") {
        this.logger.log("Tweet Approved, Posting");
        await this.postTweet(
          this.runtime,
          this.client,
          pendingTweet.tweetTextForPosting,
          pendingTweet.roomId,
          pendingTweet.rawTweetContent,
          this.twitterUsername
        );
        try {
          const channel = await this.discordClientForApproval.channels.fetch(
            pendingTweet.channelId
          );
          if (channel instanceof TextChannel) {
            const originalMessage = await channel.messages.fetch(
              pendingTweet.discordMessageId
            );
            await originalMessage.reply(
              "Tweet has been posted successfully! \u2705"
            );
          }
        } catch (error) {
          this.logger.error("Error sending post notification:", error);
        }
        await this.cleanupPendingTweet(pendingTweet.discordMessageId);
      } else if (approvalStatus === "REJECTED") {
        this.logger.log("Tweet Rejected, Cleaning Up");
        await this.cleanupPendingTweet(pendingTweet.discordMessageId);
        try {
          const channel = await this.discordClientForApproval.channels.fetch(
            pendingTweet.channelId
          );
          if (channel instanceof TextChannel) {
            const originalMessage = await channel.messages.fetch(
              pendingTweet.discordMessageId
            );
            await originalMessage.reply("Tweet has been rejected! \u274C");
          }
        } catch (error) {
          this.logger.error("Error sending rejection notification:", error);
        }
      }
    }
  }
};
async function getTrendingTokens(birdeypeApiKey) {
  const url = "https://public-api.birdeye.so/defi/token_trending?sort_by=volume24hUSD&sort_type=desc&offset=0&limit=20";
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": birdeypeApiKey,
        accept: "application/json",
        "x-chain": "solana"
      }
    });
    const result = await response.json();
    return result?.data.tokens;
  } catch (error) {
    Logger.error(`Error fetching trending tokens:, error`);
    return null;
  }
}
async function fetchPumpNews(apikey, token) {
  const url = `https://api.pump.news/tweets/list?tokenAddress=${token}&pageSize=20`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "*/*",
        apikey
      }
    });
    const result = await response.json();
    return result?.data.tweets;
  } catch (e) {
    Logger.error(`Error fetching pump news: ${e}`);
    return null;
  }
}

// src/search.ts
import { SearchMode as SearchMode3 } from "agent-twitter-client";
import { composeContext as composeContext3 } from "@elizaos/core";
import { generateMessageResponse as generateMessageResponse2, generateText as generateText2 } from "@elizaos/core";
import { messageCompletionFooter as messageCompletionFooter2 } from "@elizaos/core";
import {
  ModelClass as ModelClass3,
  ServiceType as ServiceType3
} from "@elizaos/core";
import { stringToUuid as stringToUuid5 } from "@elizaos/core";
var twitterSearchTemplate = `{{timeline}}

{{providers}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{postDirections}}

{{recentPosts}}

# Task: Respond to the following post in the style and perspective of {{agentName}} (aka @{{twitterUserName}}). Write a {{adjective}} response for {{agentName}} to say directly in response to the post. don't generalize.
{{currentPost}}

IMPORTANT: Your response CANNOT be longer than 20 words.
Aim for 1-2 short sentences maximum. Be concise and direct.

Your response should not contain any questions. Brief, concise statements only. No emojis. Use \\n\\n (double spaces) between statements.

` + messageCompletionFooter2;
var TwitterSearchClient = class {
  client;
  runtime;
  twitterUsername;
  respondedTweets = /* @__PURE__ */ new Set();
  backendTaskStatus = {
    engageWithSearchTerms: 2
  };
  logger;
  constructor(client2, runtime) {
    this.client = client2;
    this.runtime = runtime;
    this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
    this.logger = client2.logger;
  }
  async stop() {
    if (this.backendTaskStatus.engageWithSearchTerms === 2) {
      this.backendTaskStatus.engageWithSearchTerms = 0;
      const twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
      this.logger.info(`${twitterUsername} task engageWithSearchTerms stopped`);
    } else if (this.backendTaskStatus.engageWithSearchTerms === 0) {
    } else {
      return false;
    }
    return true;
  }
  async start() {
    this.engageWithSearchTermsLoop();
  }
  engageWithSearchTermsLoop() {
    if (this.backendTaskStatus.engageWithSearchTerms === 0) return;
    this.backendTaskStatus.engageWithSearchTerms = 1;
    this.engageWithSearchTerms().then();
    const randomMinutes = Math.floor(Math.random() * (120 - 60 + 1)) + 60;
    this.logger.log(
      `Next twitter search scheduled in ${randomMinutes} minutes`
    );
    this.backendTaskStatus.engageWithSearchTerms = 2;
    setTimeout(
      () => this.engageWithSearchTermsLoop(),
      randomMinutes * 60 * 1e3
    );
  }
  async engageWithSearchTerms() {
    this.logger.log("Engaging with search terms");
    try {
      const searchTerm = [...this.runtime.character.topics][Math.floor(Math.random() * this.runtime.character.topics.length)];
      this.logger.log("Fetching search tweets");
      await new Promise((resolve) => setTimeout(resolve, 5e3));
      const recentTweets = await this.client.fetchSearchTweets(
        searchTerm,
        20,
        SearchMode3.Top
      );
      this.logger.log("Search tweets fetched");
      const homeTimeline = await this.client.fetchHomeTimeline(50);
      await this.client.cacheTimeline(homeTimeline);
      const formattedHomeTimeline = `# ${this.runtime.character.name}'s Home Timeline

` + homeTimeline.map((tweet) => {
        return `ID: ${tweet.id}
From: ${tweet.name} (@${tweet.username})${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}
Text: ${tweet.text}
---
`;
      }).join("\n");
      const slicedTweets = recentTweets.tweets.sort(() => Math.random() - 0.5).slice(0, 20);
      if (slicedTweets.length === 0) {
        this.logger.log(
          "No valid tweets found for the search term",
          searchTerm
        );
        return;
      }
      const prompt = `
  Here are some tweets related to the search term "${searchTerm}":

  ${[...slicedTweets, ...homeTimeline].filter((tweet) => {
        const thread = tweet.thread;
        const botTweet = thread.find((t) => t.username === this.twitterUsername);
        return !botTweet;
      }).map(
        (tweet) => `
    ID: ${tweet.id}${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}
    From: ${tweet.name} (@${tweet.username})
    Text: ${tweet.text}
  `
      ).join("\n")}

  Which tweet is the most interesting and relevant for Ruby to reply to? Please provide only the ID of the tweet in your response.
  Notes:
    - Respond to English tweets only
    - Respond to tweets that don't have a lot of hashtags, links, URLs or images
    - Respond to tweets that are not retweets
    - Respond to tweets where there is an easy exchange of ideas to have with the user
    - ONLY respond with the ID of the tweet`;
      const mostInterestingTweetResponse = await generateText2({
        runtime: this.runtime,
        context: prompt,
        modelClass: ModelClass3.SMALL
      });
      const tweetId = mostInterestingTweetResponse.trim();
      const selectedTweet = slicedTweets.find(
        (tweet) => tweet.id.toString().includes(tweetId) || tweetId.includes(tweet.id.toString())
      );
      if (!selectedTweet) {
        this.logger.warn("No matching tweet found for the selected ID");
        this.logger.log("Selected tweet ID:", tweetId);
        return;
      }
      this.logger.log("Selected tweet to reply to:", selectedTweet?.text);
      if (selectedTweet.username === this.twitterUsername) {
        this.logger.log("Skipping tweet from bot itself");
        return;
      }
      const conversationId = selectedTweet.conversationId;
      const roomId = stringToUuid5(conversationId + "-" + this.runtime.agentId);
      const userIdUUID = stringToUuid5(selectedTweet.userId);
      await this.runtime.ensureConnection(
        userIdUUID,
        roomId,
        selectedTweet.username,
        selectedTweet.name,
        "twitter"
      );
      await buildConversationThread(selectedTweet, this.client);
      const message = {
        id: stringToUuid5(selectedTweet.id + "-" + this.runtime.agentId),
        agentId: this.runtime.agentId,
        content: {
          text: selectedTweet.text,
          url: selectedTweet.permanentUrl,
          inReplyTo: selectedTweet.inReplyToStatusId ? stringToUuid5(
            selectedTweet.inReplyToStatusId + "-" + this.runtime.agentId
          ) : void 0
        },
        userId: userIdUUID,
        roomId,
        // Timestamps are in seconds, but we need them in milliseconds
        createdAt: selectedTweet.timestamp * 1e3
      };
      if (!message.content.text) {
        this.logger.warn("Returning: No response text found");
        return;
      }
      const replies = selectedTweet.thread;
      const replyContext = replies.filter((reply) => reply.username !== this.twitterUsername).map((reply) => `@${reply.username}: ${reply.text}`).join("\n");
      let tweetBackground = "";
      if (selectedTweet.isRetweet) {
        const originalTweet = await this.client.requestQueue.add(
          () => this.client.twitterClient.getTweet(selectedTweet.id)
        );
        tweetBackground = `Retweeting @${originalTweet.username}: ${originalTweet.text}`;
      }
      const imageDescriptions = [];
      for (const photo of selectedTweet.photos) {
        const description = await this.runtime.getService(ServiceType3.IMAGE_DESCRIPTION).describeImage(photo.url);
        imageDescriptions.push(description);
      }
      let state = await this.runtime.composeState(message, {
        twitterClient: this.client.twitterClient,
        twitterUserName: this.twitterUsername,
        timeline: formattedHomeTimeline,
        tweetContext: `${tweetBackground}

  Original Post:
  By @${selectedTweet.username}
  ${selectedTweet.text}${replyContext.length > 0 && `
Replies to original post:
${replyContext}`}
  ${`Original post text: ${selectedTweet.text}`}
  ${selectedTweet.urls.length > 0 ? `URLs: ${selectedTweet.urls.join(", ")}
` : ""}${imageDescriptions.length > 0 ? `
Images in Post (Described): ${imageDescriptions.join(", ")}
` : ""}
  `
      });
      await this.client.saveRequestMessage(message, state);
      const context = composeContext3({
        state,
        template: this.runtime.character.templates?.twitterSearchTemplate || twitterSearchTemplate
      });
      const responseContent = await generateMessageResponse2({
        runtime: this.runtime,
        context,
        modelClass: ModelClass3.LARGE
      });
      responseContent.inReplyTo = message.id;
      const response = responseContent;
      if (!response.text) {
        this.logger.warn("Returning: No response text found");
        return;
      }
      this.logger.log(
        `Bot would respond to tweet ${selectedTweet.id} with: ${response.text}`
      );
      try {
        const callback = async (response2) => {
          const memories = await sendTweet(
            this.client,
            response2,
            message.roomId,
            this.twitterUsername,
            selectedTweet.id
          );
          return memories;
        };
        const responseMessages = await callback(responseContent);
        state = await this.runtime.updateRecentMessageState(state);
        for (const responseMessage of responseMessages) {
          await this.runtime.messageManager.createMemory(
            responseMessage,
            false
          );
        }
        state = await this.runtime.updateRecentMessageState(state);
        await this.runtime.evaluate(message, state);
        await this.runtime.processActions(
          message,
          responseMessages,
          state,
          callback
        );
        this.respondedTweets.add(selectedTweet.id);
        const responseInfo = `Context:

${context}

Selected Post: ${selectedTweet.id} - ${selectedTweet.username}: ${selectedTweet.text}
Agent's Output:
${response.text}`;
        await this.runtime.cacheManager.set(
          `twitter/tweet_generation_${selectedTweet.id}.txt`,
          responseInfo
        );
        await wait();
      } catch (error) {
        console.error(`Error sending response post: ${error}`);
      }
    } catch (error) {
      console.error("Error engaging with search terms:", error);
    }
  }
};

// src/spaces.ts
import {
  composeContext as composeContext5,
  generateText as generateText3,
  ModelClass as ModelClass5,
  ServiceType as ServiceType4
} from "@elizaos/core";
import {
  Space,
  RecordToDiskPlugin,
  IdleMonitorPlugin
} from "agent-twitter-client";

// src/plugins/SttTtsSpacesPlugin.ts
import { spawn } from "child_process";
import {
  elizaLogger as elizaLogger3,
  stringToUuid as stringToUuid6,
  composeContext as composeContext4,
  getEmbeddingZeroVector as getEmbeddingZeroVector5,
  generateMessageResponse as generateMessageResponse3,
  ModelClass as ModelClass4,
  composeRandomUser,
  generateShouldRespond as generateShouldRespond2
} from "@elizaos/core";

// src/plugins/templates.ts
import { messageCompletionFooter as messageCompletionFooter3, shouldRespondFooter as shouldRespondFooter2 } from "@elizaos/core";
var twitterShouldRespondTemplate2 = `# Task: Decide if {{agentName}} should respond.
About {{agentName}}:
{{bio}}

# INSTRUCTIONS: Determine if {{agentName}} should respond to the message and participate in the conversation. Do not comment. Just respond with "RESPOND" or "IGNORE" or "STOP".

# RESPONSE EXAMPLES
{{user1}}: I just saw a really great movie
{{user2}}: Oh? Which movie?
Result: [IGNORE]

{{agentName}}: Oh, this is my favorite scene
{{user1}}: sick
{{user2}}: wait, why is it your favorite scene
Result: [RESPOND]

{{user1}}: stfu bot
Result: [STOP]

{{user1}}: Hey {{agent}}, can you help me with something
Result: [RESPOND]

{{user1}}: {{agentName}} stfu plz
Result: [STOP]

{{user1}}: i need help
{{agentName}}: how can I help you?
{{user1}}: no. i need help from someone else
Result: [IGNORE]

{{user1}}: Hey {{agent}}, can I ask you a question
{{agentName}}: Sure, what is it
{{user1}}: can you ask claude to create a basic react module that demonstrates a counter
Result: [RESPOND]

{{user1}}: {{agentName}} can you tell me a story
{{user1}}: about a girl named elara
{{agentName}}: Sure.
{{agentName}}: Once upon a time, in a quaint little village, there was a curious girl named Elara.
{{agentName}}: Elara was known for her adventurous spirit and her knack for finding beauty in the mundane.
{{user1}}: I'm loving it, keep going
Result: [RESPOND]

{{user1}}: {{agentName}} stop responding plz
Result: [STOP]

{{user1}}: okay, i want to test something. can you say marco?
{{agentName}}: marco
{{user1}}: great. okay, now do it again
Result: [RESPOND]

Response options are [RESPOND], [IGNORE] and [STOP].

{{agentName}} is in a room with other users and is very worried about being annoying and saying too much.
Respond with [RESPOND] to messages that are directed at {{agentName}}, or participate in conversations that are interesting or relevant to their background.
If a message is not interesting or relevant, respond with [IGNORE]
Unless directly responding to a user, respond with [IGNORE] to messages that are very short or do not contain much information.
If a user asks {{agentName}} to be quiet, respond with [STOP]
If {{agentName}} concludes a conversation and isn't part of the conversation anymore, respond with [STOP]

IMPORTANT: {{agentName}} is particularly sensitive about being annoying, so if there is any doubt, it is better to respond with [IGNORE].
If {{agentName}} is conversing with a user and they have not asked to stop, it is better to respond with [RESPOND].

{{recentMessages}}

# INSTRUCTIONS: Choose the option that best describes {{agentName}}'s response to the last message. Ignore messages if they are addressed to someone else.
` + shouldRespondFooter2;
var twitterVoiceHandlerTemplate = `# Task: Generate conversational voice dialog for {{agentName}}.
    About {{agentName}}:
    {{bio}}

    # Attachments
    {{attachments}}

    # Capabilities
    Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

    {{actions}}

    {{messageDirections}}

    {{recentMessages}}

    # Instructions: Write the next message for {{agentName}}. Include an optional action if appropriate. {{actionNames}}
    ` + messageCompletionFooter3;

// src/plugins/SttTtsSpacesPlugin.ts
var VOLUME_WINDOW_SIZE = 100;
var SPEAKING_THRESHOLD = 0.05;
var SILENCE_DETECTION_THRESHOLD_MS = 1e3;
var SttTtsPlugin = class {
  name = "SttTtsPlugin";
  description = "Speech-to-text (OpenAI) + conversation + TTS (ElevenLabs)";
  runtime;
  client;
  spaceId;
  space;
  janus;
  elevenLabsApiKey;
  voiceId = "21m00Tcm4TlvDq8ikWAM";
  elevenLabsModel = "eleven_monolingual_v1";
  chatContext = [];
  transcriptionService;
  /**
   * userId => arrayOfChunks (PCM Int16)
   */
  pcmBuffers = /* @__PURE__ */ new Map();
  /**
   * For ignoring near-silence frames (if amplitude < threshold)
   */
  silenceThreshold = 50;
  // TTS queue for sequentially speaking
  ttsQueue = [];
  isSpeaking = false;
  isProcessingAudio = false;
  userSpeakingTimer = null;
  volumeBuffers;
  ttsAbortController = null;
  onAttach(_space) {
    elizaLogger3.log("[SttTtsPlugin] onAttach => space was attached");
  }
  init(params) {
    elizaLogger3.log(
      "[SttTtsPlugin] init => Space fully ready. Subscribing to events."
    );
    this.space = params.space;
    this.janus = this.space?.janusClient;
    const config = params.pluginConfig;
    this.runtime = config?.runtime;
    this.client = config?.client;
    this.spaceId = config?.spaceId;
    this.elevenLabsApiKey = config?.elevenLabsApiKey;
    this.transcriptionService = config.transcriptionService;
    if (typeof config?.silenceThreshold === "number") {
      this.silenceThreshold = config.silenceThreshold;
    }
    if (config?.voiceId) {
      this.voiceId = config.voiceId;
    }
    if (config?.elevenLabsModel) {
      this.elevenLabsModel = config.elevenLabsModel;
    }
    if (config?.chatContext) {
      this.chatContext = config.chatContext;
    }
    this.volumeBuffers = /* @__PURE__ */ new Map();
  }
  /**
   * Called whenever we receive PCM from a speaker
   */
  onAudioData(data) {
    if (this.isProcessingAudio) {
      return;
    }
    let maxVal = 0;
    for (let i = 0; i < data.samples.length; i++) {
      const val = Math.abs(data.samples[i]);
      if (val > maxVal) maxVal = val;
    }
    if (maxVal < this.silenceThreshold) {
      return;
    }
    if (this.userSpeakingTimer) {
      clearTimeout(this.userSpeakingTimer);
    }
    let arr = this.pcmBuffers.get(data.userId);
    if (!arr) {
      arr = [];
      this.pcmBuffers.set(data.userId, arr);
    }
    arr.push(data.samples);
    if (!this.isSpeaking) {
      this.userSpeakingTimer = setTimeout(() => {
        elizaLogger3.log(
          "[SttTtsPlugin] start processing audio for user =>",
          data.userId
        );
        this.userSpeakingTimer = null;
        this.processAudio(data.userId).catch(
          (err) => elizaLogger3.error("[SttTtsPlugin] handleSilence error =>", err)
        );
      }, SILENCE_DETECTION_THRESHOLD_MS);
    } else {
      let volumeBuffer = this.volumeBuffers.get(data.userId);
      if (!volumeBuffer) {
        volumeBuffer = [];
        this.volumeBuffers.set(data.userId, volumeBuffer);
      }
      const samples = new Int16Array(
        data.samples.buffer,
        data.samples.byteOffset,
        data.samples.length / 2
      );
      const maxAmplitude = Math.max(...samples.map(Math.abs)) / 32768;
      volumeBuffer.push(maxAmplitude);
      if (volumeBuffer.length > VOLUME_WINDOW_SIZE) {
        volumeBuffer.shift();
      }
      const avgVolume = volumeBuffer.reduce((sum, v) => sum + v, 0) / VOLUME_WINDOW_SIZE;
      if (avgVolume > SPEAKING_THRESHOLD) {
        volumeBuffer.length = 0;
        if (this.ttsAbortController) {
          this.ttsAbortController.abort();
          this.isSpeaking = false;
          elizaLogger3.log("[SttTtsPlugin] TTS playback interrupted");
        }
      }
    }
  }
  // /src/sttTtsPlugin.js
  async convertPcmToWavInMemory(pcmData, sampleRate) {
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = pcmData.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
      view.setInt16(offset, pcmData[i], true);
    }
    return buffer;
  }
  writeString(view, offset, text) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }
  /**
   * On speaker silence => flush STT => GPT => TTS => push to Janus
   */
  async processAudio(userId) {
    if (this.isProcessingAudio) {
      return;
    }
    this.isProcessingAudio = true;
    try {
      elizaLogger3.log(
        "[SttTtsPlugin] Starting audio processing for user:",
        userId
      );
      const chunks = this.pcmBuffers.get(userId) || [];
      this.pcmBuffers.clear();
      if (!chunks.length) {
        elizaLogger3.warn("[SttTtsPlugin] No audio chunks for user =>", userId);
        return;
      }
      elizaLogger3.log(
        `[SttTtsPlugin] Flushing STT buffer for user=${userId}, chunks=${chunks.length}`
      );
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Int16Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const wavBuffer = await this.convertPcmToWavInMemory(merged, 48e3);
      const sttText = await this.transcriptionService.transcribe(wavBuffer);
      elizaLogger3.log(`[SttTtsPlugin] Transcription result: "${sttText}"`);
      if (!sttText || !sttText.trim()) {
        elizaLogger3.warn(
          "[SttTtsPlugin] No speech recognized for user =>",
          userId
        );
        return;
      }
      elizaLogger3.log(
        `[SttTtsPlugin] STT => user=${userId}, text="${sttText}"`
      );
      const replyText = await this.handleUserMessage(sttText, userId);
      if (!replyText || !replyText.length || !replyText.trim()) {
        elizaLogger3.warn("[SttTtsPlugin] No replyText for user =>", userId);
        return;
      }
      elizaLogger3.log(`[SttTtsPlugin] user=${userId}, reply="${replyText}"`);
      this.isProcessingAudio = false;
      this.volumeBuffers.clear();
      await this.speakText(replyText);
    } catch (error) {
      elizaLogger3.error("[SttTtsPlugin] processAudio error =>", error);
    } finally {
      this.isProcessingAudio = false;
    }
  }
  /**
   * Public method to queue a TTS request
   */
  async speakText(text) {
    this.ttsQueue.push(text);
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.processTtsQueue().catch((err) => {
        elizaLogger3.error("[SttTtsPlugin] processTtsQueue error =>", err);
      });
    }
  }
  /**
   * Process TTS requests one by one
   */
  async processTtsQueue() {
    while (this.ttsQueue.length > 0) {
      const text = this.ttsQueue.shift();
      if (!text) continue;
      this.ttsAbortController = new AbortController();
      const { signal } = this.ttsAbortController;
      try {
        const ttsAudio = await this.elevenLabsTts(text);
        const pcm = await this.convertMp3ToPcm(ttsAudio, 48e3);
        if (signal.aborted) {
          elizaLogger3.log("[SttTtsPlugin] TTS interrupted before streaming");
          return;
        }
        await this.streamToJanus(pcm, 48e3);
        if (signal.aborted) {
          elizaLogger3.log("[SttTtsPlugin] TTS interrupted after streaming");
          return;
        }
      } catch (err) {
        elizaLogger3.error("[SttTtsPlugin] TTS streaming error =>", err);
      } finally {
        this.ttsAbortController = null;
      }
    }
    this.isSpeaking = false;
  }
  /**
   * Handle User Message
   */
  async handleUserMessage(userText, userId) {
    const numericId = userId.replace("tw-", "");
    const roomId = stringToUuid6(`twitter_generate_room-${this.spaceId}`);
    const userUuid = stringToUuid6(`twitter-user-${numericId}`);
    await this.runtime.ensureUserExists(
      userUuid,
      userId,
      // Use full Twitter ID as username
      `Twitter User ${numericId}`,
      "twitter"
    );
    await this.runtime.ensureRoomExists(roomId);
    await this.runtime.ensureParticipantInRoom(userUuid, roomId);
    let state = await this.runtime.composeState(
      {
        agentId: this.runtime.agentId,
        content: { text: userText, source: "twitter" },
        userId: userUuid,
        roomId
      },
      {
        twitterUserName: this.client.profile.username,
        agentName: this.runtime.character.name
      }
    );
    const memory = {
      id: stringToUuid6(`${roomId}-voice-message-${Date.now()}`),
      agentId: this.runtime.agentId,
      content: {
        text: userText,
        source: "twitter"
      },
      userId: userUuid,
      roomId,
      embedding: getEmbeddingZeroVector5(),
      createdAt: Date.now()
    };
    await this.runtime.messageManager.createMemory(memory);
    state = await this.runtime.updateRecentMessageState(state);
    const shouldIgnore = await this._shouldIgnore(memory);
    if (shouldIgnore) {
      return "";
    }
    const shouldRespond = await this._shouldRespond(userText, state);
    if (!shouldRespond) {
      return "";
    }
    const context = composeContext4({
      state,
      template: this.runtime.character.templates?.twitterVoiceHandlerTemplate || this.runtime.character.templates?.messageHandlerTemplate || twitterVoiceHandlerTemplate
    });
    const responseContent = await this._generateResponse(memory, context);
    const responseMemory = {
      id: stringToUuid6(`${memory.id}-voice-response-${Date.now()}`),
      agentId: this.runtime.agentId,
      userId: this.runtime.agentId,
      content: {
        ...responseContent,
        user: this.runtime.character.name,
        inReplyTo: memory.id
      },
      roomId,
      embedding: getEmbeddingZeroVector5()
    };
    const reply = responseMemory.content.text?.trim();
    if (reply) {
      await this.runtime.messageManager.createMemory(responseMemory);
    }
    return reply;
  }
  async _generateResponse(message, context) {
    const { userId, roomId } = message;
    const response = await generateMessageResponse3({
      runtime: this.runtime,
      context,
      modelClass: ModelClass4.SMALL
    });
    response.source = "discord";
    if (!response) {
      elizaLogger3.error(
        "[SttTtsPlugin] No response from generateMessageResponse"
      );
      return;
    }
    await this.runtime.databaseAdapter.log({
      body: { message, context, response },
      userId,
      roomId,
      type: "response"
    });
    return response;
  }
  async _shouldIgnore(message) {
    elizaLogger3.debug("message.content: ", message.content);
    if (message.content.text.length < 3) {
      return true;
    }
    const loseInterestWords = [
      // telling the bot to stop talking
      "shut up",
      "stop",
      "dont talk",
      "silence",
      "stop talking",
      "be quiet",
      "hush",
      "stfu",
      "stupid bot",
      "dumb bot",
      // offensive words
      "fuck",
      "shit",
      "damn",
      "suck",
      "dick",
      "cock",
      "sex",
      "sexy"
    ];
    if (message.content.text.length < 50 && loseInterestWords.some(
      (word) => message.content.text?.toLowerCase().includes(word)
    )) {
      return true;
    }
    const ignoreWords = ["k", "ok", "bye", "lol", "nm", "uh"];
    if (message.content.text?.length < 8 && ignoreWords.some(
      (word) => message.content.text?.toLowerCase().includes(word)
    )) {
      return true;
    }
    return false;
  }
  async _shouldRespond(message, state) {
    const lowerMessage = message.toLowerCase();
    const characterName = this.runtime.character.name.toLowerCase();
    if (lowerMessage.includes(characterName)) {
      return true;
    }
    const shouldRespondContext = composeContext4({
      state,
      template: this.runtime.character.templates?.twitterShouldRespondTemplate || this.runtime.character.templates?.shouldRespondTemplate || composeRandomUser(twitterShouldRespondTemplate2, 2)
    });
    const response = await generateShouldRespond2({
      runtime: this.runtime,
      context: shouldRespondContext,
      modelClass: ModelClass4.SMALL
    });
    if (response === "RESPOND") {
      return true;
    }
    if (response === "IGNORE" || response === "STOP") {
      return false;
    }
    elizaLogger3.error("Invalid response from response generateText:", response);
    return false;
  }
  /**
   * ElevenLabs TTS => returns MP3 Buffer
   */
  async elevenLabsTts(text) {
    if (!this.elevenLabsApiKey) {
      throw new Error("[SttTtsPlugin] No ElevenLabs API key");
    }
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": this.elevenLabsApiKey
      },
      body: JSON.stringify({
        text,
        model_id: this.elevenLabsModel,
        voice_settings: { stability: 0.4, similarity_boost: 0.8 }
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `[SttTtsPlugin] ElevenLabs TTS error => ${resp.status} ${errText}`
      );
    }
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
  /**
   * Convert MP3 => PCM via ffmpeg
   */
  convertMp3ToPcm(mp3Buf, outRate) {
    return new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-ar",
        outRate.toString(),
        "-ac",
        "1",
        "pipe:1"
      ]);
      let raw = Buffer.alloc(0);
      ff.stdout.on("data", (chunk) => {
        raw = Buffer.concat([raw, chunk]);
      });
      ff.stderr.on("data", () => {
      });
      ff.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg error code=${code}`));
          return;
        }
        const samples = new Int16Array(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength / 2
        );
        resolve(samples);
      });
      ff.stdin.write(mp3Buf);
      ff.stdin.end();
    });
  }
  /**
   * Push PCM back to Janus in small frames
   * We'll do 10ms @48k => 960 samples per frame
   */
  async streamToJanus(samples, sampleRate) {
    const FRAME_SIZE = Math.floor(sampleRate * 0.01);
    for (let offset = 0; offset + FRAME_SIZE <= samples.length; offset += FRAME_SIZE) {
      if (this.ttsAbortController?.signal.aborted) {
        elizaLogger3.log("[SttTtsPlugin] streamToJanus interrupted");
        return;
      }
      const frame = new Int16Array(FRAME_SIZE);
      frame.set(samples.subarray(offset, offset + FRAME_SIZE));
      this.janus?.pushLocalAudio(frame, sampleRate, 1);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  /**
   * Add a message (system, user or assistant) to the chat context.
   * E.g. to store conversation history or inject a persona.
   */
  addMessage(role, content) {
    this.chatContext.push({ role, content });
    elizaLogger3.log(
      `[SttTtsPlugin] addMessage => role=${role}, content=${content}`
    );
  }
  /**
   * Clear the chat context if needed.
   */
  clearChatContext() {
    this.chatContext = [];
    elizaLogger3.log("[SttTtsPlugin] clearChatContext => done");
  }
  cleanup() {
    elizaLogger3.log("[SttTtsPlugin] cleanup => releasing resources");
    this.pcmBuffers.clear();
    this.userSpeakingTimer = null;
    this.ttsQueue = [];
    this.isSpeaking = false;
    this.volumeBuffers.clear();
  }
};

// src/spaces.ts
async function generateFiller(runtime, fillerType) {
  try {
    const context = composeContext5({
      state: { fillerType },
      template: `
# INSTRUCTIONS:
You are generating a short filler message for a Twitter Space. The filler type is "{{fillerType}}".
Keep it brief, friendly, and relevant. No more than two sentences.
Only return the text, no additional formatting.

---
`
    });
    const output = await generateText3({
      runtime,
      context,
      modelClass: ModelClass5.SMALL
    });
    return output.trim();
  } catch (err) {
    this.logger.error("[generateFiller] Error generating filler:", err);
    return "";
  }
}
async function speakFiller(runtime, sttTtsPlugin, fillerType, sleepAfterMs = 3e3) {
  if (!sttTtsPlugin) return;
  const text = await generateFiller(runtime, fillerType);
  if (!text) return;
  this.logger.log(`[Space] Filler (${fillerType}) => ${text}`);
  await sttTtsPlugin.speakText(text);
  if (sleepAfterMs > 0) {
    await new Promise((res) => setTimeout(res, sleepAfterMs));
  }
}
async function generateTopicsIfEmpty(runtime) {
  try {
    const context = composeContext5({
      state: {},
      template: `
# INSTRUCTIONS:
Please generate 5 short topic ideas for a Twitter Space about technology or random interesting subjects.
Return them as a comma-separated list, no additional formatting or numbering.

Example:
"AI Advances, Futuristic Gadgets, Space Exploration, Quantum Computing, Digital Ethics"
---
`
    });
    const response = await generateText3({
      runtime,
      context,
      modelClass: ModelClass5.SMALL
    });
    const topics = response.split(",").map((t) => t.trim()).filter(Boolean);
    return topics.length ? topics : ["Random Tech Chat", "AI Thoughts"];
  } catch (err) {
    this.logger.error("[generateTopicsIfEmpty] GPT error =>", err);
    return ["Random Tech Chat", "AI Thoughts"];
  }
}
var TwitterSpaceClient = class {
  runtime;
  client;
  scraper;
  isSpaceRunning = false;
  currentSpace;
  spaceId;
  startedAt;
  checkInterval;
  lastSpaceEndedAt;
  sttTtsPlugin;
  /**
   * We now store an array of active speakers, not just 1
   */
  activeSpeakers = [];
  speakerQueue = [];
  decisionOptions;
  logger;
  constructor(client2, runtime) {
    this.client = client2;
    this.scraper = client2.twitterClient;
    this.runtime = runtime;
    this.logger = client2.logger;
    const charSpaces = runtime.character.twitterSpaces || {};
    this.decisionOptions = {
      maxSpeakers: charSpaces.maxSpeakers ?? 1,
      topics: charSpaces.topics ?? [],
      typicalDurationMinutes: charSpaces.typicalDurationMinutes ?? 30,
      idleKickTimeoutMs: charSpaces.idleKickTimeoutMs ?? 5 * 6e4,
      minIntervalBetweenSpacesMinutes: charSpaces.minIntervalBetweenSpacesMinutes ?? 60,
      businessHoursOnly: charSpaces.businessHoursOnly ?? false,
      randomChance: charSpaces.randomChance ?? 0.3,
      enableIdleMonitor: charSpaces.enableIdleMonitor !== false,
      enableSttTts: charSpaces.enableSttTts !== false,
      enableRecording: charSpaces.enableRecording !== false,
      voiceId: charSpaces.voiceId || runtime.character.settings.voice.model || "Xb7hH8MSUJpSbSDYk0k2",
      sttLanguage: charSpaces.sttLanguage || "en",
      speakerMaxDurationMs: charSpaces.speakerMaxDurationMs ?? 4 * 6e4
    };
  }
  /**
   * Periodic check to launch or manage space
   */
  async startPeriodicSpaceCheck() {
    this.logger.log("[Space] Starting periodic check routine...");
    const intervalMsWhenIdle = 5 * 6e4;
    const intervalMsWhenRunning = 5e3;
    const routine = async () => {
      try {
        if (!this.isSpaceRunning) {
          const launch = await this.shouldLaunchSpace();
          if (launch) {
            const config = await this.generateSpaceConfig();
            await this.startSpace(config);
          }
          this.checkInterval = setTimeout(
            routine,
            this.isSpaceRunning ? intervalMsWhenRunning : intervalMsWhenIdle
          );
        } else {
          await this.manageCurrentSpace();
          this.checkInterval = setTimeout(routine, intervalMsWhenRunning);
        }
      } catch (error) {
        this.logger.error("[Space] Error in routine =>", error);
        this.checkInterval = setTimeout(routine, intervalMsWhenIdle);
      }
    };
    routine();
  }
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = void 0;
    }
  }
  async shouldLaunchSpace() {
    const r = Math.random();
    if (r > (this.decisionOptions.randomChance ?? 0.3)) {
      this.logger.log("[Space] Random check => skip launching");
      return false;
    }
    if (this.decisionOptions.businessHoursOnly) {
      const hour = (/* @__PURE__ */ new Date()).getUTCHours();
      if (hour < 9 || hour >= 17) {
        this.logger.log("[Space] Out of business hours => skip");
        return false;
      }
    }
    const now = Date.now();
    if (this.lastSpaceEndedAt) {
      const minIntervalMs = (this.decisionOptions.minIntervalBetweenSpacesMinutes ?? 60) * 6e4;
      if (now - this.lastSpaceEndedAt < minIntervalMs) {
        this.logger.log("[Space] Too soon since last space => skip");
        return false;
      }
    }
    this.logger.log("[Space] Deciding to launch a new Space...");
    return true;
  }
  async generateSpaceConfig() {
    if (!this.decisionOptions.topics || this.decisionOptions.topics.length === 0) {
      const newTopics = await generateTopicsIfEmpty(this.client.runtime);
      this.decisionOptions.topics = newTopics;
    }
    let chosenTopic = "Random Tech Chat";
    if (this.decisionOptions.topics && this.decisionOptions.topics.length > 0) {
      chosenTopic = this.decisionOptions.topics[Math.floor(Math.random() * this.decisionOptions.topics.length)];
    }
    return {
      mode: "INTERACTIVE",
      title: chosenTopic,
      description: `Discussion about ${chosenTopic}`,
      languages: ["en"],
      record: false
    };
  }
  async startSpace(config) {
    this.logger.log("[Space] Starting a new Twitter Space...");
    try {
      this.currentSpace = new Space(this.scraper);
      this.isSpaceRunning = false;
      this.spaceId = void 0;
      this.startedAt = Date.now();
      this.activeSpeakers = [];
      this.speakerQueue = [];
      const elevenLabsKey = this.runtime.getSetting("ELEVENLABS_XI_API_KEY") || "";
      const broadcastInfo = await this.currentSpace.initialize(config);
      this.spaceId = broadcastInfo.room_id;
      if (this.decisionOptions.enableRecording) {
        this.logger.log("[Space] Using RecordToDiskPlugin");
        this.currentSpace.use(new RecordToDiskPlugin());
      }
      if (this.decisionOptions.enableSttTts) {
        this.logger.log("[Space] Using SttTtsPlugin");
        const sttTts = new SttTtsPlugin();
        this.sttTtsPlugin = sttTts;
        this.currentSpace.use(sttTts, {
          runtime: this.runtime,
          client: this.client,
          spaceId: this.spaceId,
          elevenLabsApiKey: elevenLabsKey,
          voiceId: this.decisionOptions.voiceId,
          sttLanguage: this.decisionOptions.sttLanguage,
          transcriptionService: this.client.runtime.getService(
            ServiceType4.TRANSCRIPTION
          )
        });
      }
      if (this.decisionOptions.enableIdleMonitor) {
        this.logger.log("[Space] Using IdleMonitorPlugin");
        this.currentSpace.use(
          new IdleMonitorPlugin(
            this.decisionOptions.idleKickTimeoutMs ?? 6e4,
            1e4
          )
        );
      }
      this.isSpaceRunning = true;
      await this.scraper.sendTweet(
        broadcastInfo.share_url.replace("broadcasts", "spaces")
      );
      const spaceUrl = broadcastInfo.share_url.replace("broadcasts", "spaces");
      this.logger.log(`[Space] Space started => ${spaceUrl}`);
      await speakFiller(this.client.runtime, this.sttTtsPlugin, "WELCOME");
      this.currentSpace.on("occupancyUpdate", (update) => {
        this.logger.log(
          `[Space] Occupancy => ${update.occupancy} participant(s).`
        );
      });
      this.currentSpace.on("speakerRequest", async (req) => {
        this.logger.log(
          `[Space] Speaker request from @${req.username} (${req.userId}).`
        );
        await this.handleSpeakerRequest(req);
      });
      this.currentSpace.on("idleTimeout", async (info) => {
        this.logger.log(
          `[Space] idleTimeout => no audio for ${info.idleMs} ms.`
        );
        await speakFiller(
          this.client.runtime,
          this.sttTtsPlugin,
          "IDLE_ENDING"
        );
        await this.stopSpace();
      });
      process.on("SIGINT", async () => {
        this.logger.log("[Space] SIGINT => stopping space");
        await speakFiller(this.client.runtime, this.sttTtsPlugin, "CLOSING");
        await this.stopSpace();
        process.exit(0);
      });
    } catch (error) {
      this.logger.error("[Space] Error launching Space =>", error);
      this.isSpaceRunning = false;
      throw error;
    }
  }
  /**
   * Periodic management: check durations, remove extras, maybe accept new from queue
   */
  async manageCurrentSpace() {
    if (!this.spaceId || !this.currentSpace) return;
    try {
      const audioSpace = await this.scraper.getAudioSpaceById(this.spaceId);
      const { participants } = audioSpace;
      const numSpeakers = participants.speakers?.length || 0;
      const totalListeners = participants.listeners?.length || 0;
      const maxDur = this.decisionOptions.speakerMaxDurationMs ?? 24e4;
      const now = Date.now();
      for (let i = this.activeSpeakers.length - 1; i >= 0; i--) {
        const speaker = this.activeSpeakers[i];
        const elapsed = now - speaker.startTime;
        if (elapsed > maxDur) {
          this.logger.log(
            `[Space] Speaker @${speaker.username} exceeded max duration => removing`
          );
          await this.removeSpeaker(speaker.userId);
          this.activeSpeakers.splice(i, 1);
          await speakFiller(
            this.client.runtime,
            this.sttTtsPlugin,
            "SPEAKER_LEFT"
          );
        }
      }
      await this.acceptSpeakersFromQueueIfNeeded();
      if (numSpeakers > (this.decisionOptions.maxSpeakers ?? 1)) {
        this.logger.log("[Space] More than maxSpeakers => removing extras...");
        await this.kickExtraSpeakers(participants.speakers);
      }
      const elapsedMinutes = (now - (this.startedAt || 0)) / 6e4;
      if (elapsedMinutes > (this.decisionOptions.typicalDurationMinutes ?? 30) || numSpeakers === 0 && totalListeners === 0 && elapsedMinutes > 5) {
        this.logger.log("[Space] Condition met => stopping the Space...");
        await speakFiller(
          this.client.runtime,
          this.sttTtsPlugin,
          "CLOSING",
          4e3
        );
        await this.stopSpace();
      }
    } catch (error) {
      this.logger.error("[Space] Error in manageCurrentSpace =>", error);
    }
  }
  /**
   * If we have available slots, accept new speakers from the queue
   */
  async acceptSpeakersFromQueueIfNeeded() {
    const ms = this.decisionOptions.maxSpeakers ?? 1;
    while (this.speakerQueue.length > 0 && this.activeSpeakers.length < ms) {
      const nextReq = this.speakerQueue.shift();
      if (nextReq) {
        await speakFiller(this.client.runtime, this.sttTtsPlugin, "PRE_ACCEPT");
        await this.acceptSpeaker(nextReq);
      }
    }
  }
  async handleSpeakerRequest(req) {
    if (!this.spaceId || !this.currentSpace) return;
    const audioSpace = await this.scraper.getAudioSpaceById(this.spaceId);
    const janusSpeakers = audioSpace?.participants?.speakers || [];
    if (janusSpeakers.length < (this.decisionOptions.maxSpeakers ?? 1)) {
      this.logger.log(`[Space] Accepting speaker @${req.username} now`);
      await speakFiller(this.client.runtime, this.sttTtsPlugin, "PRE_ACCEPT");
      await this.acceptSpeaker(req);
    } else {
      this.logger.log(`[Space] Adding speaker @${req.username} to the queue`);
      this.speakerQueue.push(req);
    }
  }
  async acceptSpeaker(req) {
    if (!this.currentSpace) return;
    try {
      await this.currentSpace.approveSpeaker(req.userId, req.sessionUUID);
      this.activeSpeakers.push({
        userId: req.userId,
        sessionUUID: req.sessionUUID,
        username: req.username,
        startTime: Date.now()
      });
      this.logger.log(`[Space] Speaker @${req.username} is now live`);
    } catch (err) {
      this.logger.error(
        `[Space] Error approving speaker @${req.username}:`,
        err
      );
    }
  }
  async removeSpeaker(userId) {
    if (!this.currentSpace) return;
    try {
      await this.currentSpace.removeSpeaker(userId);
      this.logger.log(`[Space] Removed speaker userId=${userId}`);
    } catch (error) {
      this.logger.error(
        `[Space] Error removing speaker userId=${userId} =>`,
        error
      );
    }
  }
  /**
   * If more than maxSpeakers are found, remove extras
   * Also update activeSpeakers array
   */
  async kickExtraSpeakers(speakers) {
    if (!this.currentSpace) return;
    const ms = this.decisionOptions.maxSpeakers ?? 1;
    const extras = speakers.slice(ms);
    for (const sp of extras) {
      this.logger.log(`[Space] Removing extra speaker => userId=${sp.user_id}`);
      await this.removeSpeaker(sp.user_id);
      const idx = this.activeSpeakers.findIndex((s) => s.userId === sp.user_id);
      if (idx !== -1) {
        this.activeSpeakers.splice(idx, 1);
      }
    }
  }
  async stopSpace() {
    if (!this.currentSpace || !this.isSpaceRunning) return;
    try {
      this.logger.log("[Space] Stopping the current Space...");
      await this.currentSpace.stop();
    } catch (err) {
      this.logger.error("[Space] Error stopping Space =>", err);
    } finally {
      this.isSpaceRunning = false;
      this.spaceId = void 0;
      this.currentSpace = void 0;
      this.startedAt = void 0;
      this.lastSpaceEndedAt = Date.now();
      this.activeSpeakers = [];
      this.speakerQueue = [];
    }
  }
};

// src/index.ts
var TwitterManager = class {
  constructor(runtime, twitterConfig) {
    this.runtime = runtime;
    this.client = new ClientBase(runtime, twitterConfig);
    this.post = new TwitterPostClient(this.client, runtime);
    if (twitterConfig.TWITTER_SEARCH_ENABLE) {
      this.client.logger.warn("Twitter/X client running in a mode that:");
      this.client.logger.warn("1. violates consent of random users");
      this.client.logger.warn("2. burns your rate limit");
      this.client.logger.warn("3. can get your account banned");
      this.client.logger.warn("use at your own risk");
      this.search = new TwitterSearchClient(this.client, runtime);
    }
    this.interaction = new TwitterInteractionClient(this.client, runtime);
    if (twitterConfig.TWITTER_SPACES_ENABLE) {
      this.space = new TwitterSpaceClient(this.client, runtime);
    }
  }
  client;
  post;
  search;
  interaction;
  space;
  async stop(runtime) {
    return await stop(runtime || this.runtime);
  }
  async start(runtime) {
    this.client.logger.warn("Twitter client start again by TwitterManager");
    return await TwitterClientInterface.start(runtime);
  }
};
function hidePassword(url) {
  if (!url) return url;
  try {
    const urlParts = new URL(url);
    urlParts.password = "***";
    return urlParts.toString();
  } catch (error) {
    return url;
  }
}
var TwitterClientInterface = {
  // one loop to start all actions, so that can easy stop the client
  async start(runtime) {
    const twitterConfig = await validateTwitterConfig(runtime);
    const proxy = hidePassword(twitterConfig.TWITTER_HTTP_PROXY ?? "");
    Logger.debug(
      `Twitter client started username=${twitterConfig.TWITTER_USERNAME}`
    );
    try {
      twitterAccountStatus.labels(twitterConfig.TWITTER_USERNAME, proxy).set(1);
      twitterPostCount.labels(twitterConfig.TWITTER_USERNAME).inc(0);
      twitterPostInterval.labels(twitterConfig.TWITTER_USERNAME).set(twitterConfig.POST_INTERVAL_MAX);
      if (SETTINGS.account[twitterConfig.TWITTER_USERNAME] && SETTINGS.account[twitterConfig.TWITTER_USERNAME].status !== "STOPPED" /* STOPPED */) {
        const msg = `Twitter client ${twitterConfig.TWITTER_USERNAME} is not stopped, cannot start, status=${SETTINGS.account[twitterConfig.TWITTER_USERNAME]?.status}`;
        throw new Error(msg);
      }
      SETTINGS.agent[runtime.agentId] = twitterConfig;
      const manager = new TwitterManager(runtime, twitterConfig);
      await manager.client.init();
      await manager.post.start();
      if (manager.search) {
        await manager.search.start();
      }
      await manager.interaction.start();
      if (manager.space) {
        manager.space.startPeriodicSpaceCheck();
      }
      SETTINGS.account[twitterConfig.TWITTER_USERNAME].status = "RUNNING" /* RUNNING */;
      SETTINGS.account[twitterConfig.TWITTER_USERNAME].manager = manager;
      return manager;
    } catch (error) {
      twitterAccountStatus.labels(twitterConfig.TWITTER_USERNAME).set(0);
      throw error;
    }
  },
  async stop(_runtime) {
    return stop(_runtime);
  }
};
async function stop(_runtime) {
  if (getCurrentAgentTwitterAccountStatus(_runtime.agentId) === "RUNNING" /* RUNNING */) {
    const twitterConfig = SETTINGS.agent[_runtime.agentId];
    const username = twitterConfig.TWITTER_USERNAME;
    const proxy = hidePassword(twitterConfig.TWITTER_HTTP_PROXY ?? "");
    twitterAccountStatus.labels(username, proxy).set(2);
    SETTINGS.account[username].status = "STOPPING" /* STOPPING */;
    const manager = SETTINGS.account[username].manager;
    let maxCheckTimes = 60;
    while (maxCheckTimes > 0) {
      maxCheckTimes--;
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      let ok = await manager.post.stop();
      if (!ok) continue;
      ok = await manager.interaction.stop();
      if (!ok) continue;
      if (manager.space) await manager.space.stopSpace();
      if (manager.search) await manager.search.stop();
      break;
    }
    if (maxCheckTimes === 0) {
      throw new Error(
        `Twitter client ${username} failed to stop, please try again`
      );
    } else {
      SETTINGS.account[username].manager = null;
      SETTINGS.account[username].status = "STOPPED" /* STOPPED */;
      twitterAccountStatus.labels(username, proxy).set(0);
      Logger.info(`Twitter client ${_runtime.agentId} stopped`);
    }
  } else {
    Logger.warn(
      `Twitter client ${_runtime.agentId} is not running, cannot stop`
    );
  }
}
var index_default = TwitterClientInterface;
export {
  TwitterClientInterface,
  TwitterManager,
  index_default as default
};
//# sourceMappingURL=index.js.map