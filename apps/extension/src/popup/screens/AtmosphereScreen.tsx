import React, { useState } from "react";

const API_BASE = "https://tryiton-app-f32z6.ondigitalocean.app";

interface Props {
    roomImageB64: string;
    onBack: () => void;
    onResult: (resultUrl: string, style: string) => void;
}

const STYLES = [
    { id: "modern",       emoji: "🏙️", label: "Modern" },
    { id: "cozy",         emoji: "🕯️", label: "Cozy" },
    { id: "scandinavian", emoji: "🌿", label: "Scandi" },
    { id: "bohemian",     emoji: "🎨", label: "Boho" },
    { id: "industrial",   emoji: "⚙️", label: "Industrial" },
    { id: "luxe",         emoji: "💎", label: "Luxe" },
];

export function AtmosphereScreen({ roomImageB64, onBack, onResult }: Props) {
    const [selected, setSelected] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!selected || loading) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/space/atmosphere`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_image: roomImageB64, style: selected }),
            });
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();
            onResult(data.result_image, STYLES.find(s => s.id === selected)?.label ?? selected);
        } catch (err: any) {
            setError("Something went wrong. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="screen" style={{ display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div className="header">
                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onBack}>← Back</button>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18 }}>🎨</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc" }}>Atmosphere Changer</span>
                </div>
            </div>

            {/* Room preview small */}
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(99,102,241,0.2)", flexShrink: 0, maxHeight: 160 }}>
                <img src={roomImageB64} alt="Your room" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
            </div>

            {/* Instruction */}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: 4 }}>
                Pick a style — AI transforms your home's atmosphere
            </div>

            {/* Style grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
                {STYLES.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                        style={{
                            padding: "12px 8px",
                            borderRadius: 12,
                            border: selected === s.id
                                ? "2px solid #8b5cf6"
                                : "1px solid rgba(99,102,241,0.25)",
                            background: selected === s.id
                                ? "rgba(139,92,246,0.25)"
                                : "rgba(15,15,30,0.6)",
                            color: selected === s.id ? "#c4b5fd" : "rgba(255,255,255,0.65)",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 0.2s",
                            transform: selected === s.id ? "scale(1.03)" : "scale(1)",
                        }}
                    >
                        <span style={{ fontSize: 24 }}>{s.emoji}</span>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div style={{ fontSize: 12, color: "#f87171", textAlign: "center", marginTop: 4 }}>{error}</div>
            )}

            {/* Generate button */}
            <button
                className="btn btn-primary"
                disabled={!selected || loading}
                onClick={handleGenerate}
                style={{
                    marginTop: "auto",
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: !selected ? 0.5 : 1,
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
            >
                {loading ? "✨ Transforming your space…" : "✨ Transform Atmosphere"}
            </button>

            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 4 }}>
                AI powered · ~30 seconds
            </div>
        </div>
    );
}
