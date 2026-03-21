import { Router, Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../db/client";
import { logger } from "../config/logger";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ── Brute-force protection ────────────────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
// Clean stale entries every hour
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of loginAttempts) {
        if (now - val.lockedUntil > 3600_000) loginAttempts.delete(key);
    }
}, 3600_000);

function checkBruteForce(req: Request, email: string): void {
    const key = `${req.ip}:${email.toLowerCase()}`;
    const entry = loginAttempts.get(key);
    if (entry && Date.now() < entry.lockedUntil) {
        const minutesLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        throw new AppError("TOO_MANY_REQUESTS",
            `Too many failed login attempts. Try again in ${minutesLeft} minute(s).`, 429);
    }
}

function recordFailedLogin(req: Request, email: string): void {
    const key = `${req.ip}:${email.toLowerCase()}`;
    const entry = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
        entry.lockedUntil = Date.now() + LOCKOUT_MS;
        logger.warn({ ip: req.ip, email }, `🚨 Account locked after ${MAX_ATTEMPTS} failed attempts`);
    }
    loginAttempts.set(key, entry);
}

function clearFailedLogins(req: Request, email: string): void {
    loginAttempts.delete(`${req.ip}:${email.toLowerCase()}`);
}

function hashPassword(password: string): string {
    // PBKDF2 — secure, no extra deps
    const salt = process.env.PASSWORD_SALT ?? "tryiton-salt-2024";
    return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
}

