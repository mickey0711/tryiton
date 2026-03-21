import { Router } from "express";
import { db } from "../db/client";
import { z } from "zod";

const router = Router();

const SubscribeReq = z.object({
    email:  z.string().email(),
    source: z.string().optional().default("landing"),
    name:   z.string().max(80).optional(),
});

// POST /newsletter/subscribe — public endpoint, no auth required
router.post("/subscribe", async (req, res, next) => {
    try {
        const { email, source, name } = SubscribeReq.parse(req.body);

        await db.query(
            `INSERT INTO newsletter_subscribers(email, source, name)
             VALUES($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET
               source     = EXCLUDED.source,
               updated_at = NOW()
             RETURNING id`,
            [email.toLowerCase().trim(), source, name ?? null]
        );

        res.status(201).json({ ok: true, message: "Subscribed successfully!" });
    } catch (err: any) {
        if (err?.issues) {
            return res.status(400).json({ error: "VALIDATION", message: "Invalid email address" });
        }
        next(err);
    }
});

// GET /newsletter/count — public stats for social proof
router.get("/count", async (_req, res, next) => {
    try {
        const { rows } = await db.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM newsletter_subscribers WHERE confirmed = true OR confirmed IS NULL`
        );
        const count = Math.max(parseInt(rows[0].count) + 847, 0); // +847 seed offset for social proof
        res.json({ subscribers: count });
    } catch (err) { next(err); }
});

export default router;
