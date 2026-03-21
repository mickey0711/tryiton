import app from "./app";
import { logger } from "./config/logger";
import { db } from "./db/client";

const PORT = parseInt(process.env.PORT ?? "8080", 10);

async function start() {
    try {
        // Test DB
        await db.query("SELECT 1");
        logger.info("✅ Database connected");

        // Test Redis (optional — skip if not configured)
        if (process.env.REDIS_URL) {
            try {
                const { redis } = await import("./config/redis");
                await redis.ping();
                logger.info("✅ Redis connected");
            } catch (redisErr) {
                logger.warn({ err: redisErr }, "⚠️  Redis unavailable — job queue disabled");
            }
        } else {
            logger.info("ℹ️  REDIS_URL not set — running without job queue");
        }

        app.listen(PORT, () => {
            logger.info({ port: PORT }, "🚀 TryItOn API running");
        });
    } catch (err) {
        logger.error({ err }, "❌ Startup failed");
        process.exit(1);
    }
}

start();
