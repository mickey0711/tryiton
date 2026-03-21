import { Router } from "express";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /me — user profile
router.get("/", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT u.id, u.email, u.full_name, u.plan, u.credits, u.is_admin,
              u.email_verified, u.created_at,
              p.skin_tone, p.face_shape, p.body_metrics
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
            [userId]
        );
        if (!rows.length) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
        res.json({ user: rows[0] });
    } catch (err) { next(err); }
});

// PATCH /me/profile — update name/phone
router.patch("/profile", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { full_name, phone } = req.body as { full_name?: string; phone?: string };
        const { rows } = await db.query<{ id: string; full_name: string }>(
            `UPDATE users SET full_name = COALESCE($1, full_name),
                              phone = COALESCE($2, phone),
                              updated_at = NOW()
             WHERE id = $3
             RETURNING id, full_name`,
            [full_name?.trim() || null, phone?.trim() || null, userId]
        );
        if (!rows.length) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
        res.json({ ok: true, user: rows[0] });
    } catch (err) { next(err); }
});

// DELETE /me — full GDPR wipe: assets, jobs, favorites, saved, events, profile, tokens
router.delete("/", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            // Cascade deletes: user_profiles, assets, jobs, favorites, saved_items, events,
            // share_pages, refresh_tokens all have ON DELETE CASCADE from users.id
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
