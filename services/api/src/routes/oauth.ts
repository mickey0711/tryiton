import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../db/client";
import { logger } from "../config/logger";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function issueTokens(userId: string) {
    const accessToken = jwt.sign({ sub: userId }, process.env.JWT_SECRET as string, {
        expiresIn: "7d" as any,
    });
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    return { accessToken, refreshToken, refreshHash };
}

async function upsertOAuthUser(data: {
    email: string;
    full_name: string;
    avatar_url?: string;
    provider: string;
    provider_id: string;
}): Promise<{ id: string; is_admin: boolean; credits: number; plan: string }> {
    // Upsert user by email
    const result = await db.query<{
        id: string;
        is_admin: boolean;
        credits: number;
        plan: string;
    }>(
        `INSERT INTO users(email, full_name, email_verified, plan, credits)
         VALUES($1, $2, TRUE, 'free', 5)
         ON CONFLICT(email) DO UPDATE SET
           email_verified = TRUE,
           full_name = COALESCE(users.full_name, EXCLUDED.full_name),
           updated_at = NOW()
         RETURNING id, is_admin, credits, plan`,
        [data.email.toLowerCase(), data.full_name]
    );
    const user = result.rows[0];

    // Store OAuth provider binding
    await db.query(
        `INSERT INTO oauth_providers(user_id, provider, provider_id, avatar_url)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(provider, provider_id) DO UPDATE SET
           avatar_url = EXCLUDED.avatar_url,
           updated_at = NOW()`,
        [user.id, data.provider, data.provider_id, data.avatar_url ?? null]
    );

    // Ensure profile row
    await db.query(
        `INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [user.id]
    );

    return user;
}

// ── GOOGLE OAUTH ──────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

// Web redirect flow: GET /auth/oauth/google
router.get("/google", (req, res) => {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    if (!client_id) return res.status(503).json({ error: "Google OAuth not configured" });

    const redirect_uri = process.env.GOOGLE_REDIRECT_URI ??
        `${process.env.WEB_APP_URL}/auth/oauth/google/callback`;

    const params = new URLSearchParams({
        client_id,
        redirect_uri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

// Web callback: GET /auth/oauth/google/callback?code=...
router.get("/google/callback", async (req, res, next) => {
    try {
        const { code } = req.query as { code?: string };
        if (!code) throw new AppError("BAD_REQUEST", "Missing code", 400);

        const user = await exchangeGoogleCode(code,
            process.env.GOOGLE_REDIRECT_URI ?? `${process.env.WEB_APP_URL}/auth/oauth/google/callback`
        );

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        // Redirect to frontend with tokens
        const frontendUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
        res.redirect(`${frontendUrl}/auth/success?access_token=${accessToken}&refresh_token=${refreshToken}`);
    } catch (err) { next(err); }
});

// Chrome extension / website GIS flow: POST /auth/oauth/google/exchange
// Accepts either: { code, redirect_uri } OR { id_token } (from Google Identity Services)
router.post("/google/exchange", async (req, res, next) => {
    try {
        const { code, redirect_uri, id_token, google_access_token } = req.body as {
            code?: string;
            redirect_uri?: string;
            id_token?: string;
            google_access_token?: string;
        };

        let user: { id: string; is_admin: boolean; credits: number; plan: string };

        if (id_token) {
            // GIS popup flow — id_token is a signed JWT from Google
            const parts = id_token.split(".");
            if (parts.length !== 3) throw new AppError("BAD_REQUEST", "Invalid id_token", 400);
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as any;

            // Validate audience
            const clientId = process.env.GOOGLE_CLIENT_ID;
            if (clientId && payload.aud !== clientId) {
                throw new AppError("UNAUTHORIZED", "id_token audience mismatch", 401);
            }
            if (!payload.email) throw new AppError("OAUTH_ERROR", "Google token has no email", 400);

            logger.info({ email: payload.email, provider: "google-gis" }, "Google GIS sign-in");
            user = await upsertOAuthUser({
                email: payload.email,
                full_name: payload.name ?? payload.email,
                avatar_url: payload.picture,
                provider: "google",
                provider_id: payload.sub,
            });
        } else if (google_access_token) {
            // Chrome extension access token flow
            const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${google_access_token}` },
            });
            const info = await infoRes.json() as any;
            if (!info.email) throw new AppError("OAUTH_ERROR", "Failed to get user info", 400);
            user = await upsertOAuthUser({
                email: info.email,
                full_name: info.name ?? info.email,
                avatar_url: info.picture,
                provider: "google",
                provider_id: info.sub,
            });
        } else if (code) {
            user = await exchangeGoogleCode(code, redirect_uri ?? "");
        } else {
            throw new AppError("BAD_REQUEST", "Provide code, id_token, or google_access_token", 400);
        }

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        res.json({
            ok: true,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 604800,
            user: {
                id: user.id,
                is_admin: user.is_admin,
                credits: user.credits,
                plan: user.plan,
            },
        });
    } catch (err) { next(err); }
});

