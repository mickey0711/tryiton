import { Router } from "express";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

// Stripe is loaded lazily — only if STRIPE_SECRET_KEY is set
let stripe: any = null;
function getStripe() {
    if (!stripe) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Stripe = require("stripe");
        stripe = new Stripe(key, { apiVersion: "2024-04-10" });
    }
    return stripe;
}

const PLANS: Record<string, { priceId: string; credits: number; label: string; price: number; recurring: boolean }> = {
    // ─── Subscriptions ────────────────────────────────────────────────────────
    pro_basic: {
        priceId: process.env.PADDLE_PRO_BASIC_PRICE_ID ?? "price_placeholder_pro_basic",
        credits: 50,
        label: "Pro Basic — 50 try-ons/mo",
        price: 19.90,
        recurring: true,
    },
    pro_plus: {
        priceId: process.env.PADDLE_PRO_PLUS_PRICE_ID ?? "price_placeholder_pro_plus",
        credits: 150,
        label: "Pro Plus — 150 try-ons/mo",
        price: 49.90,
        recurring: true,
    },
    // ─── Credit Packs ─────────────────────────────────────────────────────────
    credits_20: {
        priceId: process.env.PADDLE_CREDITS_20_PRICE_ID ?? "price_placeholder_credits_20",
        credits: 20,
        label: "20 Credits Pack",
        price: 9.99,
        recurring: false,
    },
    credits_40: {
        priceId: process.env.PADDLE_CREDITS_40_PRICE_ID ?? "price_placeholder_credits_40",
        credits: 40,
        label: "40 Credits Pack",
        price: 19.99,
        recurring: false,
    },
    credits_130: {
        priceId: process.env.PADDLE_CREDITS_130_PRICE_ID ?? "price_placeholder_credits_130",
        credits: 130,
        label: "130 Credits Pack",
        price: 49.90,
        recurring: false,
    },
    credits_200: {
        priceId: process.env.PADDLE_CREDITS_200_PRICE_ID ?? "price_placeholder_credits_200",
        credits: 200,
        label: "200 Credits Pack",
        price: 99.00,
        recurring: false,
    },
};

// ─── Create Checkout Session ─────────────────────────────────────────────────

router.post("/checkout", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { plan } = req.body as { plan: string };

        if (!PLANS[plan]) {
            return res.status(400).json({ error: "INVALID_PLAN", message: `Unknown plan: ${plan}` });
        }

        const config = PLANS[plan];
        const s = getStripe();

        // Get user email
        const { rows } = await db.query<{ email: string }>(
            `SELECT email FROM users WHERE id = $1`, [userId]
        );
        const email = rows[0]?.email;

        const session = await s.checkout.sessions.create({
            customer_email: email,
            mode: config.recurring ? "subscription" : "payment",
            line_items: [{ price: config.priceId, quantity: 1 }],
            success_url: `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/payment/cancel`,
            metadata: { userId, plan, credits: String(config.credits) },
        });

        // Log event
        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'checkout_start', $2)`,
            [userId, JSON.stringify({ plan, sessionId: session.id })]
        );

        res.json({ url: session.url, session_id: session.id });
    } catch (err) { next(err); }
});

// ─── Stripe Webhook ──────────────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ error: "Webhook secret not configured" });

    let event: any;
    try {
        const s = getStripe();
        // For webhook, we need the raw body — ensure express.raw() is used on this route
        event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
        logger.warn({ err: err.message }, "Webhook signature verification failed");
        return res.status(400).json({ error: "Invalid signature" });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const { userId, plan, credits } = session.metadata ?? {};
                if (userId && credits) {
                    const numCredits = parseInt(credits);
                    await db.query(
                        `UPDATE users SET credits = credits + $1, plan = COALESCE($2, plan), updated_at = NOW() WHERE id = $3`,
                        [numCredits, plan === "pro_monthly" ? "pro" : null, userId]
                    );
                    await db.query(
                        `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'payment_success', $2)`,
                        [userId, JSON.stringify({ plan, credits: numCredits, sessionId: session.id, amount: session.amount_total })]
                    );
                    logger.info({ userId, plan, credits: numCredits }, "Payment processed — credits added");
                }
                break;
            }
            case "customer.subscription.deleted": {
                // Downgrade to free
                const sub = event.data.object;
                const { userId } = sub.metadata ?? {};
                if (userId) {
                    await db.query(
                        `UPDATE users SET plan = 'free', updated_at = NOW() WHERE id = $1`,
                        [userId]
                    );
                    logger.info({ userId }, "Subscription cancelled — downgraded to free");
                }
                break;
            }
        }
    } catch (err) {
        logger.error({ err, eventType: event.type }, "Webhook handler error");
    }

    res.json({ received: true });
});

// ─── Get current credits + plan ──────────────────────────────────────────────

router.get("/status", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ credits: number; plan: string }>(
            `SELECT credits, plan FROM users WHERE id = $1`, [userId]
        );
        if (!rows.length) return res.status(404).json({ error: "User not found" });
        res.json({ credits: rows[0].credits, plan: rows[0].plan, plans: PLANS });
    } catch (err) { next(err); }
});

export default router;
