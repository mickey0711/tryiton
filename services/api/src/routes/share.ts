import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getResultSignedUrl } from "./assets";

const router = Router();

// POST /share/:jobId — create share page
router.post("/:jobId", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { jobId } = req.params;

        // Verify job belongs to user and is done
        const { rows } = await db.query<{ status: string; result_asset_id: string | null }>(
            `SELECT status, result_asset_id FROM jobs WHERE id = $1 AND user_id = $2`,
            [jobId, userId]
        );
        if (!rows.length) throw new AppError("NOT_FOUND", "Job not found", 404);
        if (rows[0].status !== "succeeded") throw new AppError("BAD_REQUEST", "Job not completed");

        // UUID v4 — 122 bits of entropy, far harder to enumerate than 64-bit hex
        const shareId = uuidv4();
        // Share links expire after 30 days
        const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);

        await db.query(
            `INSERT INTO share_pages(id, job_id, user_id, expires_at) VALUES($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [shareId, jobId, userId, expiresAt]
        );

        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'share', $2)`,
            [userId, JSON.stringify({ jobId, shareId })]
        );

        const shareUrl = `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/s?id=${shareId}`;
        res.status(201).json({ share_id: shareId, share_url: shareUrl, expires_at: expiresAt.toISOString() });
    } catch (err) { next(err); }
});

// GET /s/:shareId — public share data (no auth required)
router.get("/s/:shareId", async (req, res, next) => {
    try {
        const { rows } = await db.query<{
            job_id: string; title: string | null;
            fit_score: number | null; result_key: string | null;
            created_at: Date; expires_at: Date | null;
        }>(
            `SELECT s.job_id, p.title, j.fit_score, a.s3_key AS result_key, s.created_at, s.expires_at
       FROM share_pages s
       JOIN jobs j ON j.id = s.job_id
       LEFT JOIN products p ON p.id = j.product_id
       LEFT JOIN assets a ON a.id = j.result_asset_id
       WHERE s.id = $1`,
            [req.params.shareId]
        );
        if (rows.length && rows[0].expires_at && rows[0].expires_at < new Date()) {
            throw new AppError("NOT_FOUND", "Share link has expired", 404);
        }
        if (!rows.length) throw new AppError("NOT_FOUND", "Share not found", 404);
        const row = rows[0];
        const resultUrl = row.result_key ? await getResultSignedUrl(row.result_key) : null;

        res.json({
            share_id: req.params.shareId,
            result_url: resultUrl,
            product_title: row.title,
            fit_score: row.fit_score,
            created_at: row.created_at.toISOString(),
        });
    } catch (err) { next(err); }
});

export default router;
