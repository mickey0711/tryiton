import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../db/client";
import { logger } from "../config/logger";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Only allow redirects back to a Chrome extension's identity callback origin
 * (https://<extension-id>.chromiumapp.org/). Anything else is an open redirect
 * that would leak the issued access token.
 */
function safeExtRedirect(value: unknown): string | null {
    if (typeof value !== "string") return null;
    try {
        const u = new URL(value);
        if (u.protocol !== "https:") return null;
        if (!/^[a-p]{32}\.chromiumapp\.org$/.test(u.hostname)) return null;
        return `${u.origin}/`;
    } catch { return null; }
}

/** Accept the web client id plus any extra ids (extension / iOS) listed in GOOGLE_EXTRA_CLIENT_IDS. */
function googleClientIds(): string[] {
    return [process.env.GOOGLE_CLIENT_ID, ...(process.env.GOOGLE_EXTRA_CLIENT_IDS ?? "").split(",")]
        .map((v) => v?.trim()).filter((v): v is string => !!v);
}

/** Verify a Google ID token with Google (signature, expiry) and check it was issued to us. */
async function verifyGoogleIdToken(idToken: string) {
    const ids = googleClientIds();
    if (!ids.length) throw new AppError("SERVICE_ERROR", "Google OAuth not configured", 503);
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        { signal: AbortSignal.timeout(8000) });
    const info = await r.json().catch(() => ({})) as any;
    if (!r.ok || !info.sub) throw new AppError("UNAUTHORIZED", "Invalid Google token", 401);
    if (!ids.includes(info.aud)) throw new AppError("UNAUTHORIZED", "id_token audience mismatch", 401);
    if (info.email_verified !== "true" && info.email_verified !== true) {
        throw new AppError("OAUTH_ERROR", "Google email is not verified", 400);
    }
    return info as { sub: string; email: string; name?: string; picture?: string };
}

/** Verify a Google OAuth access token was issued to one of our client ids, then load the profile. */
async function verifyGoogleAccessToken(accessToken: string) {
    const ids = googleClientIds();
    if (!ids.length) throw new AppError("SERVICE_ERROR", "Google OAuth not configured", 503);
    const t = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(8000) });
    const tok = await t.json().catch(() => ({})) as any;
    if (!t.ok || !ids.includes(tok.aud ?? tok.azp)) {
        throw new AppError("UNAUTHORIZED", "Google access token was not issued to this app", 401);
    }
    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000),
    });
    const info = await infoRes.json().catch(() => ({})) as any;
    if (!info.email || !info.sub) throw new AppError("OAUTH_ERROR", "Failed to get user info", 400);
    if (info.email_verified === false) throw new AppError("OAUTH_ERROR", "Google email is not verified", 400);
    return info as { sub: string; email: string; name?: string; picture?: string };
}

