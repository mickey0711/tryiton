import React, { useEffect, useState } from "react";

interface OutfitItem {
    resultUrl: string | null;
    productSrc: string | null;
    fitScore: number | null;
    addedAt: number;
}

interface Props {
    onBack: () => void;
    onContinueShopping: () => void;
}

export function OutfitBuilderScreen({ onBack, onContinueShopping }: Props) {
    const [items, setItems] = useState<OutfitItem[]>([]);
    const [clearing, setClearing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        chrome.storage.local.get(["outfitSession"], (data: any) => {
            setItems(data.outfitSession ?? []);
        });
    }, []);

    const handleRemove = (idx: number) => {
        const next = items.filter((_, i) => i !== idx);
        setItems(next);
        chrome.storage.local.set({ outfitSession: next });
        showToast("Removed from outfit");
    };

    const handleClearAll = () => {
        setClearing(true);
        setTimeout(() => {
            setItems([]);
            chrome.storage.local.set({ outfitSession: [] });
            setClearing(false);
            showToast("🗑 Outfit cleared");
        }, 300);
    };

    const handleShareOutfit = async () => {
        showToast("📤 Sharing feature coming soon!");
    };

    const isEmpty = items.length === 0;

    return (
        <div className="screen" style={{ position: "relative" }}>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
                    background: "rgba(30,30,40,0.95)", border: "1px solid rgba(165,180,252,0.3)",
                    borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    color: "#e2e8f0", zIndex: 999, whiteSpace: "nowrap",
                }}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="header">
                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onBack}>← Back</button>
                <span className="logo" style={{ marginLeft: "auto" }}>My Outfit 🎨</span>
                {!isEmpty && (
                    <button
                        onClick={handleClearAll}
                        style={{ marginLeft: 8, fontSize: 11, color: "#f87171", background: "transparent", border: "none", cursor: "pointer", opacity: 0.7 }}
                    >
                        Clear all
                    </button>
                )}
            </div>

            {isEmpty ? (
                /* Empty State */
                <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 14, padding: "32px 16px",
                }}>
                    <div style={{ fontSize: 48 }}>👗</div>
                    <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
                        Your outfit is empty.<br />
                        Try on items and tap <strong style={{ color: "#c4b5fd" }}>Add to Outfit</strong> to build your complete look!
                    </p>
                    <button className="btn btn-primary" onClick={onContinueShopping}>
                        🛍 Start Shopping
                    </button>
                </div>
            ) : (
                <>
                    {/* Item count badge */}
                    <div style={{
                        background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
                        borderRadius: 10, padding: "6px 12px", fontSize: 12, color: "#a5b4fc",
                        textAlign: "center", fontWeight: 600,
                    }}>
                        🎨 {items.length} item{items.length !== 1 ? "s" : ""} in your complete look
                    </div>

                    {/* Outfit grid */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: items.length === 1 ? "1fr" : "repeat(2, 1fr)",
                        gap: 8,
                        maxHeight: 280,
                        overflowY: "auto",
                    }}>
                        {items.map((item, idx) => (
                            <div key={item.addedAt} style={{
                                position: "relative",
                                borderRadius: 10,
                                overflow: "hidden",
                                background: "var(--surface-2)",
                                border: "1px solid rgba(99,102,241,0.2)",
                                aspectRatio: "1",
                            }}>
                                {item.resultUrl ? (
                                    <img
                                        src={item.resultUrl}
                                        alt={`Outfit item ${idx + 1}`}
                                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                    />
                                ) : (
                                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                                        🛍
                                    </div>
                                )}

                                {/* Fit score badge */}
                                {item.fitScore != null && (
                                    <div style={{
                                        position: "absolute", bottom: 4, left: 4,
                                        background: "rgba(0,0,0,0.7)", borderRadius: 6,
                                        fontSize: 10, fontWeight: 700, color: item.fitScore >= 80 ? "#4ade80" : "#fbbf24",
                                        padding: "2px 5px",
                                    }}>
                                        {item.fitScore}%
                                    </div>
                                )}

                                {/* Remove button */}
                                <button
                                    onClick={() => handleRemove(idx)}
                                    style={{
                                        position: "absolute", top: 4, right: 4,
                                        background: "rgba(0,0,0,0.65)", border: "none",
                                        borderRadius: "50%", width: 22, height: 22,
                                        cursor: "pointer", color: "#f87171", fontSize: 12,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        lineHeight: 1,
                                    }}
                                    title="Remove"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <button className="btn btn-primary" onClick={handleShareOutfit}>
                        🔗 Share Complete Look
                    </button>
                    <button className="btn btn-secondary" onClick={onContinueShopping} style={{ fontSize: 12 }}>
                        🛍 Continue Shopping — add more
                    </button>
                </>
            )}
        </div>
    );
}
