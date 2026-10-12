/**
 * Single API client for the extension.
 *
 * - One base URL for every screen (no more per-file hard-coded hosts).
 * - Attaches the stored access token.
 * - On 401 it refreshes the access token with the stored refresh token once and retries;
 *   if the refresh fails the tokens are cleared so the UI shows the sign-in screen.
 */

export const API_BASE = "https://tryit4u.ai";

type Tokens = { accessToken?: string; refreshToken?: string };

export function getTokens(): Promise<Tokens> {
    return new Promise((res) => chrome.storage.local.get(["accessToken", "refreshToken"], (d: any) => res(d ?? {})));
}

export function getToken(): Promise<string | null> {
    return getTokens().then((t) => t.accessToken ?? null);
}

export function setTokens(accessToken: string, refreshToken?: string): Promise<void> {
    return new Promise((res) =>
        chrome.storage.local.set(refreshToken ? { accessToken, refreshToken } : { accessToken }, () => res()));
}

export function clearTokens(): Promise<void> {
    return new Promise((res) => chrome.storage.local.remove(["accessToken", "refreshToken", "userInfo"], () => res()));
}

let refreshing: Promise<string | null> | null = null;

/** Exchange the refresh token for a new access token. Shared across concurrent callers. */
export function refreshAccessToken(): Promise<string | null> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        const { refreshToken } = await getTokens();
        if (!refreshToken) return null;
        try {
            const r = await fetch(`${API_BASE}/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: refreshToken }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!r.ok) { await clearTokens(); return null; }
            const data = await r.json();
            if (!data.access_token) return null;
            await setTokens(data.access_token);
            return data.access_token as string;
        } catch {
            return null;
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
    get outOfCredits() { return this.status === 402; }
    get unauthorized() { return this.status === 401; }
}

/**
 * fetch() with auth + one automatic refresh-and-retry on 401.
 * `auth: "optional"` sends the token when present but doesn't require one.
 */
export async function apiFetch(path: string, init: RequestInit & { auth?: "required" | "optional" | "none" } = {}): Promise<Response> {
    const { auth = "required", ...rest } = init;
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

    const doFetch = async (token: string | null) => {
        const headers = new Headers(rest.headers ?? {});
        if (token) headers.set("Authorization", `Bearer ${token}`);
        if (rest.body && typeof rest.body === "string" && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }
        return fetch(url, { ...rest, headers });
    };

    const token = auth === "none" ? null : await getToken();
    if (auth === "required" && !token) throw new ApiError(401, "UNAUTHORIZED", "Please sign in");

    let res = await doFetch(token);
    if (res.status === 401 && token) {
        const fresh = await refreshAccessToken();
        if (fresh) res = await doFetch(fresh);
    }
    return res;
}

/** apiFetch + JSON parsing; throws ApiError for non-2xx so callers can branch on 401/402. */
export async function apiJson<T = any>(path: string, init: RequestInit & { auth?: "required" | "optional" | "none" } = {}): Promise<T> {
    const res = await apiFetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(res.status, data.error ?? "ERROR", data.message ?? `Request failed (${res.status})`);
    }
    return data as T;
}
