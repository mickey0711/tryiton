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
import path from "path";
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
import legalRouter from "./routes/legal";
import adminRouter from "./routes/admin";
import whatsappRouter from "./routes/whatsapp";
import messengerRouter from "./routes/messenger";
import chatRouter from "./routes/chat";
import tryonDirectRouter from "./routes/tryonDirect";
import payplusRouter from "./routes/payplus";

const app = express();

// ─── Correlation ID ────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    (req as any).requestId = uuidv4();
    next();
});

// ─── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
            // Allow onclick/onmouseover attributes — landing page uses them extensively
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:"],
            frameSrc: ["'self'", "https://accounts.google.com"],
        },
    },
}));
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
// Webhook routes need raw body for HMAC signature verification — BEFORE json()
app.use("/payments/webhook", express.raw({ type: "application/json" }));
app.use("/payplus/webhook",  express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ─── Logging ───────────────────────────────────────────────────────────────────
app.use(
    pinoHttp({
        logger,
        customProps: (req) => ({ requestId: (req as any).requestId }),
    })
);

// ─── Static files (images, _next/static/ JS/CSS chunks, etc.) ────────────────
// MUST be before route handlers — otherwise /_next requests fall through to 404
const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir, { index: false }));
// DO App Platform ingress strips the /_next prefix before forwarding to this service,
// so the browser's /_next/static/chunks/... arrives here as /static/chunks/...
// Second static root points at publicDir/_next so these stripped paths resolve.
app.use(express.static(path.join(publicDir, "_next"), { index: false }));

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
app.use("/admin", adminRouter);
app.use("/whatsapp", whatsappRouter);
app.use("/messenger", messengerRouter);
app.use("/chat", chatRouter);
app.use("/fit/tryon-direct", tryonDirectRouter);
app.use("/payplus", payplusRouter);
app.use("/", legalRouter);

// ─── HTML pages — no-cache headers ───────────────────────────────────────────
const noCacheHtml = (_req: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
};

// Express landing page
app.get("/", noCacheHtml, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});
app.get("/privacy.html", noCacheHtml, (_req, res) => {
    res.sendFile(path.join(publicDir, "privacy.html"));
});
app.get("/terms.html", noCacheHtml, (_req, res) => {
    res.sendFile(path.join(publicDir, "terms.html"));
});
app.get("/refund", noCacheHtml, (_req, res) => {
    res.sendFile(path.join(publicDir, "refund.html"));
});
app.get("/refund.html", noCacheHtml, (_req, res) => {
    res.sendFile(path.join(publicDir, "refund.html"));
});

// Next.js app pages (pre-built HTML, served fresh so users always get latest)
const nextPages: Record<string, string> = {
    "/login":         "login.html",
    "/login.html":    "login.html",
    "/register":      "register.html",
    "/register.html": "register.html",
    "/saved":         "saved.html",
    "/saved.html":    "saved.html",
    "/account":       "account.html",
    "/account.html":  "account.html",
    "/s":             "s.html",
    "/s.html":        "s.html",
    "/auth/success":        "auth/success.html",
    "/auth/success.html":   "auth/success.html",
};
Object.entries(nextPages).forEach(([route, file]) => {
    app.get(route, noCacheHtml, (_req, res) => {
        res.sendFile(path.join(publicDir, file));
    });
});

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
