import assert from 'assert';
import * as crypto from 'crypto';
// load .env file
import dotenv from 'dotenv';
import { join } from 'path';
console.log(join(process.cwd(), '.env'));
dotenv.config({ path: join(process.cwd(), '.env') });

export const workerUuid = crypto.randomUUID();
// 10min
export const taskTimeout = 1000 * 60 * 10;
// 10min
export const lockTimeout = 1000 * 60 * 10;
// 10min
export const leaseTime = 1000 * 60 * 10;

export const mongodbUri = process.env.TASK_MONGODB_URI;
assert(mongodbUri, 'TASK_MONGODB_URI is required');
//  || `${process.cwd()}/secrets/ca.crt`
export const mongodbCaFile = process.env.TASK_MONGODB_CA_FILE;
export const mongodbDbName = process.env.MONGODB_DB_NAME || 'core';
export const taskMongodbCollectionName = process.env.TASK_MONGODB_COLLECTION_NAME || 'ClientTwitterTask';
export const lockMongodbCollectionName = process.env.LOCK_MONGODB_COLLECTION_NAME || 'ClientTwitterTaskLock';
export const taskManagerHttpServicePort = process.env.TASK_MANAGER_HTTP_SERVICE_PORT || 3000;
