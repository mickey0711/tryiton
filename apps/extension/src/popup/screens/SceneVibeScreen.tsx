import React, { useState } from "react";

interface Props {
    resultUrl: string | null;
    profileImageB64: string | null;
    onBack: () => void;
}

const VIBES = [
    { id: "beach",    label: "Beach",      emoji: "🏖",  desc: "Sunny beach, golden hour" },
    { id: "city",     label: "City Night",  emoji: "🌆",  desc: "Urban streets, city glow" },
    { id: "cafe",     label: "Cozy Café",   emoji: "☕",  desc: "Warm café, soft lighting" },
    { id: "nature",   label: "Nature",      emoji: "🌿",  desc: "Lush forest, dappled light" },
    { id: "runway",   label: "Runway",      emoji: "💃",  desc: "Fashion show, bright stage" },
    { id: "rooftop",  label: "Rooftop",     emoji: "🌇",  desc: "Sunset rooftop terrace" },
    { id: "studio",   label: "Studio",      emoji: "📸",  desc: "Clean white photo studio" },
    { id: "travel",   label: "Travel",      emoji: "✈️",  desc: "Airport, wanderlust vibes" },
];

export function SceneVibeScreen({ resultUrl, profileImageB64, onBack }: Props) {
    const [selected, setSelected]       = useState<string | null>(null);
    const [loading, setLoading]         = useState(false);
    const [vibeResult, setVibeResult]   = useState<string | null>(null);
    const [toast, setToast]             = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

    const handleGenerate = async () => {
        if (!selected) return;
        if (!resultUrl && !profileImageB64) {
            showToast("❌ No image to transform. Complete a try-on first.");
            return;
        }
        setLoading(true);

        try {
            // TODO: Call backend POST /fit/scene-vibe when model is ready.
            // For now simulate with a realistic delay + show the original image
            await new Promise(r => setTimeout(r, 3500));
            // Placeholder: returns the original image. Real impl: AI inpaints background
            setVibeResult(resultUrl ?? profileImageB64 ?? "");
            showToast(`✨ ${VIBES.find(v => v.id === selected)?.label} vibe applied!`);
        } catch (err: any) {
            showToast("❌ Scene generation failed. Try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!vibeResult) return;
        const a = document.createElement("a");
        a.href = vibeResult;
        a.download = `tryiton-vibe-${selected}.jpg`;
        a.click();
    };

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
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>🌅 Scene Vibe</span>
            </div>

            {/* Explanation pill */}
            <div style={{
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#a5b4fc",
                lineHeight: 1.5, textAlign: "center",
            }}>
                AI keeps your <strong style={{ color: "#c4b5fd" }}>face & body proportions</strong> exactly as-is,
                and transforms only the background &amp; lighting to match the chosen vibe.
            </div>

            {/* Result image or placeholder */}
            <div style={{
                width: "100%", height: 200, borderRadius: 12,
                background: "linear-gradient(135deg, #0a0a12, #0f0f1e)",
                border: "1px solid rgba(99,102,241,0.2)",
                overflow: "hidden", position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}>
                {loading ? (
                    <div style={{ textAlign: "center", gap: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontSize: 32, animation: "spin 1.5s linear infinite" }}>🌀</div>
                        <span style={{ fontSize: 11, color: "#a5b4fc" }}>Generating {VIBES.find(v => v.id === selected)?.label} vibe…</span>
                    </div>
                ) : vibeResult ? (
                    <img src={vibeResult} alt="Scene vibe result" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 40 }}>🌅</div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Choose a vibe below</span>
                    </div>
                )}
            </div>

            {/* Vibe grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {VIBES.map(v => (
                    <button
                        key={v.id}
                        onClick={() => { setSelected(v.id); setVibeResult(null); }}
                        disabled={loading}
                        style={{
                            display: "flex", flexDirection: "column", alignItems: "center",
                            gap: 3, padding: "8px 4px 6px",
                            borderRadius: 10, border: selected === v.id
                                ? "1px solid rgba(124,58,237,0.6)"
                                : "1px solid rgba(255,255,255,0.07)",
                            background: selected === v.id
                                ? "rgba(124,58,237,0.18)"
                                : "var(--surface-3)",
                            cursor: loading ? "not-allowed" : "pointer",
                            boxShadow: selected === v.id
                                ? "0 0 0 1.5px rgba(124,58,237,0.3)"
                                : "none",
                            transition: "all 0.18s",
                        }}
                    >
                        <span style={{ fontSize: 20, lineHeight: 1 }}>{v.emoji}</span>
                        <span style={{
                            fontSize: 10, fontWeight: 600, textAlign: "center", lineHeight: 1.2,
                            color: selected === v.id ? "#c4b5fd" : "var(--text-muted)",
                        }}>{v.label}</span>
                    </button>
                ))}
            </div>

            {/* CTA */}
            {vibeResult ? (
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-secondary" onClick={handleDownload} style={{ flex: 1 }}>⬇ Download</button>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setVibeResult(null); setSelected(null); }}>
                        🔄 Try Another
                    </button>
                </div>
            ) : (
                <button
                    className="btn btn-primary"
                    disabled={!selected || loading}
                    onClick={handleGenerate}
                    style={{ opacity: (!selected || loading) ? 0.5 : 1 }}
                >
                    {loading
                        ? "Generating…"
                        : selected
                            ? `✨ Generate ${VIBES.find(v => v.id === selected)?.label} Vibe`
                            : "Select a vibe above"}
                </button>
            )}

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
                🔒 AI never alters your face or body — only the scene &amp; lighting changes.
            </p>

            <style>{`
                @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
            `}</style>
        </div>
    );
}
