import React from "react";

const TIPS = [
    "Analyzing your photo...",
    "Detecting body proportions...",
    "Extracting product details...",
    "Applying the look to you...",
    "Perfecting the details...",
    "Almost there...",
];

interface Props { progress: number; }

export function LoadingScreen({ progress }: Props) {
    const tipIndex = Math.min(Math.floor(progress / 18), TIPS.length - 1);
    return (
        <div className="screen" style={{ alignItems: "center", justifyContent: "center", gap: 24 }}>
            <div className="spinner" />
            <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Generating your try-on...</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{TIPS[tipIndex]}</p>
            </div>
            <div style={{ width: "100%" }}>
                <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>{progress}%</p>
            </div>
        </div>
    );
}
