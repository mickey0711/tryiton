import { Router } from "express";
import { db } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { AddFavoriteReq, SaveItemReq } from "@tryiton/shared";

const router = Router();
router.use(requireAuth);

// ─── FAVORITES ────────────────────────────────────────────────────────────────

router.post("/favorites", async (req, res, next) => {
    try {
        const { product_id } = AddFavoriteReq.parse(req.body);
        const userId = (req as AuthRequest).userId;
        await db.query(
            `INSERT INTO favorites(user_id, product_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
            [userId, product_id]
        );
        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'favorite', $2)`,
            [userId, JSON.stringify({ product_id })]
        );
        res.status(201).json({ ok: true });
    } catch (err) { next(err); }
});

router.get("/favorites", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT f.id, f.created_at,
              p.id AS product_id, p.title, p.brand, p.price, p.category,
              p.canonical_url, p.metadata
       FROM favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
            [userId]
        );
        res.json({ items: rows });
    } catch (err) { next(err); }
});

router.delete("/favorites/:id", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rowCount } = await db.query(
            `DELETE FROM favorites WHERE id = $1 AND user_id = $2`,
            [req.params.id, userId]
        );
        if (!rowCount) throw new AppError("NOT_FOUND", "Favorite not found", 404);
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ─── SAVED ────────────────────────────────────────────────────────────────────

router.post("/saved", async (req, res, next) => {
    try {
        const body = SaveItemReq.parse(req.body);
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ id: string }>(
            `INSERT INTO saved_items(user_id, job_id, product_id, snapshot)
       VALUES($1, $2, $3, $4) RETURNING id`,
            [userId, body.job_id, body.product_id, JSON.stringify(body.snapshot)]
        );
        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'save', $2)`,
            [userId, JSON.stringify({ saved_id: rows[0].id })]
        );
        res.status(201).json({ id: rows[0].id });
    } catch (err) { next(err); }
});

router.get("/saved", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT s.id, s.snapshot, s.created_at,
              p.id AS product_id, p.title, p.brand, p.category
       FROM saved_items s
       LEFT JOIN products p ON p.id = s.product_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
            [userId]
        );
        res.json({ items: rows });
    } catch (err) { next(err); }
});

router.delete("/saved/:id", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rowCount } = await db.query(
            `DELETE FROM saved_items WHERE id = $1 AND user_id = $2`,
            [req.params.id, userId]
        );
        if (!rowCount) throw new AppError("NOT_FOUND", "Item not found", 404);
        res.json({ ok: true });
    } catch (err) { next(err); }
});

export default router;