async function sendVerificationEmail(email: string, token: string, name: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn("RESEND_API_KEY not set — skipping verification email");
        return;
    }

    const verifyUrl = `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/verify-email?token=${token}`;

    const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "TryItOn <noreply@tryiton.ai>",
            to: [email],
            subject: "Verify your TryItOn account ✨",
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0d0c18; color: #f0f0f8; margin: 0; padding: 20px; }
    .card { max-width: 480px; margin: 0 auto; background: #15151f; border: 1px solid rgba(99,102,241,0.3); border-radius: 16px; padding: 40px 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #fff; margin-bottom: 24px; }
    .title { font-size: 22px; font-weight: 600; color: #fff; margin-bottom: 8px; }
    .text { font-size: 15px; color: #7878a0; margin-bottom: 28px; line-height: 1.6; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px; }
    .footer { font-size: 12px; color: #7878a0; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">TryItOn ✨</div>
    <div class="title">Hi ${name}, confirm your account</div>
    <div class="text">Click the button below to verify your email and start trying on outfits with AI.</div>
    <a class="btn" href="${verifyUrl}">✅ Verify My Email</a>
    <div class="footer">Link expires in 24 hours. If you didn't sign up, ignore this email.</div>
  </div>
</body>
</html>`,
        }),
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        logger.error({ err }, "Failed to send verification email");
    } else {
        logger.info({ email }, "✅ Verification email sent");
    }
}

async function sendWelcomeEmail(email: string, name: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const downloadUrl = process.env.CHROME_EXTENSION_URL ?? "https://chrome.google.com/webstore";
    const appUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";

    await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: "Mickey from TryItOn <hello@tryiton.ai>",
            to: [email],
            subject: `Welcome to TryItOn, ${name}! 🎉 Here's how to start`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0d0c18;color:#f0f0f8;margin:0;padding:20px}
.card{max-width:520px;margin:0 auto;background:#15151f;border:1px solid rgba(99,102,241,0.3);border-radius:16px;padding:40px 32px}
.logo{font-size:28px;font-weight:700;color:#fff;margin-bottom:24px}
.title{font-size:22px;font-weight:600;color:#fff;margin-bottom:8px}
.text{font-size:15px;color:#9090b0;margin-bottom:24px;line-height:1.6}
.btn{display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;margin-bottom:16px}
.step{display:flex;gap:12px;margin-bottom:16px;align-items:flex-start}
.step-num{background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#a78bfa;flex-shrink:0;font-size:13px}
.step-text{font-size:14px;color:#9090b0;line-height:1.5;padding-top:4px}
.footer{font-size:12px;color:#60607a;margin-top:28px;line-height:1.6}
</style></head><body><div class="card">
<div class="logo">TryItOn ✨</div>
<div class="title">You're in, ${name}! 🎉</div>
<div class="text">Your account is verified. Here's how to get started in 3 steps:</div>
<div class="step"><div class="step-num">1</div><div class="step-text"><strong style="color:#fff">Install the Chrome Extension</strong><br>It adds a "Try On" button to every shopping site — ASOS, Zara, IKEA, Amazon and more.</div></div>
<div class="step"><div class="step-num">2</div><div class="step-text"><strong style="color:#fff">Upload your photo once</strong><br>One selfie. AI does the rest. Your photo stays private and is never shared.</div></div>
<div class="step"><div class="step-num">3</div><div class="step-text"><strong style="color:#fff">Try on anything</strong><br>Clothes, furniture, electronics — see it on you or in your space before you buy.</div></div>
<br>
<a class="btn" href="${downloadUrl}">📦 Download Chrome Extension</a>
<br>
<a class="btn" style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.4)" href="${appUrl}/account">👤 Visit My Account</a>
<div class="footer">Questions? Reply to this email — we read every one.<br>© 2026 TryItOn · <a href="${appUrl}" style="color:#6366f1">tryiton.ai</a></div>
</div></body></html>`,
        }),
    }).catch((e) => logger.error({ e }, "Failed to send welcome email"));

    logger.info({ email }, "✅ Welcome email sent");
}

function issueTokens(userId: string) {
    const accessToken = jwt.sign({ sub: userId }, process.env.JWT_SECRET as string, {
        expiresIn: "7d" as any,
    });
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    return { accessToken, refreshToken, refreshHash };
}

// ── POST /auth/register ───────────────────────────────────────────────────────

router.post("/register", async (req, res, next) => {
    try {
        const { email, password, full_name, phone } = req.body as {
            email?: string;
            password?: string;
            full_name?: string;
            phone?: string;
        };

        if (!email || !password || !full_name) {
            throw new AppError("VALIDATION_ERROR", "email, password and full_name are required", 400);
        }
        if (password.length < 8) {
            throw new AppError("VALIDATION_ERROR", "Password must be at least 8 characters", 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new AppError("VALIDATION_ERROR", "Invalid email address", 400);
        }

        // Check if already registered
        const existing = await db.query<{ id: string; email_verified: boolean }>(
            `SELECT id, email_verified FROM users WHERE email = $1`,
            [email.toLowerCase()]
        );
        if (existing.rows.length > 0) {
            throw new AppError("CONFLICT", "Email already registered. Please log in.", 409);
        }

        const passwordHash = hashPassword(password);
        const verifyToken = crypto.randomBytes(32).toString("hex");
        const country = (req.body.country as string | undefined)?.trim() ?? null;

        // Credits per plan at registration (free users start on free plan)
        const PLAN_CREDITS: Record<string, number> = { free: 5, pro: 100, elite: 300, admin: -1 };
        const startCredits = PLAN_CREDITS["free"];

        // Create user
        const result = await db.query<{ id: string }>(
            `INSERT INTO users(email, full_name, phone, country, password_hash, email_verified, email_verify_token, plan, credits)
             VALUES($1, $2, $3, $4, $5, FALSE, $6, 'free', $7)
             RETURNING id`,
            [email.toLowerCase(), full_name.trim(), phone?.trim() ?? null, country, passwordHash, verifyToken, startCredits]
        );
        const userId = result.rows[0].id;

        // Create profile row
        await db.query(
            `INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
            [userId]
        );

        // Send verification email
        await sendVerificationEmail(email, verifyToken, full_name.split(" ")[0]);

        res.status(201).json({
            ok: true,
            message: "Account created! Please check your email to verify your account.",
            user_id: userId,
        });
    } catch (err) {
        next(err);
    }
});

// ── GET /auth/verify-email?token=... ─────────────────────────────────────────

router.get("/verify-email", async (req, res, next) => {
    try {
        const { token } = req.query as { token?: string };
        if (!token) throw new AppError("BAD_REQUEST", "Token required", 400);

        const result = await db.query<{ id: string; email: string; full_name: string }>(
            `UPDATE users SET email_verified = TRUE, email_verify_token = NULL, updated_at = NOW()
             WHERE email_verify_token = $1 AND email_verified = FALSE
             RETURNING id, email, full_name`,
            [token]
        );

        if (!result.rows.length) {
            throw new AppError("NOT_FOUND", "Invalid or already used verification link", 404);
        }

        const user = result.rows[0];
        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);

        const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, expiresAt]
        );

        // Send welcome + onboarding email (async, don't block response)
        sendWelcomeEmail(user.email, user.full_name.split(" ")[0]).catch(() => {});

        logger.info({ email: user.email }, "✅ Email verified");
        res.json({
            ok: true,
            message: "Email verified! Welcome to TryItOn.",
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 604800, // 7 days
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body as { email?: string; password?: string };
        if (!email || !password) {
            throw new AppError("VALIDATION_ERROR", "email and password are required", 400);
        }

        checkBruteForce(req, email);

        const result = await db.query<{
            id: string;
            password_hash: string | null;
            email_verified: boolean;
            is_admin: boolean;
            credits: number;
            plan: string;
            full_name: string;
        }>(
            `SELECT id, password_hash, email_verified, is_admin, credits, plan, full_name
             FROM users WHERE email = $1`,
            [email.toLowerCase()]
        );

        const user = result.rows[0];
        if (!user || !user.password_hash) {
            recordFailedLogin(req, email);
            throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
        }

        const hash = hashPassword(password);
        if (hash !== user.password_hash) {
            recordFailedLogin(req, email);
            throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
        }

        clearFailedLogins(req, email);

        if (!user.email_verified && !user.is_admin) {
            throw new AppError("FORBIDDEN", "Please verify your email before logging in", 403);
        }

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, expiresAt]
        );

        logger.info({ email, is_admin: user.is_admin }, "✅ Login successful");
        res.json({
            ok: true,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 604800,
            user: {
                id: user.id,
                email,
                full_name: user.full_name,
                is_admin: user.is_admin,
                credits: user.credits,  // -1 = unlimited
                plan: user.plan,
            },
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

router.post("/refresh", async (req, res, next) => {
    try {
        const { refresh_token } = req.body as { refresh_token?: string };
        if (!refresh_token) throw new AppError("BAD_REQUEST", "refresh_token required");

        const hash = crypto.createHash("sha256").update(refresh_token).digest("hex");
        const result = await db.query<{ user_id: string; expires_at: Date }>(
            `SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`,
            [hash]
        );
        const row = result.rows[0];
        if (!row || row.expires_at < new Date()) {
            throw new AppError("UNAUTHORIZED", "Invalid or expired refresh token", 401);
        }

        const accessToken = jwt.sign(
            { sub: row.user_id },
            process.env.JWT_SECRET!,
            { expiresIn: "7d" }
        );
        res.json({ access_token: accessToken, expires_in: 604800 });
    } catch (err) {
        next(err);
    }
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────

router.post("/forgot-password", async (req, res, next) => {
    try {
        const { email } = req.body as { email?: string };
        if (!email) throw new AppError("VALIDATION_ERROR", "email required", 400);

        const result = await db.query<{ id: string; full_name: string }>(
            `UPDATE users SET email_verify_token = $2, updated_at = NOW()
             WHERE email = $1 AND email_verified = TRUE
             RETURNING id, full_name`,
            [email.toLowerCase(), crypto.randomBytes(32).toString("hex")]
        );

        // Always return ok (don't leak if email exists)
        if (result.rows.length > 0) {
            const { email_verify_token } = (await db.query<{ email_verify_token: string }>(
                `SELECT email_verify_token FROM users WHERE id = $1`,
                [result.rows[0].id]
            )).rows[0];

            const resetUrl = `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/reset-password?token=${email_verify_token}`;
            const apiKey = process.env.RESEND_API_KEY;
            if (apiKey) {
                await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        from: "TryItOn <noreply@tryiton.ai>",
                        to: [email],
                        subject: "Reset your TryItOn password",
                        html: `<p>Hi ${result.rows[0].full_name},</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>Link expires in 1 hour.</p>`,
                    }),
                });
            }
        }

        res.json({ ok: true, message: "If this email exists, a reset link was sent." });
    } catch (err) {
        next(err);
    }
});

// ── POST /auth/admin/set-password (admin bootstrapping) ──────────────────────

router.post("/admin/set-password", async (req, res, next) => {
    try {
        const { secret, email, password } = req.body as { secret?: string; email?: string; password?: string };
        const adminSecret = process.env.ADMIN_BOOTSTRAP_SECRET;

        if (!adminSecret || secret !== adminSecret) {
            throw new AppError("FORBIDDEN", "Invalid secret", 403);
        }
        if (!email || !password) {
            throw new AppError("VALIDATION_ERROR", "email and password required", 400);
        }

        const hash = hashPassword(password);
        await db.query(
            `UPDATE users SET password_hash = $1, email_verified = TRUE, updated_at = NOW() WHERE email = $2`,
            [hash, email.toLowerCase()]
        );

        res.json({ ok: true, message: `Password set for ${email}` });
    } catch (err) {
        next(err);
    }
});

export default router;
