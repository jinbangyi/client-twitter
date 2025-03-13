import { ActionTimelineType, Client } from '@elizaos/core';
import { z } from 'zod';

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

type TwitterConfig = TwitterConfig$1;
declare const TwitterClientInterface: Client;

export { TwitterClientInterface, type TwitterConfig, TwitterClientInterface as default };
