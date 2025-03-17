import * as _elizaos_core from '@elizaos/core';
import { ActionTimelineType, IAgentRuntime, Memory, State, UUID, IImageDescriptionService, Client } from '@elizaos/core';
import { Scraper, Tweet, SearchMode, QueryTweetsResponse, SpaceConfig } from 'agent-twitter-client';
import { EventEmitter } from 'events';
import { z } from 'zod';
import pino from 'pino';

/**
 * This schema defines all required/optional environment settings,
 * including new fields like TWITTER_SPACES_ENABLE.
 */
declare const twitterEnvSchema: z.ZodObject<{
    TWITTER_DRY_RUN: z.ZodBoolean;
    TWITTER_USERNAME: z.ZodString;
    TWITTER_PASSWORD: z.ZodString;
    TWITTER_EMAIL: z.ZodString;
    MAX_TWEET_LENGTH: z.ZodDefault<z.ZodNumber>;
    TWITTER_SEARCH_ENABLE: z.ZodDefault<z.ZodBoolean>;
    TWITTER_2FA_SECRET: z.ZodString;
    TWITTER_RETRY_LIMIT: z.ZodNumber;
    TWITTER_POLL_INTERVAL: z.ZodNumber;
    TWITTER_TARGET_USERS: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    ENABLE_TWITTER_POST_GENERATION: z.ZodBoolean;
    POST_INTERVAL_MIN: z.ZodNumber;
    POST_INTERVAL_MAX: z.ZodNumber;
    ENABLE_ACTION_PROCESSING: z.ZodBoolean;
    ACTION_INTERVAL: z.ZodNumber;
    POST_IMMEDIATELY: z.ZodBoolean;
    TWITTER_SPACES_ENABLE: z.ZodDefault<z.ZodBoolean>;
    MAX_ACTIONS_PROCESSING: z.ZodNumber;
    ACTION_TIMELINE_TYPE: z.ZodDefault<z.ZodNativeEnum<typeof ActionTimelineType>>;
    TWITTER_HTTP_PROXY: z.ZodOptional<z.ZodString>;
    TWITTER_COOKIES_AUTH_TOKEN: z.ZodOptional<z.ZodString>;
    TWITTER_COOKIES_CT0: z.ZodOptional<z.ZodString>;
    TWITTER_COOKIES_GUEST_ID: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    TWITTER_DRY_RUN?: boolean;
    TWITTER_USERNAME?: string;
    TWITTER_PASSWORD?: string;
    TWITTER_EMAIL?: string;
    MAX_TWEET_LENGTH?: number;
    TWITTER_SEARCH_ENABLE?: boolean;
    TWITTER_2FA_SECRET?: string;
    TWITTER_RETRY_LIMIT?: number;
    TWITTER_POLL_INTERVAL?: number;
    TWITTER_TARGET_USERS?: string[];
    ENABLE_TWITTER_POST_GENERATION?: boolean;
    POST_INTERVAL_MIN?: number;
    POST_INTERVAL_MAX?: number;
    ENABLE_ACTION_PROCESSING?: boolean;
    ACTION_INTERVAL?: number;
    POST_IMMEDIATELY?: boolean;
    TWITTER_SPACES_ENABLE?: boolean;
    MAX_ACTIONS_PROCESSING?: number;
    ACTION_TIMELINE_TYPE?: ActionTimelineType;
    TWITTER_HTTP_PROXY?: string;
    TWITTER_COOKIES_AUTH_TOKEN?: string;
    TWITTER_COOKIES_CT0?: string;
    TWITTER_COOKIES_GUEST_ID?: string;
}, {
    TWITTER_DRY_RUN?: boolean;
    TWITTER_USERNAME?: string;
    TWITTER_PASSWORD?: string;
    TWITTER_EMAIL?: string;
    MAX_TWEET_LENGTH?: number;
    TWITTER_SEARCH_ENABLE?: boolean;
    TWITTER_2FA_SECRET?: string;
    TWITTER_RETRY_LIMIT?: number;
    TWITTER_POLL_INTERVAL?: number;
    TWITTER_TARGET_USERS?: string[];
    ENABLE_TWITTER_POST_GENERATION?: boolean;
    POST_INTERVAL_MIN?: number;
    POST_INTERVAL_MAX?: number;
    ENABLE_ACTION_PROCESSING?: boolean;
    ACTION_INTERVAL?: number;
    POST_IMMEDIATELY?: boolean;
    TWITTER_SPACES_ENABLE?: boolean;
    MAX_ACTIONS_PROCESSING?: number;
    ACTION_TIMELINE_TYPE?: ActionTimelineType;
    TWITTER_HTTP_PROXY?: string;
    TWITTER_COOKIES_AUTH_TOKEN?: string;
    TWITTER_COOKIES_CT0?: string;
    TWITTER_COOKIES_GUEST_ID?: string;
}>;
type TwitterConfig$1 = z.infer<typeof twitterEnvSchema>;

