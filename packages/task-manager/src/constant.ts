import assert from 'assert';
import * as crypto from 'crypto';

export const workerUuid = crypto.randomUUID();
// 10min
export const taskTimeout = 1000 * 60 * 10;
// 10min
export const lockTimeout = 1000 * 60 * 10;

export const mongodbUri = process.env.TASK_MONGODB_URI;
assert(mongodbUri, 'TASK_MONGODB_URI is required');
export const mongodbCaFile = process.env.TASK_MONGODB_CA_FILE || `${process.cwd()}/secrets/ca.crt`;
export const taskMongodbCollectionName = process.env.TASK_MONGODB_COLLECTION_NAME || 'ClientTwitterTask';
export const taskManagerHttpServicePort = process.env.TASK_MANAGER_HTTP_SERVICE_PORT || 3000;
