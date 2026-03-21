import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler";

export interface AuthRequest extends Request {
    userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return next(new AppError("UNAUTHORIZED", "Missing auth token", 401));
    }

    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
            sub: string;
        };
        (req as AuthRequest).userId = payload.sub;
        next();
    } catch {
        next(new AppError("UNAUTHORIZED", "Invalid or expired token", 401));
    }
}
