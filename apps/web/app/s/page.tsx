"use client";
// Static export: share page reads shareId from ?id= query param (no dynamic segments needed)
import { useEffect, useState } from "react";
import { SharePageClient } from "./SharePageClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface ShareData {
    share_id: string;
    result_url: string | null;
    product_title?: string;
    fit_score: number | null;
    created_at: string;
}

export default function SharePage() {
    const [shareId, setShareId] = useState<string | null>(null);
    const [data, setData]       = useState<ShareData | null>(null);
    const [loaded, setLoaded]   = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        setShareId(id);

        if (!id) { setLoaded(true); return; }

        fetch(`${API_BASE}/share/s/${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoaded(true); })
            .catch(() => setLoaded(true));
    }, []);

    if (!loaded) return (
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center",
            justifyContent: "center", fontFamily: "Inter,sans-serif", color: "#a5b4fc" }}>
            <p>Loading…</p>
        </main>
    );

    return <SharePageClient shareId={shareId ?? ""} initialData={data} />;
}
