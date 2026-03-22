import "dotenv/config";
import * as Sentry from "@sentry/node";

// ─── Sentry (optional — only initializes if DSN is set) ────────────────────────
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.2,
        environment: process.env.NODE_ENV ?? "development",
    });
}

import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/errorHandler";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import assetsRouter from "./routes/assets";
import productsRouter from "./routes/products";
import jobsRouter from "./routes/jobs";
import libraryRouter from "./routes/library";
import shareRouter from "./routes/share";
import meRouter from "./routes/me";
import newsletterRouter from "./routes/newsletter";
import referralRouter from "./routes/referral";
import paymentsRouter from "./routes/payments";
import pricesRouter from "./routes/prices";
import sizeRouter from "./routes/size";
import oauthRouter from "./routes/oauth";
import spaceRouter from "./routes/space";
import privacyRouter from "./routes/privacy";

const app = express();

// ─── Correlation ID ────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    (req as any).requestId = uuidv4();
    next();
});

// ─── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
    cors({
        origin: (origin, cb) => {
            const allowed = process.env.CORS_ORIGINS?.split(",") ?? [];
            // Allow no-origin for server-to-server and curl
            if (!origin || allowed.some((o) => origin.startsWith(o.trim()))) {
                cb(null, true);
            } else {
                cb(new Error(`CORS: origin ${origin} not allowed`));
            }
        },
        credentials: true,
    })
);

// ─── Rate limiting ──────────────────────────────────────────────────────────────
app.use(
    rateLimit({
        windowMs: 60 * 1000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "RATE_LIMITED", message: "Too many requests" },
    })
);

// ─── Body parsing ──────────────────────────────────────────────────────────────
// Stripe webhook needs raw body — mount it BEFORE json parsing
app.use("/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ─── Logging ───────────────────────────────────────────────────────────────────
app.use(
    pinoHttp({
        logger,
        customProps: (req) => ({ requestId: (req as any).requestId }),
    })
);

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/assets", assetsRouter);
app.use("/products", productsRouter);
app.use("/fit/jobs", jobsRouter);
app.use("/library", libraryRouter);
app.use("/share", shareRouter);
app.use("/me", meRouter);
app.use("/newsletter", newsletterRouter);
app.use("/referral", referralRouter);
app.use("/payments", paymentsRouter);
app.use("/prices", pricesRouter);
app.use("/size", sizeRouter);
app.use("/auth/oauth", oauthRouter);
app.use("/space", spaceRouter);
app.use("/privacy", privacyRouter);

// ─── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
});

// ─── Error handler ─────────────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
    // Must come AFTER all routes, BEFORE custom error handler
    app.use(Sentry.Handlers.errorHandler());
}
app.use(errorHandler);

export default app;
