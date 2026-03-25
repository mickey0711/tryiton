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

async function sendNewsletterWelcome(email: string, name?: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const firstName = name?.split(" ")[0] ?? "there";
    await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: "Mickey from TryIt4U <hello@tryit4u.ai>",
            to: [email],
            subject: "You're on the TryIt4U waitlist! 🎉",
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0d0c18;color:#f0f0f8;margin:0;padding:20px}
.card{max-width:500px;margin:0 auto;background:#15151f;border:1px solid rgba(99,102,241,0.3);border-radius:16px;padding:36px 28px}
.logo{font-size:26px;font-weight:700;color:#fff;margin-bottom:20px}
.title{font-size:20px;font-weight:600;color:#fff;margin-bottom:8px}
.text{font-size:14px;color:#9090b0;margin-bottom:20px;line-height:1.6}
.btn{display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px}
.footer{font-size:11px;color:#60607a;margin-top:24px}
</style></head><body><div class="card">
<div class="logo">TryIt4U ✨</div>
<div class="title">You're in, ${firstName}! 🎉</div>
<div class="text">Welcome to the TryIt4U waitlist — you're among the first to experience AI virtual try-on for fashion &amp; home.<br><br>
We'll notify you the moment early access opens. In the meantime, install our Chrome extension and start trying on anything from any store!
</div>
<a class="btn" href="https://tryit4u.ai">🛍️ Visit TryIt4U</a>
<div class="footer">© 2026 TryIt4U · <a href="https://tryit4u.ai" style="color:#6366f1">tryit4u.ai</a></div>
</div></body></html>`,
        }),
    }).catch(() => {}); // non-critical
}


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

        // Fire-and-forget welcome email
        sendNewsletterWelcome(email.toLowerCase().trim(), name).catch(() => {});

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
