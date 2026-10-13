/**
 * PayPlus (פייפלוס) payment integration
 *
 * ENV vars required:
 *   PAYPLUS_API_KEY        — API key from PayPlus dashboard
 *   PAYPLUS_SECRET_KEY     — Secret key from PayPlus dashboard
 *   PAYPLUS_TERMINAL_UID   — Terminal UID from PayPlus dashboard
 *   PAYPLUS_PAGE_UID       — Payment page UID (created once in dashboard)
 *   WEB_APP_URL            — https://tryit4u.ai
 *
 * API base: https://restapi.payplus.co.il/api/v1.0
 * Auth: api-key + secret-key as REQUEST HEADERS (not body)
 */

import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const PP_BASE     = "https://restapi.payplus.co.il/api/v1.0";
const PP_KEY      = () => process.env.PAYPLUS_API_KEY      ?? "";
const PP_SEC      = () => process.env.PAYPLUS_SECRET_KEY   ?? "";
const PP_TERMINAL = () => process.env.PAYPLUS_TERMINAL_UID ?? "";
const PP_PAGE     = () => process.env.PAYPLUS_PAGE_UID     ?? "";
const APP_URL     = () => process.env.WEB_APP_URL          ?? "https://tryit4u.ai";

// ─── Plans catalogue (USD pricing — matches landing page) ───────────────────
export const PLANS: Record<string, {
    label: string; amount: number; currency: string;
    credits: number; plan: string;
    recurring: boolean; billing: string;
    badge?: string;
}> = {
    pro_basic: {
        label:    "Pro Basic — 50 try-ons/month",
        amount:   19.90, currency: "USD",
        credits:  50, plan: "pro",
        recurring: true, billing: "monthly",
    },
    pro_plus: {
        label:    "Pro Plus — 150 try-ons/month",
        amount:   49.90, currency: "USD",
        credits:  150, plan: "elite",
        recurring: true, billing: "monthly",
        badge: "Most Popular",
    },
    pro_basic_annual: {
        label:    "Pro Basic Annual — 50 try-ons/month",
        amount:   214.90, currency: "USD",  // $17.90 × 12 — save 10%
        credits:  600, plan: "pro",
        recurring: true, billing: "annual",
        badge: "Save 10%",
    },
    pro_plus_annual: {
        label:    "Pro Plus Annual — 150 try-ons/month",
        amount:   539.00, currency: "USD",  // $44.90 × 12 — save 10%
        credits:  1800, plan: "elite",
        recurring: true, billing: "annual",
        badge: "Best Value — Save 10%",
    },
    credits_20: {
        label:   "Starter Pack — 20 Credits",
        amount:  9.99, currency: "USD",
        credits: 20, plan: "",
        recurring: false, billing: "one_time",
    },
    credits_40: {
        label:   "Value Pack — 40 Credits",
        amount:  19.99, currency: "USD",
        credits: 40, plan: "",
        recurring: false, billing: "one_time",
    },
    credits_130: {
        label:   "Power Pack — 130 Credits",
        amount:  49.90, currency: "USD",
        credits: 130, plan: "",
        recurring: false, billing: "one_time",
        badge: "Popular",
    },
    credits_200: {
        label:   "Ultimate Pack — 200 Credits",
        amount:  99.00, currency: "USD",
        credits: 200, plan: "",
        recurring: false, billing: "one_time",
        badge: "Best Value",
    },
};

