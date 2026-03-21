import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";

export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    const requestId = (req as any).requestId;

    if (err instanceof ZodError) {
        return res.status(400).json({
            error: "VALIDATION_ERROR",
            message: "Invalid request data",
            details: err.flatten().fieldErrors,
            request_id: requestId,
        });
    }

    if (err instanceof AppError) {
        logger.warn({ err, requestId }, err.message);
        return res.status(err.statusCode).json({
            error: err.code,
            message: err.message,
            request_id: requestId,
        });
    }

    logger.error({ err, requestId }, "Unhandled error");
    return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        request_id: requestId,
    });
}

export class AppError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode = 400
    ) {
        super(message);
        this.name = "AppError";
    }
}