// Apple public keys (JWKS) — cached for an hour.
let appleKeys: { keys: any[]; fetchedAt: number } | null = null;
async function getAppleKey(kid: string) {
    if (!appleKeys || Date.now() - appleKeys.fetchedAt > 3600_000) {
        const r = await fetch("https://appleid.apple.com/auth/keys", { signal: AbortSignal.timeout(8000) });
        appleKeys = { keys: ((await r.json()) as any).keys ?? [], fetchedAt: Date.now() };
    }
    const jwk = appleKeys.keys.find((k) => k.kid === kid);
    if (!jwk) throw new AppError("UNAUTHORIZED", "Unknown Apple signing key", 401);
    return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/** Verify an Apple identity token: RS256 signature against Apple's JWKS, issuer and audience. */
async function verifyAppleIdToken(idToken: string) {
    const audience = process.env.APPLE_CLIENT_ID;
    if (!audience) throw new AppError("SERVICE_ERROR", "Apple Sign In not configured", 503);
    const header = jwt.decode(idToken, { complete: true })?.header as { kid?: string } | undefined;
    if (!header?.kid) throw new AppError("UNAUTHORIZED", "Invalid Apple token", 401);
    const key = await getAppleKey(header.kid);
    try {
        return jwt.verify(idToken, key, {
            algorithms: ["RS256"], issuer: "https://appleid.apple.com", audience,
        }) as { sub: string; email?: string; email_verified?: string | boolean };
    } catch {
        throw new AppError("UNAUTHORIZED", "Invalid Apple token", 401);
    }
}

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
           -- If the existing row was never verified, whoever set its password did not prove
           -- ownership of the email — the OAuth sign-in just did. Drop that password.
           password_hash = CASE WHEN users.email_verified THEN users.password_hash ELSE NULL END,
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

// Web redirect flow: GET /auth/oauth/google?return_to=/optional/path
router.get("/google", (req, res) => {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    if (!client_id) return res.status(503).json({ error: "Google OAuth not configured" });

    const redirect_uri = process.env.GOOGLE_REDIRECT_URI ??
        `${process.env.WEB_APP_URL}/auth/oauth/google/callback`;

    // Encode return_to in state so the callback knows where to redirect after auth
    const returnTo = req.query.return_to as string | undefined;
    const state = returnTo && returnTo.startsWith("/")
        ? Buffer.from(JSON.stringify({ return_to: returnTo })).toString("base64url")
        : undefined;

    const params = new URLSearchParams({
        client_id,
        redirect_uri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
    });
    if (state) params.set("state", state);
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

// Chrome Extension flow: GET /auth/oauth/google/extension?ext_redirect=https://<id>.chromiumapp.org/
// Encodes ext_redirect in OAuth state so the callback can redirect back to the extension.
router.get("/google/extension", (req, res) => {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    if (!client_id) return res.status(503).json({ error: "Google OAuth not configured" });

    const extRedirect = safeExtRedirect(req.query.ext_redirect);
    if (!extRedirect) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid ext_redirect" });
    }

    const redirect_uri = process.env.GOOGLE_REDIRECT_URI ??
        `${process.env.WEB_APP_URL}/auth/oauth/google/callback`;

    // Encode ext_redirect into state so the callback knows to send token to extension
    const state = Buffer.from(JSON.stringify({ ext_redirect: extRedirect })).toString("base64url");

    const params = new URLSearchParams({
        client_id,
        redirect_uri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
        state,
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

// Web callback: GET /auth/oauth/google/callback?code=...
// Also handles extension callbacks when state contains ext_redirect.
router.get("/google/callback", async (req, res, next) => {
    try {
        const { code, state } = req.query as { code?: string; state?: string };
        if (!code) throw new AppError("BAD_REQUEST", "Missing code", 400);

        // Decode state to detect extension flow or return_to
        let extRedirect: string | null = null;
        let returnTo = "/saved";
        if (state) {
            try {
                const decoded = JSON.parse(Buffer.from(state, "base64url").toString()) as any;
                extRedirect = safeExtRedirect(decoded.ext_redirect);
                if (typeof decoded.return_to === "string" && decoded.return_to.startsWith("/")) {
                    returnTo = decoded.return_to;
                }
            } catch { /* ignore malformed state */ }
        }

        const user = await exchangeGoogleCode(code,
            process.env.GOOGLE_REDIRECT_URI ?? `${process.env.WEB_APP_URL}/auth/oauth/google/callback`
        );

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        if (extRedirect) {
            // Extension flow — pass JWT back to chromiumapp.org redirect URL
            const userPayload = encodeURIComponent(JSON.stringify({
                id: user.id,
                is_admin: user.is_admin,
                credits: user.credits,
                plan: user.plan,
            }));
            logger.info({ userId: user.id }, "Google OAuth → extension");
            return res.redirect(`${extRedirect}?access_token=${accessToken}&refresh_token=${refreshToken}&user=${userPayload}`);
        }

        // Standard web redirect — pass return_to so auth/success knows where to land
        const frontendUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
        // `t` busts any CDN/browser cache of the success page (it was serving a stale copy without the token reader)
        res.redirect(`${frontendUrl}/auth/success?return_to=${encodeURIComponent(returnTo)}&t=${Date.now()}#access_token=${accessToken}&refresh_token=${refreshToken}`);
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
            // GIS popup flow — verified with Google (signature + audience), never just decoded
            const payload = await verifyGoogleIdToken(id_token);
            logger.info({ email: payload.email, provider: "google-gis" }, "Google GIS sign-in");
            user = await upsertOAuthUser({
                email: payload.email,
                full_name: payload.name ?? payload.email,
                avatar_url: payload.picture,
                provider: "google",
                provider_id: payload.sub,
            });
        } else if (google_access_token) {
            // Chrome extension chrome.identity.getAuthToken flow — token must belong to our client id
            const info = await verifyGoogleAccessToken(google_access_token);
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
    if (!info.email || !info.sub) throw new AppError("OAUTH_ERROR", "Google returned no email", 400);

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

// Chrome Extension flow: GET /auth/oauth/facebook/extension?ext_redirect=https://<id>.chromiumapp.org/
router.get("/facebook/extension", (req, res) => {
    const client_id = process.env.FACEBOOK_APP_ID;
    if (!client_id) return res.status(503).json({ error: "Facebook OAuth not configured" });

    const extRedirect = safeExtRedirect(req.query.ext_redirect);
    if (!extRedirect) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid ext_redirect" });
    }

    const redirect_uri = process.env.FACEBOOK_REDIRECT_URI ??
        `${process.env.WEB_APP_URL}/auth/oauth/facebook/callback`;

    const state = Buffer.from(JSON.stringify({ ext_redirect: extRedirect })).toString("base64url");

    const params = new URLSearchParams({
        client_id,
        redirect_uri,
        scope: "email,public_profile",
        response_type: "code",
        state,
    });
    res.redirect(`${FB_AUTH_URL}?${params}`);
});

router.get("/facebook/callback", async (req, res, next) => {
    try {
        const { code, state } = req.query as { code?: string; state?: string };
        if (!code) throw new AppError("BAD_REQUEST", "Missing code", 400);

        // Decode state to detect extension flow
        let extRedirect: string | null = null;
        if (state) {
            try {
                const decoded = JSON.parse(Buffer.from(state, "base64url").toString()) as any;
                extRedirect = safeExtRedirect(decoded.ext_redirect);
            } catch { /* ignore malformed state */ }
        }

        const user = await exchangeFacebookCode(code,
            process.env.FACEBOOK_REDIRECT_URI ?? `${process.env.WEB_APP_URL}/auth/oauth/facebook/callback`
        );

        const { accessToken, refreshToken, refreshHash } = issueTokens(user.id);
        await db.query(
            `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, $2, $3)`,
            [user.id, refreshHash, new Date(Date.now() + 30 * 24 * 3600 * 1000)]
        );

        if (extRedirect) {
            const userPayload = encodeURIComponent(JSON.stringify({
                id: user.id,
                is_admin: user.is_admin,
                credits: user.credits,
                plan: user.plan,
            }));
            logger.info({ userId: user.id }, "Facebook OAuth → extension");
            return res.redirect(`${extRedirect}?access_token=${accessToken}&refresh_token=${refreshToken}&user=${userPayload}`);
        }

        const frontendUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
        res.redirect(`${frontendUrl}/auth/success?t=${Date.now()}#access_token=${accessToken}&refresh_token=${refreshToken}`);
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

        const payload = await verifyAppleIdToken(id_token);
        // Apple only includes the email on first sign-in; afterwards we look it up by provider_id.
        let email = payload.email ?? null;
        if (!email) {
            const prev = await db.query<{ email: string }>(
                `SELECT u.email FROM oauth_providers o JOIN users u ON u.id = o.user_id
                  WHERE o.provider = 'apple' AND o.provider_id = $1`, [payload.sub]);
            email = prev.rows[0]?.email ?? null;
        }
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
