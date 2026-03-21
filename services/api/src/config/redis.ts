import { Redis } from "ioredis";
import { logger } from "./logger";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null, // required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
});

redis.on("error", (err) => logger.error({ err }, "Redis error"));