type FetchParameters = [input: RequestInfo | URL, init?: RequestInit];
interface FetchTransformOptions {
    /**
     * Transforms the request options before a request is made. This executes after all of the default
     * parameters have been configured, and is stateless. It is safe to return new request options
     * objects.
     * @param args The request options.
     * @returns The transformed request options.
     */
    request: (...args: FetchParameters) => FetchParameters | Promise<FetchParameters>;
    /**
     * Transforms the response after a request completes. This executes immediately after the request
     * completes, and is stateless. It is safe to return a new response object.
     * @param response The response object.
     * @returns The transformed response object.
     */
    response: (response: Response) => Response | Promise<Response>;
}
interface ScraperOptions {
    /**
     * An alternative fetch function to use instead of the default fetch function. This may be useful
     * in nonstandard runtime environments, such as edge workers.
     */
    fetch: typeof fetch;
    /**
     * Additional options that control how requests and responses are processed. This can be used to
     * proxy requests through other hosts, for example.
     */
    transform: Partial<FetchTransformOptions>;
}
declare class CustomScraper extends Scraper {
    constructor(options?: Partial<ScraperOptions> | undefined, proxyUrl?: string);
}

type TwitterProfile = {
    id: string;
    username: string;
    screenName: string;
    bio: string;
    nicknames: string[];
};
declare class RequestQueue {
    private queue;
    private processing;
    add<T>(request: () => Promise<T>): Promise<T>;
    private processQueue;
    private exponentialBackoff;
    private randomDelay;
}
declare class ClientBase extends EventEmitter {
    static _twitterClients: {
        [accountIdentifier: string]: CustomScraper;
    };
    twitterClient: CustomScraper;
    runtime: IAgentRuntime;
    runtimeHelper: RuntimeHelper;
    twitterConfig: TwitterConfig$1;
    directions: string;
    lastCheckedTweetId: bigint | null;
    imageDescriptionService: IImageDescriptionService;
    temperature: number;
    requestQueue: RequestQueue;
    profile: TwitterProfile | null;
    logger: pino.Logger<string, boolean>;
    getTweet(tweetId: string): Promise<Tweet>;
    callback: (self: ClientBase) => any;
    onReady(): void;
    /**
     * Parse the raw tweet data into a standardized Tweet object.
     */
    private parseTweet;
    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig$1);
    private twitterLoginInitCookies;
    private twitterLogin;
    private initTwitterProfile;
    init(): Promise<void>;
    fetchOwnPosts(count: number): Promise<Tweet[]>;
    /**
     * Fetch timeline for twitter account, optionally only from followed accounts
     */
    fetchHomeTimeline(count: number, following?: boolean): Promise<Tweet[]>;
    fetchTimelineForActions(count: number): Promise<Tweet[]>;
    fetchSearchTweets(query: string, maxTweets: number, searchMode: SearchMode, cursor?: string): Promise<QueryTweetsResponse>;
    private populateTimeline;
    private setCookiesFromArray;
    saveRequestMessage(message: Memory, state: State): Promise<void>;
    private loadLatestCheckedTweetId;
    cacheLatestCheckedTweetId(): Promise<void>;
    cacheTimeline(timeline: Tweet[]): Promise<void>;
    private fetchProfile;
}
declare class RuntimeHelper {
    private runtime;
    private logger;
    constructor(runtime: IAgentRuntime, logger: pino.Logger<string, boolean>);
    saveRequestMessage(message: Memory, state: State, twitterClient: CustomScraper): Promise<void>;
    getDirections(): string;
    cacheTweet(tweet: Tweet): Promise<void>;
    getCachedTweet(tweetId: string): Promise<Tweet | undefined>;
    getCachedLatestCheckedTweetId(username: string): Promise<bigint | undefined>;
    cacheLatestCheckedTweetId(username: string, lastCheckedTweetId: BigInt): Promise<void>;
    getCachedTimeline(username: string): Promise<Tweet[] | undefined>;
    ensureUserExists(username: string): Promise<void>;
    getMemoryIdsByRoomIds(roomIds: UUID[]): Promise<Set<UUID>>;
    getTweetRoomId(conversationId?: string): UUID;
    getTweetMemoryId(tweetId?: string): `${string}-${string}-${string}-${string}-${string}`;
    saveTweets(profile: TwitterProfile, tweetsToSave: Tweet[], options?: {
        inReplyToAddAgentId: boolean;
        checkMemoryExists: boolean;
    }): Promise<void>;
    getOrCreateCachedTimeline(profile: TwitterProfile): Promise<{
        ret: boolean;
        res?: Tweet[];
    }>;
    cacheTimeline(username: string, timeline: Tweet[]): Promise<void>;
    cacheMentions(username: string, mentions: Tweet[]): Promise<void>;
    getCachedCookies(username: string): Promise<any[]>;
    cacheCookies(username: string, cookies: any[]): Promise<void>;
    setTwitterProfile(profile: TwitterProfile): void;
    getCharacter(): _elizaos_core.Character;
}

