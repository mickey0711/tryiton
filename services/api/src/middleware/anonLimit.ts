import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { AuthRequest } from "./auth";

/**
 * Freemium guard for endpoints that call paid AI providers.
 * Signed-in users are charged credits by the route itself; anonymous callers get a
 * small per-IP daily allowance (the "one free try before sign-in" flow) and nothing more.
 * In-memory — fine for a single API instance; move to Redis if we scale out.
 */
const ANON_DAILY_LIMIT = Number(process.env.ANON_TRYON_DAILY_LIMIT ?? 2);
const DAY_MS = 24 * 3600_000;
const anonUsage = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
    const now = Date.now();
    for (const [ip, v] of anonUsage) if (now > v.resetAt) anonUsage.delete(ip);
}, 3600_000).unref();

export function anonLimit(req: Request, _res: Response, next: NextFunction) {
    if ((req as AuthRequest).userId) return next();  // authenticated → credits apply instead
    if (ANON_DAILY_LIMIT <= 0) {
        return next(new AppError("UNAUTHORIZED", "Please sign in to use this feature", 401));
    }
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const entry = anonUsage.get(ip) ?? { count: 0, resetAt: now + DAY_MS };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + DAY_MS; }
    if (entry.count >= ANON_DAILY_LIMIT) {
        return next(new AppError("UNAUTHORIZED", "Free try-on used — sign in to get 5 free try-ons", 401));
    }
    entry.count += 1;
    anonUsage.set(ip, entry);
    next();
}

/** Accept only image payloads we expect: an https URL or an inline data:image/… URI. */
export function isImageInput(value: unknown, maxLen = 12_000_000): value is string {
    if (typeof value !== "string" || !value || value.length > maxLen) return false;
    if (value.startsWith("data:image/")) return true;
    try {
        const u = new URL(value);
        return u.protocol === "https:" || u.protocol === "http:";
    } catch { return false; }
}
