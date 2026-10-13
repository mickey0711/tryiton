/**
 * Payments — powered by Lemon Squeezy (merchant of record: cards, PayPal, Apple/Google Pay, VAT).
 *
 * ENV vars required:
 *   LEMONSQUEEZY_API_KEY        – API key from LS dashboard (Settings → API)
 *   LEMONSQUEEZY_STORE_ID       – numeric store ID (Settings → Stores)
 *   LEMONSQUEEZY_WEBHOOK_SECRET – webhook signing secret (Settings → Webhooks)
 *   LS_VARIANT_PRO_BASIC        – variant ID for Pro Basic monthly
 *   LS_VARIANT_PRO_PLUS         – variant ID for Pro Plus monthly
 *   LS_VARIANT_PRO_BASIC_ANNUAL – variant ID for Pro Basic annual
 *   LS_VARIANT_PRO_PLUS_ANNUAL  – variant ID for Pro Plus annual
 *   LS_VARIANT_CREDITS_20       – variant ID for 20-credit pack
 *   LS_VARIANT_CREDITS_40       – variant ID for 40-credit pack
 *   LS_VARIANT_CREDITS_130      – variant ID for 130-credit pack
 *   LS_VARIANT_CREDITS_200      – variant ID for 200-credit pack
 *
 * Flow: POST /payments/checkout → hosted LS checkout → LS calls POST /payments/webhook
 * (signed) → credits/plan applied here. Every webhook event is recorded once in `payments`
 * (transaction_id = LS event id) so retries are idempotent.
 */

import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const LS_API = "https://api.lemonsqueezy.com/v1";
const p = process.env;

// ─── Plans catalogue (USD — matches landing page) ───────────────────────────

export const PLANS: Record<string, {
    variantId: () => string;
    credits: number;            // credits granted per billing period (or per pack)
    label: string;
    price: number;
    plan: "pro" | "elite" | "";  // users.plan to set ("" = keep current, credit packs)
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
        credits: 50, label: "Pro Basic — 50 try-ons/mo", plan: "pro",
        price: 19.90, recurring: true, billing: "monthly",
    },
    pro_plus: {
        variantId: () => p.LS_VARIANT_PRO_PLUS ?? "",
        credits: 150, label: "Pro Plus — 150 try-ons/mo", plan: "elite",
        price: 49.90, recurring: true, billing: "monthly",
        badge: "Most Popular",
    },
    pro_basic_annual: {
        variantId: () => p.LS_VARIANT_PRO_BASIC_ANNUAL ?? "",
        credits: 600, creditsPerMonth: 50, plan: "pro",
        label: "Pro Basic Annual — 50 try-ons/mo",
        price: 214.90, monthlyEquivalent: 17.90, savingsAmount: 23.90,
        recurring: true, billing: "annual",
        badge: "Save 10%",
    },
    pro_plus_annual: {
        variantId: () => p.LS_VARIANT_PRO_PLUS_ANNUAL ?? "",
        credits: 1800, creditsPerMonth: 150, plan: "elite",
        label: "Pro Plus Annual — 150 try-ons/mo",
        price: 539.00, monthlyEquivalent: 44.90, savingsAmount: 59.80,
        recurring: true, billing: "annual",
        recommended: true, badge: "Best Value — Save 10%",
    },
    credits_20: {
        variantId: () => p.LS_VARIANT_CREDITS_20 ?? "",
        credits: 20, label: "Starter Pack — 20 Credits", plan: "",
        price: 9.99, recurring: false, billing: "one_time",
    },
    credits_40: {
        variantId: () => p.LS_VARIANT_CREDITS_40 ?? "",
        credits: 40, label: "Value Pack — 40 Credits", plan: "",
        price: 19.99, recurring: false, billing: "one_time",
    },
    credits_130: {
        variantId: () => p.LS_VARIANT_CREDITS_130 ?? "",
        credits: 130, label: "Power Pack — 130 Credits", plan: "",
        price: 49.90, recurring: false, billing: "one_time",
        badge: "Popular",
    },
    credits_200: {
        variantId: () => p.LS_VARIANT_CREDITS_200 ?? "",
        credits: 200, label: "Ultimate Pack — 200 Credits", plan: "",
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
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Lemon Squeezy API ${res.status}: ${JSON.stringify(err)}`);
    }
    return res.json();
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

// ─── POST /payments/checkout ──────────────────────────────────────────────────

router.post("/checkout", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        // Accept both { plan } and the older { plan_id } body shape.
        const plan = String((req.body as any)?.plan ?? (req.body as any)?.plan_id ?? "");

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

        const appUrl = p.WEB_APP_URL ?? "https://tryit4u.ai";

        const checkout = await lsRequest("POST", "/checkouts", {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_options: { embed: false },
                    checkout_data: {
                        email: user?.email,
                        name: user?.full_name,
                        custom: { user_id: userId, plan },
                    },
                    product_options: {
                        redirect_url: `${appUrl}/?payment=success&plan=${plan}#account`,
                        receipt_button_text: "Open TryIt4U",
                        receipt_link_url: `${appUrl}/#account`,
                    },
                },
                relationships: {
                    store: { data: { type: "stores", id: storeId } },
                    variant: { data: { type: "variants", id: variantId } },
                },
            },
        });

        const checkoutUrl = checkout.data?.attributes?.url;
        if (!checkoutUrl) throw new Error("No checkout URL returned from Lemon Squeezy");

        await db.query(
            `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'checkout_start', $2)`,
            [userId, JSON.stringify({ plan, provider: "lemonsqueezy", checkoutId: checkout.data?.id })]
        );

        res.json({ url: checkoutUrl, checkout_id: checkout.data?.id, plan, amount: config.price, currency: "USD" });
    } catch (err) { next(err); }
});

