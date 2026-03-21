import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// ─── Generate or get existing referral code for the authenticated user ────────

router.get("/my-code", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;

        // Check if user already has a code
        const { rows } = await db.query<{ code: string; uses: number; credits_earned: number }>(
            `SELECT code, uses, credits_earned FROM referrals WHERE referrer_id = $1`,
            [userId]
        );

        if (rows.length) {
            return res.json({ code: rows[0].code, uses: rows[0].uses, credits_earned: rows[0].credits_earned });
        }

        // Generate a new short code
        const code = createCode(userId);
        await db.query(
            `INSERT INTO referrals(referrer_id, code) VALUES($1, $2)`,
            [userId, code]
        );
        res.json({ code, uses: 0, credits_earned: 0 });
    } catch (err) { next(err); }
});

// ─── Public: validate + redeem a referral code ───────────────────────────────

router.post("/redeem", requireAuth, async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { code } = req.body as { code: string };

        if (!code || typeof code !== "string") {
            return res.status(400).json({ error: "VALIDATION", message: "Code is required" });
        }

        const { rows: ref } = await db.query<{ referrer_id: string }>(
            `SELECT referrer_id FROM referrals WHERE code = $1`,
            [code.toLowerCase().trim()]
        );

        if (!ref.length) {
            return res.status(404).json({ error: "NOT_FOUND", message: "Referral code not found" });
        }
        if (ref[0].referrer_id === userId) {
            return res.status(400).json({ error: "BAD_REQUEST", message: "Cannot use your own referral code" });
        }

        // Check if already redeemed
        const { rows: used } = await db.query(
            `SELECT id FROM referral_uses WHERE referee_id = $1`,
            [userId]
        );
        if (used.length) {
            return res.status(400).json({ error: "ALREADY_USED", message: "You already used a referral code" });
        }

        // Record use + grant credits
        await db.query(`BEGIN`);
        await db.query(
            `INSERT INTO referral_uses(referrer_id, referee_id, code) VALUES($1, $2, $3)`,
            [ref[0].referrer_id, userId, code.toLowerCase().trim()]
        );
        await db.query(
            `UPDATE referrals SET uses = uses + 1, credits_earned = credits_earned + 5 WHERE code = $1`,
            [code.toLowerCase().trim()]
        );
        // Grant 3 free try-ons to referee, 5 to referrer
        await db.query(
            `UPDATE users SET credits = credits + 3 WHERE id = $1`,
            [userId]
        );
        await db.query(
            `UPDATE users SET credits = credits + 5 WHERE id = $1`,
            [ref[0].referrer_id]
        );
        await db.query(`COMMIT`);

        res.json({ ok: true, message: "Referral applied! You got 3 free try-ons." });
    } catch (err) {
        await db.query(`ROLLBACK`).catch(() => {});
        next(err);
    }
});

// ─── Public: leaderboard (top referrers) ─────────────────────────────────────

router.get("/leaderboard", async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT r.code, r.uses, r.credits_earned,
                    LEFT(u.email, 3) || '****' AS masked_email
             FROM referrals r
             JOIN users u ON u.id = r.referrer_id
             WHERE r.uses > 0
             ORDER BY r.uses DESC
             LIMIT 10`
        );
        res.json({ leaderboard: rows });
    } catch (err) { next(err); }
});

function createCode(userId: string): string {
    const hash = crypto.createHash("sha256").update(userId + Date.now()).digest("hex");
    return hash.slice(0, 8).toUpperCase();
}

export default router;
