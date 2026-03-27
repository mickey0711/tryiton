/**
 * Payments — powered by Lemon Squeezy
 *
 * ENV vars required:
 *   LEMONSQUEEZY_API_KEY        – API key from LS dashboard
 *   LEMONSQUEEZY_STORE_ID       – numeric store ID
 *   LEMONSQUEEZY_WEBHOOK_SECRET – webhook signing secret
 *   LS_VARIANT_PRO_BASIC        – variant ID for Pro Basic monthly
 *   LS_VARIANT_PRO_PLUS         – variant ID for Pro Plus monthly
 *   LS_VARIANT_PRO_BASIC_ANNUAL – variant ID for Pro Basic annual
 *   LS_VARIANT_PRO_PLUS_ANNUAL  – variant ID for Pro Plus annual
 *   LS_VARIANT_CREDITS_20       – variant ID for 20-credit pack
 *   LS_VARIANT_CREDITS_40       – variant ID for 40-credit pack
 *   LS_VARIANT_CREDITS_130      – variant ID for 130-credit pack
 *   LS_VARIANT_CREDITS_200      – variant ID for 200-credit pack
 */

import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const LS_API = "https://api.lemonsqueezy.com/v1";
const p = process.env;

// ─── Plans catalogue ─────────────────────────────────────────────────────────

