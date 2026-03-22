import { Pool } from "pg";
import { logger } from "../config/logger";

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

db.on("error", (err) => logger.error({ err }, "DB pool error"));