declare class TwitterInteractionClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isDryRun;
    private handleTwitterInteractionsInterval;
    private logger;
    constructor(client: ClientBase, runtime: IAgentRuntime);
    start(): Promise<void>;
    stop(): Promise<boolean>;
    handleTwitterInteractions(): Promise<void>;
    private handleTweet;
    buildConversationThread(tweet: Tweet, maxReplies?: number): Promise<Tweet[]>;
}

type MediaData = {
    data: Buffer;
    mediaType: string;
};

declare class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isProcessing;
    private lastProcessTime;
    private isDryRun;
    private discordClientForApproval;
    private approvalRequired;
    private discordApprovalChannelId;
    private approvalCheckInterval;
    private runPendingTweetCheckInterval;
    private runtimeTwitterPostHelper;
    private backendTaskStatus;
    private logger;
    constructor(client: ClientBase, runtime: IAgentRuntime);
    private setupDiscordClient;
    start(): Promise<void>;
    private runPendingTweetCheckLoop;
    createTweetObject(tweetResult: any, client: any, twitterUsername: string): Tweet;
    processAndCacheTweet(runtime: IAgentRuntime, client: ClientBase, tweet: Tweet, roomId: UUID, rawTweetContent: string): Promise<void>;
    handleNoteTweet(client: ClientBase, content: string, tweetId?: string, mediaData?: MediaData[]): Promise<any>;
    sendStandardTweet(client: ClientBase, content: string, tweetId?: string, mediaData?: MediaData[]): Promise<any>;
    postTweet(runtime: IAgentRuntime, client: ClientBase, tweetTextForPosting: string, roomId: UUID, rawTweetContent: string, twitterUsername: string, mediaData?: MediaData[]): Promise<void>;
    /**
     * Generates and posts a new tweet. If isDryRun is true, only logs what would have been posted.
     */
    generateNewTweet(): Promise<void>;
    private generateTweetContent;
    /**
     * Processes tweet actions (likes, retweets, quotes, replies). If isDryRun is true,
     * only simulates and logs actions without making API calls.
     */
    private processTweetActions;
    /**
     * Processes a list of timelines by executing the corresponding tweet actions.
     * Each timeline includes the tweet, action response, tweet state, and room context.
     * Results are returned for tracking completed actions.
     *
     * @param timelines - Array of objects containing tweet details, action responses, and state information.
     * @returns A promise that resolves to an array of results with details of executed actions.
     */
    private processTimelineActions;
    /**
     * Handles text-only replies to tweets. If isDryRun is true, only logs what would
     * have been replied without making API calls.
     */
    private handleTextOnlyReply;
    stop(): Promise<boolean>;
    private sendForApproval;
    private checkApprovalStatus;
    private cleanupPendingTweet;
    private handlePendingTweet;
}

declare class TwitterSearchClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private respondedTweets;
    private backendTaskStatus;
    private logger;
    constructor(client: ClientBase, runtime: IAgentRuntime);
    stop(): Promise<boolean>;
    start(): Promise<void>;
    private engageWithSearchTermsLoop;
    private engageWithSearchTerms;
}

/**
 * Main class: manage a Twitter Space with N speakers max, speaker queue, filler messages, etc.
 */
declare class TwitterSpaceClient {
    private runtime;
    private client;
    private scraper;
    private isSpaceRunning;
    private currentSpace?;
    private spaceId?;
    private startedAt?;
    private checkInterval?;
    private lastSpaceEndedAt?;
    private sttTtsPlugin?;
    /**
     * We now store an array of active speakers, not just 1
     */
    private activeSpeakers;
    private speakerQueue;
    private decisionOptions;
    private logger;
    constructor(client: ClientBase, runtime: IAgentRuntime);
    /**
     * Periodic check to launch or manage space
     */
    startPeriodicSpaceCheck(): Promise<void>;
    stopPeriodicCheck(): void;
    private shouldLaunchSpace;
    private generateSpaceConfig;
    startSpace(config: SpaceConfig): Promise<void>;
    /**
     * Periodic management: check durations, remove extras, maybe accept new from queue
     */
    private manageCurrentSpace;
    /**
     * If we have available slots, accept new speakers from the queue
     */
    private acceptSpeakersFromQueueIfNeeded;
    private handleSpeakerRequest;
    private acceptSpeaker;
    private removeSpeaker;
    /**
     * If more than maxSpeakers are found, remove extras
     * Also update activeSpeakers array
     */
    private kickExtraSpeakers;
    stopSpace(): Promise<void>;
}

type TwitterConfig = TwitterConfig$1;
/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
declare class TwitterManager {
    private runtime;
    client: ClientBase;
    post: TwitterPostClient;
    search: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    space?: TwitterSpaceClient;
    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig);
    stop(runtime?: IAgentRuntime): Promise<void>;
    start(runtime: IAgentRuntime): Promise<unknown>;
}
declare const TwitterClientInterface: Client;

export { TwitterClientInterface, type TwitterConfig, TwitterManager, TwitterClientInterface as default };