// ─── POST /payments/webhook ───────────────────────────────────────────────────
// Mounted with express.raw() in app.ts — req.body is the raw Buffer.

router.post("/webhook", async (req, res) => {
    const secret = p.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: "Webhook secret not configured" });

    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = String(req.headers["x-signature"] ?? "");
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(signature), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        logger.warn("Lemon Squeezy webhook: invalid signature");
        return res.status(400).json({ error: "Invalid signature" });
    }

    let payload: any;
    try {
        payload = JSON.parse(raw.toString("utf8"));
    } catch {
        return res.status(400).json({ error: "Invalid JSON" });
    }

    const eventName: string = payload.meta?.event_name ?? "";
    const eventId: string = String(payload.meta?.webhook_id ?? payload.data?.id ?? "");
    const custom: Record<string, string> = payload.meta?.custom_data ?? {};
    const userId = custom.user_id ?? custom.userId;
    const plan = custom.plan;
    const attrs = payload.data?.attributes ?? {};
    const objectId = String(payload.data?.id ?? "");

    if (!userId || !UUID_RE.test(userId)) {
        logger.warn({ eventName, eventId }, "LS webhook without user_id custom data — ignored");
        return res.json({ received: true });
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ls:${eventId}`]);

        // Idempotency — one row per webhook delivery
        const dup = await client.query(
            `SELECT 1 FROM payments WHERE provider = 'lemonsqueezy' AND transaction_id = $1`, [eventId]);
        if (dup.rowCount) {
            await client.query("ROLLBACK");
            return res.json({ received: true, duplicate: true });
        }

        const config = plan ? PLANS[plan] : undefined;
        const amount = Number(attrs.total ?? attrs.subtotal ?? 0) / 100;
        const currency = attrs.currency ?? "USD";
        const subscriptionId = eventName.startsWith("subscription_payment")
            ? String(attrs.subscription_id ?? "")
            : eventName.startsWith("subscription_") ? objectId : (attrs.first_subscription_item?.subscription_id ?? null);

        let status = "recorded";
        let creditsGranted = 0;

        switch (eventName) {
            case "order_created": {
                // Credit packs are one-time orders. Subscription orders are handled by subscription_created.
                if (config && !config.recurring) {
                    await client.query(
                        `UPDATE users SET credits = CASE WHEN credits = -1 THEN -1 ELSE credits + $1 END, updated_at = NOW() WHERE id = $2`,
                        [config.credits, userId]);
                    creditsGranted = config.credits;
                }
                status = "completed";
                break;
            }
            case "subscription_created": {
                if (config?.recurring) {
                    const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : null;
                    await client.query(
                        `UPDATE users
                            SET plan = $1,
                                credits = CASE WHEN credits = -1 THEN -1 ELSE credits + $2 END,
                                ls_subscription_id = $3,
                                ls_customer_id = $4,
                                payplus_plan = $5,
                                subscription_expires_at = $6,
                                updated_at = NOW()
                          WHERE id = $7`,
                        [config.plan, config.credits, objectId, String(attrs.customer_id ?? ""), plan, renewsAt, userId]);
                    creditsGranted = config.credits;
                }
                status = "completed";
                break;
            }
            case "subscription_payment_success": {
                // Renewal invoices top up the monthly/annual allowance. The initial invoice is
                // already covered by subscription_created.
                if (config?.recurring && attrs.billing_reason === "renewal") {
                    await client.query(
                        `UPDATE users SET credits = CASE WHEN credits = -1 THEN -1 ELSE credits + $1 END,
                                          plan = $2, updated_at = NOW() WHERE id = $3`,
                        [config.credits, config.plan, userId]);
                    creditsGranted = config.credits;
                }
                status = "completed";
                break;
            }
            case "subscription_updated":
            case "subscription_resumed":
            case "subscription_plan_changed": {
                const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : null;
                const endsAt = attrs.ends_at ? new Date(attrs.ends_at) : null;
                await client.query(
                    `UPDATE users SET subscription_expires_at = COALESCE($1, $2, subscription_expires_at), updated_at = NOW() WHERE id = $3`,
                    [endsAt, renewsAt, userId]);
                break;
            }
            case "subscription_cancelled": {
                // Access continues until ends_at; subscription_expired downgrades.
                const endsAt = attrs.ends_at ? new Date(attrs.ends_at) : null;
                await client.query(
                    `UPDATE users SET subscription_expires_at = COALESCE($1, subscription_expires_at), updated_at = NOW() WHERE id = $2`,
                    [endsAt, userId]);
                status = "cancelled";
                break;
            }
            case "subscription_expired": {
                await client.query(
                    `UPDATE users SET plan = 'free', ls_subscription_id = NULL, payplus_plan = NULL,
                                      subscription_expires_at = NULL, updated_at = NOW()
                      WHERE id = $1 AND plan <> 'admin'`, [userId]);
                status = "expired";
                break;
            }
            case "subscription_payment_failed": {
                status = "failed";
                break;
            }
            case "order_refunded": {
                // Take back the credits from a refunded pack (never below zero, never for unlimited).
                if (config && !config.recurring) {
                    await client.query(
                        `UPDATE users SET credits = CASE WHEN credits = -1 THEN -1 ELSE GREATEST(0, credits - $1) END, updated_at = NOW() WHERE id = $2`,
                        [config.credits, userId]);
                }
                status = "refunded";
                break;
            }
            default:
                status = "ignored";
        }

        await client.query(
            `INSERT INTO payments(user_id, provider, transaction_id, subscription_id, plan, amount, currency, status, payload)
             VALUES($1, 'lemonsqueezy', $2, $3, $4, $5, $6, $7, $8::jsonb)`,
            [userId, eventId, subscriptionId || null, plan ?? eventName, amount, currency, status,
             JSON.stringify({ event: eventName, object_id: objectId, credits: creditsGranted,
                              order_id: attrs.order_id ?? (eventName === "order_created" ? objectId : null) })]
        );
        await client.query("COMMIT");
        logger.info({ userId, plan, eventName, creditsGranted }, "✅ Lemon Squeezy webhook applied");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, eventName }, "Webhook handler error");
        return res.status(500).json({ error: "handler_error" });  // LS retries
    } finally {
        client.release();
    }

    res.json({ received: true });
});

// ─── GET /payments/status ─────────────────────────────────────────────────────

router.get("/status", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ credits: number; plan: string; ls_subscription_id: string | null; subscription_expires_at: Date | null; payplus_plan: string | null }>(
            `SELECT credits, plan, ls_subscription_id, subscription_expires_at, payplus_plan FROM users WHERE id = $1`, [userId]
        );
        if (!rows.length) return res.status(404).json({ error: "User not found" });
        const plansPublic = Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [k, { ...v, variantId: undefined, configured: !!v.variantId() }])
        );
        res.json({
            credits: rows[0].credits, plan: rows[0].plan,
            subscription: rows[0].ls_subscription_id ? {
                id: rows[0].ls_subscription_id, plan_id: rows[0].payplus_plan, renews_at: rows[0].subscription_expires_at,
            } : null,
            plans: plansPublic,
        });
    } catch (err) { next(err); }
});

// ─── GET /payments/portal — Lemon Squeezy customer portal (manage / cancel) ───

router.get("/portal", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ ls_subscription_id: string | null }>(
            `SELECT ls_subscription_id FROM users WHERE id = $1`, [userId]);
        const subId = rows[0]?.ls_subscription_id;
        if (!subId) return res.status(404).json({ error: "NO_SUBSCRIPTION", message: "No active subscription" });
        const sub = await lsRequest("GET", `/subscriptions/${encodeURIComponent(subId)}`);
        const urls = sub.data?.attributes?.urls ?? {};
        res.json({ url: urls.customer_portal ?? urls.update_payment_method ?? null });
    } catch (err) { next(err); }
});

// ─── POST /payments/cancel — cancel at period end ─────────────────────────────

router.post("/cancel", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ ls_subscription_id: string | null }>(
            `SELECT ls_subscription_id FROM users WHERE id = $1`, [userId]);
        const subId = rows[0]?.ls_subscription_id;
        if (!subId) return res.status(400).json({ error: "NO_SUBSCRIPTION", message: "No active subscription found" });
        await lsRequest("DELETE", `/subscriptions/${encodeURIComponent(subId)}`);
        res.json({ ok: true, message: "Subscription cancelled. Access continues until the end of the billing period." });
    } catch (err) { next(err); }
});

export default router;
