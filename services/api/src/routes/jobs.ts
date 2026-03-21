import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { generateQueue } from "../services/queue";
import { CreateJobReq } from "@tryiton/shared";
import { getResultSignedUrl } from "./assets";

const router = Router();
router.use(requireAuth);

// POST /fit/jobs — create a generation job
router.post("/", async (req, res, next) => {
    try {
        const body = CreateJobReq.parse(req.body);
        const userId = (req as AuthRequest).userId;

        // Fetch user asset S3 keys
        const assetRes = await db.query<{ id: string; s3_key: string; type: string }>(
            `SELECT id, s3_key, type FROM assets WHERE user_id = $1 AND id = ANY($2)`,
            [userId, [body.user_asset_id, body.room_asset_id, body.hand_asset_id].filter(Boolean)]
        );
        const assetMap = Object.fromEntries(assetRes.rows.map((r) => [r.id, r]));

        const userAsset = assetMap[body.user_asset_id];
        if (!userAsset) throw new AppError("NOT_FOUND", "User asset not found", 404);

        // Fetch product
        const prodRes = await db.query<{ id: string; canonical_url: string; category: string }>(
            `SELECT id, canonical_url, category FROM products WHERE id = $1`,
            [body.product_id]
        );
        if (!prodRes.rows.length) throw new AppError("NOT_FOUND", "Product not found", 404);
        const product = prodRes.rows[0];

        const jobId = uuidv4();
        const inputAssets = {
            user: userAsset.s3_key,
            room: body.room_asset_id ? assetMap[body.room_asset_id]?.s3_key : undefined,
            hand: body.hand_asset_id ? assetMap[body.hand_asset_id]?.s3_key : undefined,
        };

        await db.query(
            `INSERT INTO jobs(id, user_id, product_id, intent, category, quality_profile, input_assets, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, 'queued')`,
            [jobId, userId, body.product_id, body.intent, body.category, body.quality_profile, JSON.stringify(inputAssets)]
        );

        // Enqueue GPU job
        await generateQueue.add("generate", {
            jobId,
            userId,
            productId: body.product_id,
            category: body.category,
            intent: body.intent,
            qualityProfile: body.quality_profile,
            userAssetKey: userAsset.s3_key,
            productAssetKey: product.canonical_url ?? "",
            roomAssetKey: inputAssets.room,
            handAssetKey: inputAssets.hand,
        });

        // Track event
        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'generate_start', $2)`,
            [userId, JSON.stringify({ jobId, category: body.category })]
        );

        res.status(201).json({ job_id: jobId });
    } catch (err) {
        next(err);
    }
});

// GET /fit/jobs/:id — SSE progress stream
router.get("/:id", async (req, res, next) => {
    const userId = (req as AuthRequest).userId;
    const jobId = req.params.id;
    const acceptsSSE = req.headers.accept?.includes("text/event-stream");

    try {
        const { rows } = await db.query<{
            id: string;
            status: string;
            progress: number;
            fit_score: number | null;
            confidence: number | null;
            explanation: string[];
            result_asset_id: string | null;
            timings_ms: Record<string, number> | null;
            created_at: Date;
        }>(
            `SELECT j.id, j.status, j.progress, j.fit_score, j.confidence,
              j.explanation, j.result_asset_id, j.timings_ms, j.created_at,
              a.s3_key AS result_key
       FROM jobs j
       LEFT JOIN assets a ON a.id = j.result_asset_id
       WHERE j.id = $1 AND j.user_id = $2`,
            [jobId, userId]
        );

        if (!rows.length) throw new AppError("NOT_FOUND", "Job not found", 404);
        const job = rows[0];

        const resultUrl: string | null =
            job.result_asset_id && (job as any).result_key
                ? await getResultSignedUrl((job as any).result_key)
                : null;

        const payload = {
            job_id: job.id,
            status: job.status,
            progress: job.progress,
            fit_score: job.fit_score,
            confidence: job.confidence,
            explanation: job.explanation ?? [],
            result_signed_url: resultUrl,
            result_thumbnail_url: null,
            timings_ms: job.timings_ms,
            created_at: job.created_at.toISOString(),
        };

        if (acceptsSSE) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
            send(payload);

            if (job.status === "succeeded" || job.status === "failed") {
                res.end();
                return;
            }

            // Poll DB every 1.5s and push until done or client disconnects
            const interval = setInterval(async () => {
                try {
                    const { rows: fresh } = await db.query<{
                        status: string;
                        progress: number;
                        fit_score: number | null;
                        result_asset_id: string | null;
                    }>(
                        `SELECT j.status, j.progress, j.fit_score, j.result_asset_id, a.s3_key AS result_key
             FROM jobs j LEFT JOIN assets a ON a.id = j.result_asset_id
             WHERE j.id = $1`,
                        [jobId]
                    );
                    if (!fresh.length) return;
                    const f = fresh[0];
                    const url = f.result_asset_id && (f as any).result_key
                        ? await getResultSignedUrl((f as any).result_key)
                        : null;
                    send({ ...payload, status: f.status, progress: f.progress, fit_score: f.fit_score, result_signed_url: url });
                    if (f.status === "succeeded" || f.status === "failed") {
                        clearInterval(interval);
                        res.end();
                    }
                } catch { clearInterval(interval); res.end(); }
            }, 1500);

            req.on("close", () => clearInterval(interval));
        } else {
            res.json(payload);
        }
    } catch (err) {
        next(err);
    }
});

// POST /fit/jobs/:id/regenerate — requeue same inputs
router.post("/:id/regenerate", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{
            product_id: string; category: string; intent: string;
            quality_profile: string; input_assets: any;
        }>(
            `SELECT product_id, category, intent, quality_profile, input_assets
       FROM jobs WHERE id = $1 AND user_id = $2`,
            [req.params.id, userId]
        );
        if (!rows.length) throw new AppError("NOT_FOUND", "Job not found", 404);
        const src = rows[0];

        const newJobId = uuidv4();
        await db.query(
            `INSERT INTO jobs(id, user_id, product_id, intent, category, quality_profile, input_assets, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, 'queued')`,
            [newJobId, userId, src.product_id, src.intent, src.category, src.quality_profile, JSON.stringify(src.input_assets)]
        );
        await generateQueue.add("generate", {
            jobId: newJobId,
            userId,
            productId: src.product_id,
            category: src.category,
            intent: src.intent,
            qualityProfile: src.quality_profile,
            userAssetKey: src.input_assets.user,
            productAssetKey: src.input_assets.product ?? "",
            roomAssetKey: src.input_assets.room,
            handAssetKey: src.input_assets.hand,
        });

        res.status(201).json({ job_id: newJobId });
    } catch (err) { next(err); }
});

export default router;