// ─── PayPlus API helper ───────────────────────────────────────────────────────
async function ppPost(path: string, body: object): Promise<any> {
    const res = await fetch(`${PP_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key":      PP_KEY(),
            "secret-key":   PP_SEC(),
        },
        body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (!res.ok || data.results?.status === "error") {
        logger.error({ data, path }, "PayPlus API error");
        throw new Error(data.results?.description ?? `PayPlus API error: ${res.status}`);
    }
    return data;
}

async function ppGet(path: string): Promise<any> {
    const res = await fetch(`${PP_BASE}${path}`, {
        headers: { "api-key": PP_KEY(), "secret-key": PP_SEC() },
    });
    const data = await res.json() as any;
    if (!res.ok) {
        logger.error({ data, path }, "PayPlus GET error");
        throw new Error(data.results?.description ?? `PayPlus API error: ${res.status}`);
    }
    return data;
}

// ─── GET /payplus/plans — public plan list ────────────────────────────────────
router.get("/plans", (_req, res) => {
    res.json({ plans: PLANS });
});

// ─── POST /payplus/create-session — create payment link ───────────────────────
router.post("/create-session", requireAuth, async (req, res, next) => {
    try {
        const userId   = (req as AuthRequest).userId;
        const { plan_id } = req.body as { plan_id: string };
        const plan = PLANS[plan_id];
        if (!plan) return res.status(400).json({ error: "INVALID_PLAN", message: "Unknown plan" });

        const { rows } = await db.query(
            `SELECT email, full_name, phone FROM users WHERE id = $1`, [userId]
        );
        if (!rows.length) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
        const user = rows[0] as { email: string; full_name: string | null; phone: string | null };

        const orderNumber = `tryiton-${userId.slice(0, 8)}-${Date.now()}`;

        const ppBody: any = {
            payment_page_uid: PP_PAGE(),
            terminal_uid:     PP_TERMINAL(),
            amount:           plan.amount,
            currency_code:    plan.currency,
            sendEmailApproval: true,
            sendEmailFailure:  true,
            refURL_success:    `${APP_URL()}/account?payment=success&plan=${plan_id}`,
            refURL_failure:    `${APP_URL()}/account?payment=failed`,
            refURL_callback:   `${APP_URL()}/payplus/webhook`,
            more_info_1:       userId,
            more_info_2:       plan_id,
            more_info_3:       orderNumber,
            customer: {
                customer_name: user.full_name ?? user.email.split("@")[0],
                email:         user.email,
                phone:         user.phone ?? "",
            },
            items: [{
                name:     plan.label,
                quantity: 1,
                price:    plan.amount,
                vat_type: 1,  // 1 = VAT included in price
            }],
        };

        // Recurring payment settings
        if (plan.recurring) {
            ppBody.charge_method     = 3;  // 3 = recurring
            ppBody.recurring_settings = {
                cycle_type:    1,           // 1 = monthly
                total_cycles:  plan.billing === "annual" ? 12 : 0,  // 0 = indefinite
                cycle_amount:  plan.amount,
                initial_amount: 0,          // 0 = same as cycle_amount
            };
        } else {
            ppBody.charge_method = 1;  // 1 = one-time charge
        }

        const data = await ppPost("/PaymentPages/generateLink", ppBody);
        const url  = data.data?.payment_page_link ?? data.payment_page_link;
        if (!url) throw new Error("No payment link returned from PayPlus");

        // Record pending payment
        await db.query(
            `INSERT INTO payments(user_id, provider, transaction_id, plan, amount, currency, status, payload)
             VALUES($1, 'payplus', $2, $3, $4, $5, 'pending', $6::jsonb)`,
            [userId, orderNumber, plan_id, plan.amount, plan.currency,
             JSON.stringify({ order_number: orderNumber, plan_label: plan.label })]
        );

        logger.info({ userId, plan_id, amount: plan.amount }, "PayPlus session created");
        res.json({ url, plan_id, amount: plan.amount, currency: plan.currency });
    } catch (err) { next(err); }
});

// ─── GET /payplus/subscription — user billing status ─────────────────────────
router.get("/subscription", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT u.plan, u.credits, u.payplus_subscription_id, u.payplus_plan,
              u.subscription_expires_at,
              COALESCE(
                (SELECT json_agg(row_to_json(p) ORDER BY p.created_at DESC)
                 FROM (SELECT id, plan, amount, currency, status, created_at
                       FROM payments WHERE user_id = u.id
                       ORDER BY created_at DESC LIMIT 10) p),
                '[]'
              ) AS payment_history
             FROM users u WHERE u.id = $1`,
            [userId]
        );
        res.json({ subscription: rows[0] ?? {} });
    } catch (err) { next(err); }
});

// ─── POST /payplus/cancel — cancel subscription ───────────────────────────────
router.post("/cancel", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query(
            `SELECT payplus_subscription_id FROM users WHERE id = $1`, [userId]
        );
        const recurringUid = rows[0]?.payplus_subscription_id;
        if (!recurringUid) {
            return res.status(400).json({ error: "NO_SUBSCRIPTION", message: "No active subscription found" });
        }

        // Cancel via PayPlus API: POST /RecurringPayments/{uid}/Valid with valid:false
        try {
            await ppPost(`/RecurringPayments/${recurringUid}/Valid`, {
                terminal_uid: PP_TERMINAL(),
                valid: false,
            });
        } catch (apiErr: any) {
            logger.warn({ apiErr, userId }, "PayPlus cancel API error — downgrading locally anyway");
        }

        await db.query(
            `UPDATE users
             SET payplus_subscription_id = NULL, payplus_plan = NULL, updated_at = NOW()
             WHERE id = $1`,
            [userId]
        );

        res.json({ ok: true, message: "Subscription cancelled. Access continues until end of billing period." });
    } catch (err) { next(err); }
});

// ─── POST /payplus/webhook — payment notification from PayPlus ────────────────
// Mounted with express.raw() in app.ts so req.body is the raw Buffer.
// PayPlus signs callbacks with header `hash` = base64(HMAC-SHA256(body, secret_key))
// and sends `user-agent: PayPlus` (docs.payplus.co.il/reference/validate-requests-received-from-payplus).

