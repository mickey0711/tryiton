"use client";
/**
 * This page is the DO CDN's SPA fallback (index.html).
 * It's NEVER served at "/" (that goes to Express/landing page).
 * It's only hit when someone requests /login, /register, /saved, etc.
 * without the .html extension — so we redirect them to the right file.
 */
import { useEffect } from "react";

const ROUTES: Record<string, string> = {
    "/login":        "/login.html",
    "/register":     "/register.html",
    "/saved":        "/saved.html",
    "/account":      "/account.html",
    "/s":            "/s.html",
    "/auth/success": "/auth/success.html",
};

export default function SpaRouter() {
    useEffect(() => {
        const path = window.location.pathname.replace(/\/$/, "") || "/";
        const target = ROUTES[path];
        if (target) {
            // Preserve query string (e.g. /s?id=xxx → /s.html?id=xxx)
            window.location.replace(target + window.location.search);
        }
        // Unknown path — let it 404 or fall through
    }, []);

    return null; // No UI — this page only runs the redirect
}
