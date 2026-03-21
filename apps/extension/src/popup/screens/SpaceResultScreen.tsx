import React, { useState } from "react";

interface SpaceResult {
    resultUrl: string;
    advisorText: string;
    fitScore: number;
    category: string;
    productSrc: string | null;
}

interface Props {
    result: SpaceResult;
    onBack: () => void;
    onWishlist?: () => void;
    onPriceCompare?: () => void;
    onShare?: () => void;
    onAskAI?: () => void;
}

const FIT_COLOR = (score: number) =>
    score >= 85 ? "#4ade80" : score >= 65 ? "#fbbf24" : "#f87171";

const FIT_LABEL = (score: number) =>
    score >= 85 ? "Great Fit ✓" : score >= 65 ? "Good Match" : "Needs Review";

const CAT_ICON: Record<string, string> = {
    furniture: "🛋️", electronics: "📺", lighting: "💡",
    plants: "🌱", garden: "🌿", kitchen: "🍳", beauty: "💄",
};

export function SpaceResultScreen({ result, onBack, onWishlist, onPriceCompare, onShare, onAskAI }: Props) {
    const [followUp, setFollowUp] = useState("");
    const [followUpReply, setFollowUpReply] = useState<string | null>(null);
    const [asking, setAsking] = useState(false);

    const icon = CAT_ICON[result.category] ?? "📦";
    const fitColor = FIT_COLOR(result.fitScore);

    const handleFollowUp = async () => {
        if (!followUp.trim()) return;
        setAsking(true);
        // Simulate AI follow-up (extend to real API call)
        await new Promise((r) => setTimeout(r, 1200));
        const replies: Record<string, string> = {
            "alternative": "Here are some similar options that might fit better. Check our Wishlist for curated alternatives.",
            "size": "Based on the room dimensions, I'd recommend a model 15-20% smaller for better proportions.",
            "colour": "The neutral tones in your space work well with both warm and cool finishes. The current choice is a good match.",
            "price": "I found this item starting from $349 at 3 stores. Click Price Compare to see full options.",
        };
        const lower = followUp.toLowerCase();
        const key = Object.keys(replies).find(k => lower.includes(k)) ?? "alternative";
        setFollowUpReply(replies[key] ?? "Great question! Check our recommendations in the Wishlist section.");
        setAsking(false);
    };

    return (
        <div style={{ fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", gap: "10px", padding: "12px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 2 }}>
                <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: "12px" }}>← Back</button>
                <span style={{ fontSize: "16px" }}>{icon}</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Space Analysis Result</div>
                </div>
                <div style={{ background: `rgba(${fitColor === "#4ade80" ? "74,222,128" : fitColor === "#fbbf24" ? "251,191,36" : "248,113,113"},0.15)`, border: `1px solid ${fitColor}40`, borderRadius: "8px", padding: "3px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: fitColor }}>{result.fitScore}%</div>
                    <div style={{ fontSize: "9px", color: fitColor, fontWeight: 600 }}>{FIT_LABEL(result.fitScore)}</div>
                </div>
            </div>

            {/* Result image */}
            <div style={{ borderRadius: "14px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", position: "relative" }}>
                <img src={result.resultUrl} alt="Space result" style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "cover" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.7))", padding: "16px 12px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>AI Composite Preview</div>
                    <div style={{ fontSize: "11px", color: "#a78bfa", fontWeight: 600, background: "rgba(124,58,237,0.3)", padding: "2px 8px", borderRadius: "6px" }}>Space Intelligence™</div>
                </div>
            </div>

            {/* AI Advisor bubble */}
            <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "12px", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>🤖</div>
                    <div>
                        <div style={{ fontSize: "10px", color: "#a78bfa", fontWeight: 700, marginBottom: 4 }}>AI Advisor</div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>{result.advisorText}</div>
                    </div>
                </div>
            </div>

            {/* Follow-up question */}
            <div style={{ display: "flex", gap: "6px" }}>
                <input
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFollowUp()}
                    placeholder="Ask AI anything about this product…"
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", padding: "7px 10px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", outline: "none" }}
                />
                <button onClick={handleFollowUp} disabled={asking || !followUp.trim()}
                    style={{ padding: "7px 12px", background: asking ? "rgba(124,58,237,0.3)" : "rgba(124,58,237,0.8)", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>
                    {asking ? "…" : "Ask"}
                </button>
            </div>

            {/* AI follow-up reply */}
            {followUpReply && (
                <div style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                    🤖 {followUpReply}
                </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
                <button onClick={onWishlist}
                    style={{ padding: "9px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: "10px", color: "#a78bfa", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    ♥ Save to Wishlist
                </button>
                <button onClick={onPriceCompare}
                    style={{ padding: "9px", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: "10px", color: "#4ade80", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    💰 Find Cheaper
                </button>
                <button onClick={onShare}
                    style={{ padding: "9px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    🔗 Share Result
                </button>
                <button onClick={onBack}
                    style={{ padding: "9px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    🔄 Try Another
                </button>
            </div>

            {/* Disclaimer */}
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", textAlign: "center", lineHeight: 1.5 }}>
                AI composite for visualisation only. Real product may vary. Verify dimensions before ordering.
            </div>
        </div>
    );
}
