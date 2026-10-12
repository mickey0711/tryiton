/**
 * Credit accounting — single place that charges / refunds try-on credits.
 *
 * users.credits semantics:
 *   -1  → unlimited (admin)
 *   >0  → remaining credits
 *    0  → out of credits
 */
import { db } from "../db/client";
import { AppError } from "../middleware/errorHandler";

export interface ChargeResult {
    credits: number;      // credits left after the charge (-1 = unlimited)
    unlimited: boolean;
}

/** Atomically consume one credit. Throws 402 PAYMENT_REQUIRED when the user has none. */
export async function chargeCredit(userId: string, reason: string): Promise<ChargeResult> {
    const { rows } = await db.query<{ credits: number }>(
        `UPDATE users
            SET credits = CASE WHEN credits = -1 OR plan = 'admin' THEN credits ELSE credits - 1 END,
                updated_at = NOW()
          WHERE id = $1 AND (credits > 0 OR credits = -1 OR plan = 'admin')
          RETURNING credits`,
        [userId]
    );
    if (!rows.length) {
        const exists = await db.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
        if (!exists.rowCount) throw new AppError("UNAUTHORIZED", "User not found", 401);
        throw new AppError("PAYMENT_REQUIRED", "You're out of try-ons. Upgrade or buy a credits pack.", 402);
    }
    await db.query(
        `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'credit_charged', $2)`,
        [userId, JSON.stringify({ reason })]
    ).catch(() => { /* analytics only */ });
    return { credits: rows[0].credits, unlimited: rows[0].credits === -1 };
}

/** Give a credit back after a generation failed on our side (never for unlimited users). */
export async function refundCredit(userId: string, reason: string): Promise<void> {
    await db.query(
        `UPDATE users SET credits = credits + 1, updated_at = NOW()
          WHERE id = $1 AND credits <> -1 AND plan <> 'admin'`,
        [userId]
    );
    await db.query(
        `INSERT INTO events(user_id, event_type, payload) VALUES($1, 'credit_refunded', $2)`,
        [userId, JSON.stringify({ reason })]
    ).catch(() => { /* analytics only */ });
}
