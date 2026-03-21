import { logger } from "../config/logger";

export interface GenerateJobPayload {
    jobId: string;
    userId: string;
    productId: string;
    category: string;
    intent: string;
    qualityProfile: string;
    userAssetKey: string;
    productAssetKey: string;
    roomAssetKey?: string;
    handAssetKey?: string;
}

// Queue is only available if REDIS_URL is configured
let _generateQueue: any = null;

export function getGenerateQueue() {
    if (!_generateQueue) {
        if (!process.env.REDIS_URL) {
            throw new Error("REDIS_URL not configured — job queue unavailable");
        }
        const { Queue } = require("bullmq");
        const { redis } = require("../config/redis");
        _generateQueue = new Queue<GenerateJobPayload>("generate", {
            connection: redis,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 2000 },
                removeOnComplete: { count: 200 },
                removeOnFail: { count: 100 },
            },
        });
        _generateQueue.on("error", (err: Error) =>
            logger.error({ err }, "Generate queue error")
        );
    }
    return _generateQueue;
}

// Backwards-compatible export (lazy — only throws if actually used without Redis)
export const generateQueue = new Proxy({} as any, {
    get(_target, prop) {
        return getGenerateQueue()[prop];
    },
});
