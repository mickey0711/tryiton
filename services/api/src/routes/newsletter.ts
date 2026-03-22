import { Router } from "express";
import { db } from "../db/client";
import { z } from "zod";

const router = Router();

const SubscribeReq = z.object({
    email:        z.string().email(),
    source:       z.string().optional().default("landing"),
    name:         z.string().max(80).optional(),
    utm_source:   z.string().max(100).optional(),
    utm_medium:   z.string().max(100).optional(),
    utm_campaign: z.string().max(100).optional(),
    utm_content:  z.string().max(100).optional(),
    referrer_url: z.string().max(500).optional(),
});

// POST /newsletter/subscribe — public endpoint, no auth required
router.post("/subscribe", async (req, res, next) => {
    try {
        const { email, source, name, utm_source, utm_medium, utm_campaign, utm_content, referrer_url } =
            SubscribeReq.parse(req.body);

        const ip =
            (req.headers["cf-connecting-ip"] as string) ||
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
            req.socket.remoteAddress || null;

        const country = (req.headers["cf-ipcountry"] as string) || null;

        await db.query(
            `INSERT INTO newsletter_subscribers(email, source, name, utm_source, utm_medium, utm_campaign, utm_content, referrer_url, ip, country)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (email) DO UPDATE SET
               source       = EXCLUDED.source,
               utm_source   = COALESCE(newsletter_subscribers.utm_source, EXCLUDED.utm_source),
               utm_medium   = COALESCE(newsletter_subscribers.utm_medium, EXCLUDED.utm_medium),
               utm_campaign = COALESCE(newsletter_subscribers.utm_campaign, EXCLUDED.utm_campaign),
               utm_content  = COALESCE(newsletter_subscribers.utm_content, EXCLUDED.utm_content),
               referrer_url = COALESCE(newsletter_subscribers.referrer_url, EXCLUDED.referrer_url),
               country      = COALESCE(newsletter_subscribers.country, EXCLUDED.country),
               updated_at   = NOW()
             RETURNING id`,
            [email.toLowerCase().trim(), source, name ?? null,
             utm_source ?? null, utm_medium ?? null, utm_campaign ?? null, utm_content ?? null,
             referrer_url ?? null, ip, country]
        );

        res.status(201).json({ ok: true, message: "Subscribed successfully!" });
    } catch (err: any) {
        if (err?.issues) return res.status(400).json({ error: "VALIDATION", message: "Invalid email address" });
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