const PLANS: Record<string, {
    variantId: () => string;
    credits: number;
    label: string;
    price: number;
    recurring: boolean;
    billing: "monthly" | "annual" | "one_time";
    recommended?: boolean;
    badge?: string;
    creditsPerMonth?: number;
    monthlyEquivalent?: number;
    savingsAmount?: number;
}> = {
    pro_basic: {
        variantId: () => p.LS_VARIANT_PRO_BASIC ?? "",
        credits: 50, label: "Pro Basic — 50 try-ons/mo",
        price: 19.90, recurring: true, billing: "monthly",
    },
    pro_plus: {
        variantId: () => p.LS_VARIANT_PRO_PLUS ?? "",
        credits: 150, label: "Pro Plus — 150 try-ons/mo",
        price: 49.90, recurring: true, billing: "monthly",
    },
    pro_basic_annual: {
        variantId: () => p.LS_VARIANT_PRO_BASIC_ANNUAL ?? "",
        credits: 600, creditsPerMonth: 50,
        label: "Pro Basic Annual — 50 try-ons/mo",
        price: 214.90, monthlyEquivalent: 17.90, savingsAmount: 23.90,
        recurring: true, billing: "annual",
        badge: "Save 10%",
    },
    pro_plus_annual: {
        variantId: () => p.LS_VARIANT_PRO_PLUS_ANNUAL ?? "",
        credits: 1800, creditsPerMonth: 150,
        label: "Pro Plus Annual — 150 try-ons/mo",
        price: 539.00, monthlyEquivalent: 44.90, savingsAmount: 59.80,
        recurring: true, billing: "annual",
        recommended: true, badge: "Best Value — Save 10%",
    },
    credits_20: {
        variantId: () => p.LS_VARIANT_CREDITS_20 ?? "",
        credits: 20, label: "20 Credits Pack",
        price: 9.99, recurring: false, billing: "one_time",
    },
    credits_40: {
        variantId: () => p.LS_VARIANT_CREDITS_40 ?? "",
        credits: 40, label: "40 Credits Pack",
        price: 19.99, recurring: false, billing: "one_time",
    },
    credits_130: {
        variantId: () => p.LS_VARIANT_CREDITS_130 ?? "",
        credits: 130, label: "130 Credits Pack",
        price: 49.90, recurring: false, billing: "one_time",
    },
    credits_200: {
        variantId: () => p.LS_VARIANT_CREDITS_200 ?? "",
        credits: 200, label: "200 Credits Pack",
        price: 99.00, recurring: false, billing: "one_time",
        badge: "Best Value",
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function lsRequest(method: string, path: string, body?: object) {
    const apiKey = p.LEMONSQUEEZY_API_KEY;
    if (!apiKey) throw new Error("LEMONSQUEEZY_API_KEY not configured");
    const res = await fetch(`${LS_API}${path}`, {
        method,
        headers: {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Lemon Squeezy API ${res.status}: ${JSON.stringify(err)}`);
    }
    return res.json();
}

// ─── POST /payments/checkout ──────────────────────────────────────────────────

router.post("/checkout", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { plan } = req.body as { plan: string };

        if (!PLANS[plan]) {
            return res.status(400).json({ error: "INVALID_PLAN", message: `Unknown plan: ${plan}` });
        }

        const config = PLANS[plan];
        const variantId = config.variantId();
        if (!variantId) {
            return res.status(503).json({ error: "PLAN_NOT_CONFIGURED", message: "Payment plan not yet configured" });
        }

        const { rows } = await db.query<{ email: string; full_name: string }>(
            `SELECT email, full_name FROM users WHERE id = $1`, [userId]
        );
        const user = rows[0];
        const storeId = p.LEMONSQUEEZY_STORE_ID;
        if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID not configured");

        const appUrl = p.WEB_APP_URL ?? "http://localhost:3000";

        const checkout = await lsRequest("POST", "/checkouts", {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_options: { embed: false },
                    checkout_data: {
                        email: user?.email,
                        name: user?.full_name,
                        custom: { userId, plan, credits: String(config.credits) },
                    },
                    product_options: {
                        redirect_url: `${appUrl}/payment/success`,
                    },
                },
                relationships: {
                    store: { data: { type: "stores", id: storeId } },
                    variant: { data: { type: "variants", id: variantId } },
                },
            },
        });

        const checkoutUrl = checkout.data?.attributes?.url;

        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'checkout_start', $2)`,
            [userId, JSON.stringify({ plan, checkoutId: checkout.data?.id })]
        );

        res.json({ url: checkoutUrl, checkout_id: checkout.data?.id });
    } catch (err) { next(err); }
});

// ─── POST /payments/webhook ───────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
    // For webhooks, express.raw() must be used — see app.ts
    const secret = p.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: "Webhook secret not configured" });

    const signature = req.headers["x-signature"] as string;
    const hmac = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    if (hmac !== signature) {
        logger.warn("Lemon Squeezy webhook: invalid signature");
        return res.status(400).json({ error: "Invalid signature" });
    }

    let payload: any;
    try {
        payload = JSON.parse(req.body.toString());
    } catch {
        return res.status(400).json({ error: "Invalid JSON" });
    }

    const eventName: string = payload.meta?.event_name ?? "";
    const custom: Record<string, string> = payload.meta?.custom_data ?? {};
    const { userId, plan, credits } = custom;

    try {
        switch (eventName) {
            case "order_created":
            case "subscription_created": {
                if (userId && credits) {
                    const numCredits = parseInt(credits);
                    const newPlan = plan?.startsWith("pro") ? "pro" : undefined;
                    await db.query(
                        `UPDATE users SET credits = credits + $1, plan = COALESCE($2, plan), updated_at = NOW() WHERE id = $3`,
                        [numCredits, newPlan ?? null, userId]
                    );
                    await db.query(
                        `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'payment_success', $2)`,
                        [userId, JSON.stringify({ plan, credits: numCredits, event: eventName, orderId: payload.data?.id })]
                    );
                    logger.info({ userId, plan, credits: numCredits }, "✅ Payment processed — credits added");
                }
                break;
            }
            case "subscription_expired":
            case "subscription_cancelled": {
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
        logger.error({ err, eventName }, "Webhook handler error");
    }

    res.json({ received: true });
});

// ─── GET /payments/status ─────────────────────────────────────────────────────

router.get("/status", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ credits: number; plan: string }>(
            `SELECT credits, plan FROM users WHERE id = $1`, [userId]
        );
        if (!rows.length) return res.status(404).json({ error: "User not found" });
        const plansPublic = Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [k, { ...v, variantId: undefined }])
        );
        res.json({ credits: rows[0].credits, plan: rows[0].plan, plans: plansPublic });
    } catch (err) { next(err); }
});

export default router;
