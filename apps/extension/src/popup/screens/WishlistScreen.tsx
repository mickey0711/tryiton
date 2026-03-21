import React, { useState, useEffect, useCallback } from "react";

interface SavedItem {
    id: string;
    snapshot: {
        resultUrl?: string;
        productTitle?: string;
        fitScore?: number;
        category?: string;
    };
    product_title?: string;
    product_brand?: string;
    product_category?: string;
    created_at: string;
}

interface Props {
    onBack: () => void;
    apiBase: string;
    token: string | null;
}

const API_BASE = "http://localhost:8080";

export function WishlistScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
    const [items, setItems]         = useState<SavedItem[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [toast, setToast]         = useState<string | null>(null);
    const [deleting, setDeleting]   = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

    const loadItems = useCallback(async () => {
        if (!token) { setLoading(false); setError("Sign in to see your saved items"); return; }
        try {
            const res = await fetch(`${API_BASE}/library/saved`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to load");
            const data = await res.json();
            setItems(data.items ?? []);
        } catch {
            setError("Couldn't load your wishlist. Try again.");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadItems(); }, [loadItems]);

    const handleDelete = async (id: string) => {
        setDeleting(id);
        try {
            const res = await fetch(`${API_BASE}/library/saved/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token ?? ""}` },
            });
            if (res.ok) {
                setItems(prev => prev.filter(i => i.id !== id));
                showToast("Removed from wishlist");
            }
        } catch {
            showToast("❌ Failed to remove item");
        } finally {
            setDeleting(null);
        }
    };

    const handleShare = async (item: SavedItem) => {
        const url = item.snapshot?.resultUrl ?? "";
        const text = `Check out my try-on: ${item.snapshot?.productTitle ?? "product"} — TryIt4U`;
        try {
            if (navigator.share && navigator.canShare?.({ url, text })) {
                await navigator.share({ title: text, text, url });
            } else {
                await navigator.clipboard.writeText(url);
                showToast("🔗 Link copied!");
            }
        } catch { /* cancelled */ }
    };

    return (
        <div className="screen" style={{ position: "relative" }}>
            {toast && (
                <div style={{
                    position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
                    background: "rgba(30,30,40,0.97)", border: "1px solid rgba(165,180,252,0.3)",
                    borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    color: "#e2e8f0", zIndex: 999, whiteSpace: "nowrap",
                }}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="header">
                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onBack}>← Back</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>⭐ My Wishlist</span>
                <span style={{
                    marginLeft: "auto", fontSize: 10, color: "var(--text-muted)",
                    background: "var(--surface-3)", borderRadius: 10, padding: "2px 8px",
                }}>
                    {items.length} saved
                </span>
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} style={{
                            height: 72, borderRadius: 12, background: "var(--surface-2)",
                            opacity: 1 - i * 0.15, animation: "pulse 1.4s ease infinite",
                        }} />
                    ))}
                </div>
            ) : error ? (
                <div style={{
                    textAlign: "center", padding: "40px 20px",
                    color: "var(--text-muted)", fontSize: 13,
                }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                    <div>{error}</div>
                </div>
            ) : items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
                    <div style={{ fontWeight: 600, color: "#e2e8f0" }}>No saved items yet</div>
                    <div style={{ marginTop: 6 }}>Tap ⭐ Save on any try-on to keep it here</div>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 340 }}>
                    {items.map(item => {
                        const imgSrc = item.snapshot?.resultUrl;
                        const title  = item.snapshot?.productTitle ?? item.product_title ?? "Saved item";
                        const score  = item.snapshot?.fitScore;
                        const cat    = item.snapshot?.category ?? item.product_category ?? "";
                        const date   = new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

                        return (
                            <div key={item.id} style={{
                                display: "flex", gap: 10, alignItems: "center",
                                padding: "10px 12px", borderRadius: 12,
                                background: "var(--surface-2)",
                                border: "1px solid rgba(255,255,255,0.06)",
                            }}>
                                {/* Image */}
                                <div style={{
                                    width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                                    background: "var(--surface-3)", overflow: "hidden",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    {imgSrc
                                        ? <img src={imgSrc} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <span style={{ fontSize: 22 }}>👗</span>}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {title}
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8 }}>
                                        <span>{date}</span>
                                        {cat && <span>· {cat}</span>}
                                        {score && <span style={{ color: score >= 80 ? "#4ade80" : "#fbbf24" }}>· Fit {score}%</span>}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                    <button
                                        onClick={() => handleShare(item)}
                                        style={{
                                            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                                            borderRadius: 6, color: "#a5b4fc", padding: "4px 7px", cursor: "pointer", fontSize: 12,
                                        }}
                                        title="Share"
                                    >↗</button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        disabled={deleting === item.id}
                                        style={{
                                            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                                            borderRadius: 6, color: "#f87171", padding: "4px 7px", cursor: deleting === item.id ? "not-allowed" : "pointer",
                                            opacity: deleting === item.id ? 0.5 : 1, fontSize: 12,
                                        }}
                                        title="Remove"
                                    >✕</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.6; }
                }
            `}</style>
        </div>
    );
}
