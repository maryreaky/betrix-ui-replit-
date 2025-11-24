/**
 * queue.js
 * Minimal BullMQ queue wrapper. Expects REDIS_URL env var (redis://:pass@host:port)
 */
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || process.env.REDIS_URI || process.env.REDIS);
const jobsQueue = new Queue('jobs', { connection });

module.exports = { jobsQueue, connection };
