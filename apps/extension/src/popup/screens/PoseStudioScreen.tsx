import React, { useState } from "react";

interface Pose {
    id: string;
    label: string;
    emoji: string;
    desc: string;
    tip: string;
}

interface Props {
    onBack: () => void;
    onSelectPose: (poseId: string) => void;
    currentPose: string | null;
}

const POSES: Pose[] = [
    { id: "standing",  label: "Standing",  emoji: "🧍", desc: "Natural upright pose",     tip: "Best for full-outfit shots" },
    { id: "walking",   label: "Walking",   emoji: "🚶", desc: "Dynamic walking stance",   tip: "Great for casual & streetwear" },
    { id: "runway",    label: "Runway",    emoji: "💃", desc: "Fashion show stride",       tip: "Show off high fashion looks" },
    { id: "sitting",   label: "Sitting",   emoji: "🪑", desc: "Seated, relaxed pose",     tip: "Perfect for pants & dresses" },
    { id: "selfie",    label: "Selfie",    emoji: "🤳", desc: "Close-up selfie angle",    tip: "Highlights tops & accessories" },
    { id: "active",    label: "Active",    emoji: "🏃", desc: "Athletic motion pose",     tip: "Ideal for sportswear" },
];

export function PoseStudioScreen({ onBack, onSelectPose, currentPose }: Props) {
    const [selected, setSelected]   = useState<string>(currentPose ?? "standing");
    const [applying, setApplying]   = useState(false);

    const handleApply = async () => {
        setApplying(true);
        await new Promise(r => setTimeout(r, 500));
        onSelectPose(selected);
        setApplying(false);
    };

    const pose = POSES.find(p => p.id === selected);

    return (
        <div className="screen">
            {/* Header */}
            <div className="header">
                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onBack}>← Back</button>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>💃 Pose Studio</span>
            </div>

            {/* Info */}
            <div style={{
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#a5b4fc",
                lineHeight: 1.5, textAlign: "center",
            }}>
                Select a pose <strong style={{ color: "#c4b5fd" }}>before trying on</strong> your next item.
                The AI will place the garment matching your chosen stance.
            </div>

            {/* Selected pose preview */}
            <div style={{
                background: "var(--surface-2)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 12, padding: "16px", textAlign: "center",
            }}>
                <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8 }}>{pose?.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{pose?.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{pose?.desc}</div>
                <div style={{
                    marginTop: 8, display: "inline-block", fontSize: 10, fontWeight: 600,
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 6, padding: "3px 8px", color: "#a5b4fc",
                }}>
                    💡 {pose?.tip}
                </div>
            </div>

            {/* Pose grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {POSES.map(p => (
                    <button
                        key={p.id}
                        onClick={() => setSelected(p.id)}
                        style={{
                            display: "flex", flexDirection: "column", alignItems: "center",
                            gap: 4, padding: "12px 6px",
                            borderRadius: 12, border: selected === p.id
                                ? "2px solid rgba(124,58,237,0.6)"
                                : "1px solid rgba(255,255,255,0.07)",
                            background: selected === p.id
                                ? "rgba(124,58,237,0.18)"
                                : "var(--surface-3)",
                            cursor: "pointer",
                            boxShadow: selected === p.id ? "0 0 0 1.5px rgba(124,58,237,0.2)" : "none",
                            transition: "all 0.18s",
                        }}
                    >
                        <span style={{ fontSize: 28, lineHeight: 1 }}>{p.emoji}</span>
                        <span style={{
                            fontSize: 10, fontWeight: 600,
                            color: selected === p.id ? "#c4b5fd" : "var(--text-muted)",
                        }}>
                            {p.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Apply */}
            <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={applying}
                style={{ opacity: applying ? 0.7 : 1 }}
            >
                {applying ? "Saving pose…" : `✅ Use ${pose?.label} Pose`}
            </button>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
                Pose applies to your next try-on. You can change it anytime.
            </p>
        </div>
    );
}
