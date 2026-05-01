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

// ─── Plans catalogue (ILS pricing) ───────────────────────────────────────────
export const PLANS: Record<string, {
    label: string; amount: number; currency: string;
    credits: number; plan: string;
    recurring: boolean; billing: string;
    badge?: string;
}> = {
    pro_basic: {
        label:    "Pro Basic — 50 try-ons/month",
        amount:   69, currency: "ILS",
        credits:  50, plan: "pro",
        recurring: true, billing: "monthly",
    },
    pro_plus: {
        label:    "Pro Plus — 150 try-ons/month",
        amount:   149, currency: "ILS",
        credits:  150, plan: "elite",
        recurring: true, billing: "monthly",
        badge: "Most Popular",
    },
    pro_basic_annual: {
        label:    "Pro Basic Annual — 50 try-ons/month",
        amount:   745, currency: "ILS",  // ₪69×12 − 10% = ₪745.20
        credits:  600, plan: "pro",
        recurring: true, billing: "annual",
        badge: "Save 10%",
    },
    pro_plus_annual: {
        label:    "Pro Plus Annual — 150 try-ons/month",
        amount:   1609, currency: "ILS", // ₪149×12 − 10% = ₪1609.20
        credits:  1800, plan: "elite",
        recurring: true, billing: "annual",
        badge: "Best Value — Save 10%",
    },
    credits_20: {
        label:   "20 Credits Pack",
        amount:  39, currency: "ILS",
        credits: 20, plan: "",
        recurring: false, billing: "one_time",
    },
    credits_50: {
        label:   "50 Credits Pack",
        amount:  79, currency: "ILS",
        credits: 50, plan: "",
        recurring: false, billing: "one_time",
    },
    credits_130: {
        label:   "130 Credits Pack",
        amount:  179, currency: "ILS",
        credits: 130, plan: "",
        recurring: false, billing: "one_time",
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
// NOTE: This route needs raw body for HMAC verification.
// Mount it with express.raw() in app.ts BEFORE json middleware.
router.post("/webhook", async (req, res, next) => {
    try {
        const rawBody = req.body;  // Buffer if mounted with express.raw()
        const body    = typeof rawBody === "string" ? JSON.parse(rawBody)
                      : Buffer.isBuffer(rawBody)    ? JSON.parse(rawBody.toString())
                      : rawBody;

        // Verify HMAC-SHA256 signature
        const sigHeader = req.headers["x-payplus-signature"] as string;
        const secret    = PP_SEC();
        if (secret && sigHeader) {
            const rawStr  = Buffer.isBuffer(rawBody) ? rawBody.toString() : JSON.stringify(rawBody);
            const expected = crypto
                .createHmac("sha256", secret)
                .update(rawStr)
                .digest("hex");
            if (!crypto.timingSafeEqual(
                Buffer.from(sigHeader,  "hex"),
                Buffer.from(expected,   "hex"),
            )) {
                logger.warn("PayPlus webhook signature mismatch");
                return res.status(401).json({ error: "INVALID_SIGNATURE" });
            }
        }

        const status      = Number(body.data?.status_code ?? body.data?.status);  // 1 = success
        const userId      = body.data?.more_info_1 as string;
        const planId      = body.data?.more_info_2 as string;
        const txnId       = body.data?.transaction_uid as string;
        const recurringId = body.data?.recurring_uid   as string;

        logger.info({ status, userId, planId, txnId, recurringId }, "PayPlus webhook received");

        if (!userId || !planId) {
            logger.warn({ body }, "PayPlus webhook missing user_id or plan_id");
            return res.json({ ok: true });  // ack to avoid retries
        }

        if (status === 1) {
            const plan = PLANS[planId];
            if (!plan) {
                logger.warn({ planId }, "PayPlus webhook: unknown plan");
                return res.json({ ok: true });
            }

            const client = await db.connect();
            try {
                await client.query("BEGIN");

                if (plan.recurring) {
                    const expiresAt = new Date(
                        plan.billing === "annual"
                            ? Date.now() + 366 * 86400_000
                            : Date.now() +  32 * 86400_000
                    );
                    await client.query(
                        `UPDATE users
                         SET plan = $1, credits = credits + $2,
                             payplus_subscription_id = $3,
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

                // Mark payment completed
                await client.query(
                    `UPDATE payments
                     SET status = 'completed',
                         payload = payload || $1::jsonb
                     WHERE user_id = $2 AND status = 'pending'
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [JSON.stringify({ transaction_id: txnId, recurring_id: recurringId }), userId]
                );

                await client.query("COMMIT");
                logger.info({ userId, planId, credits: plan.credits }, "PayPlus payment applied ✓");
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            } finally {
                client.release();
            }
        }

        res.json({ ok: true });
    } catch (err) { next(err); }
});

export default router;