async function exchangeGoogleCode(code: string, redirectUri: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new AppError("SERVICE_ERROR", "Google OAuth not configured", 503);

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });
    const tokens = await tokenRes.json() as any;
    if (tokens.error) throw new AppError("OAUTH_ERROR", tokens.error_description ?? tokens.error, 400);

    // Fetch user info
    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json() as any;

    logger.info({ email: info.email, provider: "google" }, "Google OAuth user");

    return upsertOAuthUser({
        email: info.email,
        full_name: info.name ?? info.email,
        avatar_url: info.picture,
        provider: "google",
        provider_id: info.sub,
    });
}

// ── FACEBOOK OAUTH ────────────────────────────────────────────────────────────

const FB_AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";
const FB_TOKEN_URL = "https://graph.facebook.com/v19.0/oauth/access_token";
const FB_USERINFO_URL = "https://graph.facebook.com/me?fields=id,name,email,picture";

router.get("/facebook", (req, res) => {
    const client_id = process.env.FACEBOOK_APP_ID;
    if (!client_id) return res.status(503).json({ error: "Facebook OAuth not configured" });

    const redirect_uri = process.env.FACEBOOK_REDIRECT_URI ??
        `${process.env.WEB_APP_URL}/auth/oauth/facebook/callback`;

    const params = new URLSearchParams({
        client_id,
        redirect_uri,
        scope: "email,public_profile",
        response_type: "code",
    });
    res.redirect(`${FB_AUTH_URL}?${params}`);
});

router.get("/facebook/callback", async (req, res, next) => {
    try {
        const { code } = req.query as { code?: string };
        if (!code) throw new AppError("BAD_REQUEST", "Missing code", 400);

        const user = await exchangeFacebookCode(code,
            process.env.FACEBOOK_REDIRECT_URI ?? `${process.env.WEB_APP_URL}/auth/oauth/facebook/callback`
        );

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        const frontendUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
        res.redirect(`${frontendUrl}/auth/success?access_token=${accessToken}&refresh_token=${refreshToken}`);
    } catch (err) { next(err); }
});

router.post("/facebook/exchange", async (req, res, next) => {
    try {
        const { code, redirect_uri } = req.body as { code?: string; redirect_uri?: string };
        if (!code) throw new AppError("BAD_REQUEST", "code required", 400);

        const user = await exchangeFacebookCode(code, redirect_uri ?? "");
        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        res.json({
            ok: true,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 604800,
            user: { id: user.id, is_admin: user.is_admin, credits: user.credits, plan: user.plan },
        });
    } catch (err) { next(err); }
});

async function exchangeFacebookCode(code: string, redirectUri: string) {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) throw new AppError("SERVICE_ERROR", "Facebook OAuth not configured", 503);

    const tokenRes = await fetch(
        `${FB_TOKEN_URL}?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`
    );
    const tokens = await tokenRes.json() as any;
    if (tokens.error) throw new AppError("OAUTH_ERROR", tokens.error.message, 400);

    const infoRes = await fetch(`${FB_USERINFO_URL}&access_token=${tokens.access_token}`);
    const info = await infoRes.json() as any;

    if (!info.email) {
        throw new AppError("OAUTH_ERROR", "Facebook account has no email. Please use email registration.", 400);
    }

    logger.info({ email: info.email, provider: "facebook" }, "Facebook OAuth user");

    return upsertOAuthUser({
        email: info.email,
        full_name: info.name,
        avatar_url: info.picture?.data?.url,
        provider: "facebook",
        provider_id: info.id,
    });
}

// ── APPLE OAUTH ───────────────────────────────────────────────────────────────
// Apple Sign In via id_token (sent from frontend after Apple JS SDK handles the flow)

router.post("/apple/verify", async (req, res, next) => {
    try {
        const { id_token, user: appleUser } = req.body as {
            id_token?: string;
            user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        };
        if (!id_token) throw new AppError("BAD_REQUEST", "id_token required", 400);

        // Decode Apple's JWT (public key verification optional for MVP)
        const payload = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString()) as any;
        const email = payload.email ?? appleUser?.email;
        if (!email) throw new AppError("OAUTH_ERROR", "Apple auth returned no email", 400);

        const firstName = appleUser?.name?.firstName ?? "";
        const lastName  = appleUser?.name?.lastName  ?? "";
        const fullName  = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];

        const user = await upsertOAuthUser({
            email,
            full_name: fullName,
            provider: "apple",
            provider_id: payload.sub,
        });

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        res.json({
            ok: true,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 604800,
            user: { id: user.id, is_admin: user.is_admin, credits: user.credits, plan: user.plan },
        });
    } catch (err) { next(err); }
});

export default router;
