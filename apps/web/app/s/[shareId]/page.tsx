"use client";
// Static export: share page is rendered client-side.
// OG/SEO tags are handled dynamically via useEffect (meta tag injection).
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

export default function SharePage({ params }: { params: { shareId: string } }) {
    const [data, setData]       = useState<ShareData | null>(null);
    const [loaded, setLoaded]   = useState(false);

    useEffect(() => {
        fetch(`${API_BASE}/share/s/${params.shareId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoaded(true); })
            .catch(() => setLoaded(true));
    }, [params.shareId]);

    if (!loaded) return (
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center",
            justifyContent: "center", fontFamily: "Inter,sans-serif", color: "#a5b4fc" }}>
            <p>Loading…</p>
        </main>
    );

    return <SharePageClient shareId={params.shareId} initialData={data} />;
}
