import { Router } from "express";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, S3_BUCKET } from "../config/s3";

const router = Router();
router.use(requireAuth);

// ─── Helper: sign an S3 key → CDN/presigned URL ───────────────────────────────
async function signKey(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
        const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
        return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    } catch { return null; }
}

// GET /me — user profile
router.get("/", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        let rows: any[];
        try {
            ({ rows } = await db.query(
                `SELECT u.id, u.email, u.full_name, u.phone, u.plan, u.credits, u.is_admin,
                  u.email_verified, u.created_at, u.address,
                  u.payplus_subscription_id, u.payplus_plan, u.subscription_expires_at,
                  p.skin_tone, p.face_shape, p.body_metrics,
                  (SELECT COUNT(*) FROM jobs    WHERE user_id = u.id AND status = 'done')::int AS tryon_count,
                  (SELECT COUNT(*) FROM saved_items WHERE user_id = u.id)::int AS saved_count
           FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
           WHERE u.id = $1`,
                [userId]
            ));
        } catch {
            // Full query failed (e.g. missing column from pending migration) — fall back to minimal query
            ({ rows } = await db.query(
                `SELECT u.id, u.email, u.plan, u.credits, u.is_admin, u.created_at
                 FROM users u WHERE u.id = $1`,
                [userId]
            ));
        }
        if (!rows.length) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
        res.json({ user: rows[0] });
    } catch (err) { next(err); }
});

// PATCH /me/profile — update name / phone
router.patch("/profile", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { full_name, phone } = req.body as { full_name?: string; phone?: string };
        const { rows } = await db.query(
            `UPDATE users SET full_name = COALESCE($1, full_name),
                              phone = COALESCE($2, phone),
                              updated_at = NOW()
             WHERE id = $3
             RETURNING id, full_name, phone`,
            [full_name?.trim() || null, phone?.trim() || null, userId]
        );
        if (!rows.length) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
        res.json({ ok: true, user: rows[0] });
    } catch (err) { next(err); }
});

// GET /me/address — delivery address
router.get("/address", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT address FROM users WHERE id = $1`, [userId]
        );
        res.json({ address: rows[0]?.address ?? {} });
    } catch (err) { next(err); }
});

// PUT /me/address — save delivery address
router.put("/address", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { line1, line2, city, zip, state, country } = req.body as {
            line1?: string; line2?: string; city?: string;
            zip?: string;   state?: string; country?: string;
        };
        const address = { line1, line2, city, zip, state, country };
        await db.query(
            `UPDATE users SET address = $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(address), userId]
        );
        res.json({ ok: true, address });
    } catch (err) { next(err); }
});

// GET /me/photos — uploaded user photos (type = 'user')
router.get("/photos", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT id, s3_key, type, mime, width, height, created_at
             FROM assets WHERE user_id = $1 AND type = 'user'
             ORDER BY created_at DESC LIMIT 50`,
            [userId]
        );
        const photos = await Promise.all(rows.map(async (r) => ({
            ...r,
            url: await signKey(r.s3_key),
        })));
        res.json({ photos });
    } catch (err) { next(err); }
});

// GET /me/jobs — try-on history
router.get("/jobs", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const limit  = Math.min(parseInt(String(req.query.limit  ?? 20)), 50);
        const offset = parseInt(String(req.query.offset ?? 0));
        const { rows } = await db.query(
            `SELECT j.id, j.category, j.status, j.fit_score, j.created_at,
              j.error_message,
              p.title AS product_title, p.canonical_url AS product_url, p.brand,
              a.s3_key AS result_key
             FROM jobs j
             LEFT JOIN products p ON p.id = j.product_id
             LEFT JOIN assets   a ON a.id = j.result_asset_id
             WHERE j.user_id = $1
             ORDER BY j.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        const jobs = await Promise.all(rows.map(async (r) => ({
            ...r,
            result_url: await signKey(r.result_key),
        })));
        res.json({ jobs, total: jobs.length });
    } catch (err) { next(err); }
});

// GET /me/saved — saved/wishlist items
router.get("/saved", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT s.id, s.snapshot, s.created_at,
              p.title, p.canonical_url, p.brand, p.price, p.category,
              a.s3_key AS result_key
             FROM saved_items s
             LEFT JOIN products p ON p.id = s.product_id
             LEFT JOIN jobs     j ON j.id = s.job_id
             LEFT JOIN assets   a ON a.id = j.result_asset_id
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC LIMIT 50`,
            [userId]
        );
        const items = await Promise.all(rows.map(async (r) => ({
            ...r,
            result_url: await signKey(r.result_key),
        })));
        res.json({ items });
    } catch (err) { next(err); }
});

// GET /me/billing — billing/payment history
router.get("/billing", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows: userRows } = await db.query(
            `SELECT plan, credits, payplus_subscription_id, payplus_plan, subscription_expires_at
             FROM users WHERE id = $1`, [userId]
        );
        const { rows: payments } = await db.query(
            `SELECT id, provider, transaction_id, plan, amount, currency, status, created_at
             FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
            [userId]
        );
        res.json({ billing: userRows[0] ?? {}, payments });
    } catch (err) { next(err); }
});

// DELETE /me — full GDPR wipe
router.delete("/", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
        res.json({ ok: true, message: "Account and all data permanently deleted" });
    } catch (err) { next(err); }
});

export default router;