function verifyPayPlusHash(rawStr: string, parsed: unknown, hash: string | undefined): boolean {
    const secret = PP_SEC();
    if (!secret || !hash) return false;
    const given = Buffer.from(hash);
    // Docs hash JSON.stringify(body); also accept the raw bytes in case formatting differs.
    for (const msg of [rawStr, JSON.stringify(parsed)]) {
        const expected = Buffer.from(crypto.createHmac("sha256", secret).update(msg).digest("base64"));
        if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return true;
    }
    return false;
}

router.post("/webhook", async (req, res, next) => {
    try {
        const rawStr = Buffer.isBuffer(req.body) ? req.body.toString("utf8")
                     : typeof req.body === "string" ? req.body
                     : JSON.stringify(req.body ?? {});
        let body: any;
        try { body = JSON.parse(rawStr); } catch { return res.status(400).json({ error: "INVALID_JSON" }); }

        if (!verifyPayPlusHash(rawStr, body, req.headers["hash"] as string | undefined)) {
            logger.warn({ ua: req.headers["user-agent"] }, "PayPlus webhook: missing/invalid hash — rejected");
            return res.status(401).json({ error: "INVALID_SIGNATURE" });
        }

        // PayPlus has used both `transaction` and `data` envelopes — read from either.
        const t = { ...(body.data ?? {}), ...(body.transaction ?? {}) };
        const statusRaw   = String(t.status_code ?? t.status ?? "");
        const approved    = statusRaw === "000" || statusRaw === "1" || statusRaw.toLowerCase() === "approved";
        const userId      = t.more_info_1 as string | undefined;
        const planId      = t.more_info_2 as string | undefined;
        const orderNumber = t.more_info_3 as string | undefined;
        const txnId       = (t.uid ?? t.transaction_uid) as string | undefined;
        const recurringId = (t.recurring_uid ?? body.recurring_uid) as string | undefined;

        logger.info({ statusRaw, approved, userId, planId, orderNumber, txnId, recurringId }, "PayPlus webhook received");

        if (!approved) return res.json({ ok: true });
        if (!userId || !planId || !txnId) {
            logger.warn({ body }, "PayPlus webhook missing user/plan/transaction id");
            return res.json({ ok: true });  // ack to avoid retries
        }
        const plan = PLANS[planId];
        if (!plan) {
            logger.warn({ planId }, "PayPlus webhook: unknown plan");
            return res.json({ ok: true });
        }

        const client = await db.connect();
        try {
            await client.query("BEGIN");
            // Serialize concurrent deliveries of the same transaction
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [txnId]);

            const dup = await client.query(
                `SELECT 1 FROM payments WHERE provider = 'payplus' AND status = 'completed'
                   AND payload->>'transaction_id' = $1 LIMIT 1`,
                [txnId]
            );
            if (dup.rowCount) {
                await client.query("ROLLBACK");
                logger.info({ txnId }, "PayPlus webhook: duplicate delivery ignored");
                return res.json({ ok: true });
            }

            const meta = JSON.stringify({ transaction_id: txnId, recurring_id: recurringId ?? null });
            // First charge: complete the pending row created by /create-session
            const upd = orderNumber ? await client.query(
                `UPDATE payments SET status = 'completed', subscription_id = $1,
                        payload = payload || $2::jsonb
                  WHERE provider = 'payplus' AND user_id = $3 AND transaction_id = $4 AND status = 'pending'`,
                [recurringId ?? null, meta, userId, orderNumber]
            ) : { rowCount: 0 };
            if (!upd.rowCount) {
                // No pending row: recurring renewal charge (or session row lost) — record it
                await client.query(
                    `INSERT INTO payments(user_id, provider, transaction_id, subscription_id, plan, amount, currency, status, payload)
                     VALUES($1, 'payplus', $2, $3, $4, $5, $6, 'completed', $7::jsonb)`,
                    [userId, orderNumber ?? txnId, recurringId ?? null, planId, plan.amount, plan.currency, meta]
                );
            }

            if (plan.recurring) {
                const expiresAt = new Date(
                    plan.billing === "annual"
                        ? Date.now() + 366 * 86400_000
                        : Date.now() +  32 * 86400_000
                );
                await client.query(
                    `UPDATE users
                     SET plan = $1, credits = credits + $2,
                         payplus_subscription_id = COALESCE($3, payplus_subscription_id),
                         payplus_plan            = $4,
                         subscription_expires_at = $5,
                         updated_at = NOW()
                     WHERE id = $6`,
                    [plan.plan, plan.credits, recurringId ?? null, planId, expiresAt, userId]
                );
            } else {
                // Credit pack — add credits only
                await client.query(
                    `UPDATE users SET credits = credits + $1, updated_at = NOW() WHERE id = $2`,
                    [plan.credits, userId]
                );
            }

            await client.query("COMMIT");
            logger.info({ userId, planId, credits: plan.credits, txnId }, "PayPlus payment applied ✓");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

        res.json({ ok: true });
    } catch (err) { next(err); }
});

export default router;
