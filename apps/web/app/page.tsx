"use client";
/**
 * SPA Router — served as index.html by the DO CDN for ALL routes.
 *
 * DO CDN always uploads root-page content to every .html file, so we can't rely
 * on separate login.html / register.html having the right content.
 * Instead: detect the current URL path on the client and dynamically import+render
 * the correct page component — no redirects, no loops.
 */
import { useEffect, useState } from "react";

type PageModule = { default: React.ComponentType<any> };

const LOADERS: Record<string, () => Promise<PageModule>> = {
    "/login":             () => import("./login/page"),
    "/login.html":        () => import("./login/page"),
    "/register":          () => import("./register/page"),
    "/register.html":     () => import("./register/page"),
    "/saved":             () => import("./saved/page"),
    "/saved.html":        () => import("./saved/page"),
    "/account":           () => import("./account/page"),
    "/account.html":      () => import("./account/page"),
    "/s":                 () => import("./s/page"),
    "/s.html":            () => import("./s/page"),
    "/auth/success":      () => import("./auth/success/page"),
    "/auth/success.html": () => import("./auth/success/page"),
};

export default function SpaRouter() {
    const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);

    useEffect(() => {
        const path = window.location.pathname.replace(/\/$/, "") || "/";
        const loader = LOADERS[path];
        if (loader) {
            loader().then((mod) => setComponent(() => mod.default));
        }
        // Unknown path (e.g. "/") — render nothing; Express handles "/"
    }, []);

    if (!Component) return null;
    return <Component />;
}
