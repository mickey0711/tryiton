import React, { useState, useEffect } from "react";

interface PriceResult {
    store: string;
    logo: string;
    price: number;
    currency: string;
    url: string;
    shipping: number | null;
    inStock: boolean;
    badge?: string;
}

interface Props {
    productSrc: string | null;
    productTitle: string;
    currentPrice: number | null;
    onBack: () => void;
}

const DEMO_RESULTS: PriceResult[] = [
    { store: "Amazon",         logo: "🛒", price: 42.99,  currency: "$", url: "#", shipping: 0,    inStock: true,  badge: "Prime" },
    { store: "eBay",           logo: "🔨", price: 38.50,  currency: "$", url: "#", shipping: 4.99, inStock: true  },
    { store: "Zara",           logo: "🏬", price: 49.99,  currency: "$", url: "#", shipping: 0,    inStock: true,  badge: "Official" },
    { store: "ASOS",           logo: "🛍",  price: 35.00,  currency: "$", url: "#", shipping: 5.99, inStock: true,  badge: "Sale -30%" },
    { store: "H&M",            logo: "🏷",  price: 29.99,  currency: "$", url: "#", shipping: 0,    inStock: false },
    { store: "Shein",          logo: "💫", price: 18.49,  currency: "$", url: "#", shipping: 3.99, inStock: true,  badge: "Cheapest" },
    { store: "Zalando",        logo: "👟", price: 45.00,  currency: "$", url: "#", shipping: 0,    inStock: true  },
    { store: "Farfetch",       logo: "💎", price: 55.00,  currency: "$", url: "#", shipping: 0,    inStock: true,  badge: "Luxury" },
    { store: "Nordstrom",      logo: "🌟", price: 52.00,  currency: "$", url: "#", shipping: 0,    inStock: true  },
    { store: "Revolve",        logo: "✨", price: 48.00,  currency: "$", url: "#", shipping: 5.00, inStock: true  },
];

export function PriceIntelligenceScreen({ productSrc, productTitle, currentPrice, onBack }: Props) {
    const [loading, setLoading]     = useState(true);
    const [results, setResults]     = useState<PriceResult[]>([]);
    const [sortBy, setSortBy]       = useState<"price" | "shipping">("price");
    const [toast, setToast]         = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

    useEffect(() => {
        // Simulate API call — TODO: replace with real /api/prices?product=...
        const t = setTimeout(() => {
            const sorted = [...DEMO_RESULTS].sort((a, b) => a.price - b.price);
            setResults(sorted);
            setLoading(false);
        }, 2200);
        return () => clearTimeout(t);
    }, []);

    const sorted = [...results].sort((a, b) => {
        if (sortBy === "price") return (a.price + (a.shipping ?? 0)) - (b.price + (b.shipping ?? 0));
        return (a.shipping ?? 99) - (b.shipping ?? 99);
    });

    const cheapest  = sorted.find(r => r.inStock);
    const savings   = currentPrice && cheapest ? (currentPrice - cheapest.price).toFixed(2) : null;

    return (
        <div className="screen" style={{ position: "relative" }}>
            {/* Toast */}
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
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>💸 Price Compare</span>
            </div>

            {/* Product info */}
            <div style={{
                display: "flex", gap: 10, alignItems: "center",
                background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.06)",
            }}>
                {productSrc && (
                    <img src={productSrc} alt="product"
                        style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, background: "#fff" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {productTitle || "Current product"}
                    </div>
                    {currentPrice && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                            Current price: <strong style={{ color: "#fbbf24" }}>${currentPrice.toFixed(2)}</strong>
                        </div>
                    )}
                </div>
            </div>

            {/* Savings banner */}
            {!loading && savings && parseFloat(savings) > 0 && (
                <div style={{
                    background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)",
                    borderRadius: 10, padding: "8px 14px", textAlign: "center",
                }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>
                        🎉 Save ${savings} buying on {cheapest?.store}!
                    </span>
                </div>
            )}

            {/* Sort tabs */}
            <div style={{ display: "flex", gap: 6 }}>
                {(["price", "shipping"] as const).map(s => (
                    <button key={s} onClick={() => setSortBy(s)} style={{
                        flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid",
                        borderColor: sortBy === s ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.08)",
                        background: sortBy === s ? "rgba(251,191,36,0.12)" : "var(--surface-3)",
                        color: sortBy === s ? "#fbbf24" : "var(--text-muted)",
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}>
                        {s === "price" ? "💰 Lowest price" : "🚚 Free shipping"}
                    </button>
                ))}
            </div>

            {/* Results list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 280 }}>
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={{
                            height: 54, borderRadius: 10, background: "var(--surface-2)",
                            animation: "pulse 1.4s ease infinite",
                            opacity: 1 - i * 0.12,
                        }} />
                    ))
                ) : (
                    sorted.map((r, idx) => {
                        const total = r.price + (r.shipping ?? 0);
                        const isCheapest = r === cheapest;
                        return (
                            <div key={r.store} style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "10px 12px", borderRadius: 10,
                                background: isCheapest ? "rgba(52,211,153,0.08)" : "var(--surface-2)",
                                border: isCheapest ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.06)",
                                opacity: r.inStock ? 1 : 0.45,
                                cursor: r.inStock ? "pointer" : "default",
                                transition: "all 0.15s",
                            }}
                                onClick={() => r.inStock && showToast(`Opening ${r.store}…`)}
                            >
                                {/* Rank */}
                                <div style={{
                                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                                    background: idx === 0 ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.05)",
                                    border: `1px solid ${idx === 0 ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)"}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 10, fontWeight: 700,
                                    color: idx === 0 ? "#fbbf24" : "var(--text-muted)",
                                }}>
                                    {idx + 1}
                                </div>

                                {/* Logo + name */}
                                <div style={{ fontSize: 18, flexShrink: 0 }}>{r.logo}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 5 }}>
                                        {r.store}
                                        {r.badge && (
                                            <span style={{
                                                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                                                background: isCheapest ? "rgba(52,211,153,0.2)" : "rgba(99,102,241,0.2)",
                                                color: isCheapest ? "#34d399" : "#a5b4fc",
                                                border: `1px solid ${isCheapest ? "rgba(52,211,153,0.4)" : "rgba(99,102,241,0.4)"}`,
                                            }}>
                                                {r.badge}
                                            </span>
                                        )}
                                        {!r.inStock && <span style={{ fontSize: 9, color: "#f87171", background: "rgba(248,113,113,0.15)", padding: "1px 5px", borderRadius: 4 }}>Out of stock</span>}
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                                        {r.shipping === 0 ? "✅ Free shipping" : r.shipping ? `+$${r.shipping} shipping` : "Shipping TBD"}
                                    </div>
                                </div>

                                {/* Price */}
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: isCheapest ? "#34d399" : "#e2e8f0" }}>
                                        ${r.price.toFixed(2)}
                                    </div>
                                    {r.shipping !== null && r.shipping > 0 && (
                                        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                                            Total: ${total.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {!loading && (
                <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
                    Prices auto-refreshed · Click a store to buy there
                </p>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}
