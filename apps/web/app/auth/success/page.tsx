"use client";
import { useEffect, useState } from "react";

/**
 * /auth/success?access_token=...&refresh_token=...
 *
 * The backend OAuth flow (oauth.ts) redirects here after Google / Facebook / Apple
 * authentication. We grab the tokens from the URL, persist them, and redirect to
 * the user's gallery.
 */
export default function AuthSuccessPage() {
    const [error, setError] = useState(false);

    useEffect(() => {
        const params  = new URLSearchParams(window.location.search);
        const access  = params.get("access_token");
        const refresh = params.get("refresh_token");

        if (!access) {
            setError(true);
            return;
        }

        localStorage.setItem("accessToken",  access);
        if (refresh) localStorage.setItem("refreshToken", refresh);

        // Clean the tokens out of the URL, then navigate to return_to or /saved
        const returnTo = params.get("return_to");
        window.location.replace(returnTo && returnTo.startsWith("/") ? returnTo : "/saved");
    }, []);

    if (error) return (
        <main style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            fontFamily: "Inter, sans-serif",
            color: "#f87171",
        }}>
            <span style={{ fontSize: 40 }}>⚠️</span>
            <p>Authentication failed — no token received.</p>
            <a href="/login" style={{ color: "#a5b4fc" }}>← Back to sign in</a>
        </main>
    );

    return (
        <main style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            fontFamily: "Inter, sans-serif",
            color: "#a5b4fc",
        }}>
            <span style={{ fontSize: 40 }}>✨</span>
            <p>Signing you in…</p>
        </main>
    );
}
