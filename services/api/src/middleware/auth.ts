import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler";
import { db } from "../db/client";

export interface AuthRequest extends Request {
    userId: string;
}

// Short-lived cache so we don't hit Postgres on every request just to confirm
// the account still exists (deleted accounts must stop working before the JWT expires).
const liveUsers = new Map<string, number>();  // userId → expiresAt (ms)
const LIVE_TTL_MS = 60_000;

async function userStillExists(userId: string): Promise<boolean> {
    const until = liveUsers.get(userId);
    if (until && until > Date.now()) return true;
    const { rowCount } = await db.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
    if (rowCount) liveUsers.set(userId, Date.now() + LIVE_TTL_MS);
    else liveUsers.delete(userId);
    return !!rowCount;
}

/** Call after deleting a user so a cached "exists" entry doesn't outlive the row. */
export function forgetUser(userId: string) {
    liveUsers.delete(userId);
}

function readBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    return header.slice(7).trim() || null;
}

function verifyToken(token: string): string {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ["HS256"] }) as { sub?: string };
    if (!payload.sub) throw new Error("no sub");
    return payload.sub;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
    const token = readBearer(req);
    if (!token) return next(new AppError("UNAUTHORIZED", "Missing auth token", 401));

    let userId: string;
    try {
        userId = verifyToken(token);
    } catch {
        return next(new AppError("UNAUTHORIZED", "Invalid or expired token", 401));
    }

    try {
        if (!(await userStillExists(userId))) {
            return next(new AppError("UNAUTHORIZED", "Account no longer exists", 401));
        }
    } catch (err) {
        return next(err);
    }

    (req as AuthRequest).userId = userId;
    next();
}

/**
 * Like requireAuth but lets anonymous requests through with userId undefined.
 * Used for the freemium "one free try before sign-in" flow.
 * An invalid/expired token is treated as anonymous rather than rejected.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    const token = readBearer(req);
    if (!token) return next();
    try {
        const userId = verifyToken(token);
        if (await userStillExists(userId)) (req as AuthRequest).userId = userId;
    } catch { /* anonymous */ }
    next();
}
