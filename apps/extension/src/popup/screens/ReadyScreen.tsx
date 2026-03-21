import React, { useState } from "react";

// ── Category definitions ───────────────────────────────────────────────────────
const CATEGORIES = [
    { value: "tops",        icon: "👕", label: "Top",         live: true,  space: false },
    { value: "pants",       icon: "👖", label: "Pants",       live: true,  space: false },
    { value: "jacket",      icon: "🧥", label: "Jacket",      live: true,  space: false },
    { value: "dress",       icon: "👗", label: "Dress",       live: true,  space: false },
    { value: "shoes",       icon: "👟", label: "Shoes",       live: true,  space: false },
    { value: "glasses",     icon: "🕶", label: "Glasses",     live: true,  space: false },
    { value: "hat",         icon: "🧢", label: "Hat",         live: true,  space: false },
    { value: "watch",       icon: "⌚", label: "Watch",       live: false, space: false },
    { value: "jewelry",     icon: "💍", label: "Jewelry",     live: false, space: false },
    { value: "bag",         icon: "👜", label: "Bag",         live: false, space: false },
    { value: "hair",        icon: "💇", label: "Hair",        live: false, space: false },
    { value: "makeup",      icon: "💄", label: "Makeup",      live: false, space: false },
    { value: "nails",       icon: "💅", label: "Nails",       live: false, space: false },
    // ── Space Intelligence categories ──────────────────────────────
    { value: "furniture",   icon: "🛋️", label: "Furniture",   live: true,  space: true  },
    { value: "electronics", icon: "📺", label: "Electronics", live: true,  space: true  },
    { value: "lighting",    icon: "💡", label: "Lighting",    live: true,  space: true  },
    { value: "plants",      icon: "🌱", label: "Plants",      live: true,  space: true  },
    { value: "garden",      icon: "🌿", label: "Garden",      live: true,  space: true  },
    { value: "kitchen",     icon: "🍳", label: "Kitchen",     live: true,  space: true  },
    { value: "beauty",      icon: "👄", label: "Beauty",      live: false, space: false },
    { value: "other",       icon: "📦", label: "Other",       live: true,  space: false },
] as const;
type CategoryValue = typeof CATEGORIES[number]["value"];

interface Props {
    profileImage: string | null;
    productSrc: string | null;
    error: string | null;
    credits: number;
    initialCategory?: string;
    onGenerate: (category: string) => void;
    onSpaceMode: (category: string) => void;
    onSelectManually: () => void;
    onDeleteProfile: () => void;
    onPoseStudio: () => void;
    onSettings: () => void;
    onMultiPhoto: () => void;
    onSizeAdvisor: () => void;
    currentPose?: string;
}

export function ReadyScreen({
    profileImage, productSrc, error, credits,
    initialCategory = "tops",
    onGenerate, onSpaceMode, onSelectManually, onDeleteProfile, onPoseStudio, onSettings, onMultiPhoto, onSizeAdvisor,
    currentPose = "standing",
}: Props) {
    const validInitial = CATEGORIES.find(c => c.value === initialCategory)?.value ?? "tops";
    const [category, setCategory] = useState<CategoryValue>(validInitial as CategoryValue);

    const catInfo = CATEGORIES.find(c => c.value === category)!;
    const creditColor = credits > 2 ? "#4ade80" : credits > 0 ? "#fbbf24" : "#f87171";

    return (
        <div className="screen">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="header">
                <span className="logo">TryItOn ✨</span>
                <span style={{
                    marginLeft: "auto", marginRight: 6,
                    fontSize: 10, fontWeight: 600,
                    color: creditColor,
                    background: `${creditColor}18`,
                    border: `1px solid ${creditColor}44`,
                    borderRadius: 10, padding: "2px 7px",
                }}>
                    {credits > 0 ? `${credits} left` : "Upgrade"}
                </span>
                {profileImage && (
                    <img src={profileImage} alt="Your profile" className="profile-thumb"
                        onClick={onMultiPhoto} style={{ cursor: "pointer" }} title="Manage photos" />
                )}
                <button
                    onClick={onSettings}
                    style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 16, padding: "2px 4px", marginLeft: 4, opacity: 0.7,
                    }}
                    title="Settings"
                >⚙️</button>
            </div>

            {/* ── Product preview ────────────────────────────────────────── */}
            <div className="card">
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Product detected:</p>
                {productSrc ? (
                    <img src={productSrc} alt="Product" className="product-preview" />
                ) : (
                    <div className="product-preview-placeholder">
                        <span style={{ fontSize: 28 }}>🛍</span>
                        <span>No product detected on this page</span>
                    </div>
                )}
                <button className="btn btn-ghost" style={{ marginTop: 8, width: "100%" }} onClick={onSelectManually}>
                    🔍 Select manually on page
                </button>
            </div>

            {/* ── Category chip picker ───────────────────────────────────── */}
            <div>
                <label className="cat-label">What are you trying on?</label>
                <div className="cat-chips">
                    {CATEGORIES.map(c => (
                        <button
                            key={c.value}
                            className={`cat-chip${category === c.value ? " cat-chip--active" : ""}${!c.live ? " cat-chip--soon" : ""}`}
                            onClick={() => setCategory(c.value as CategoryValue)}
                            title={!c.live ? `${c.label} — coming soon` : c.label}
                        >
                            <span className="cat-chip-icon">{c.icon}</span>
                            <span className="cat-chip-txt">{c.label}</span>
                            {!c.live && <span className="cat-chip-soon">Soon</span>}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {/* ── CTA ────────────────────────────────────────────────────── */}
            <button
                className="btn btn-primary"
                onClick={() => (catInfo as any).space ? onSpaceMode(category) : onGenerate(category)}
                disabled={!productSrc}
                style={(catInfo as any).space ? { background: "linear-gradient(135deg,#10b981,#059669)" } : {}}
            >
                {catInfo.icon} {(catInfo as any).space ? `Place in Space` : `Try on ${catInfo.label}`}
            </button>

            <button
                className="btn btn-ghost"
                style={{ fontSize: 11, opacity: 0.75 }}
                onClick={onPoseStudio}
            >
                💃 Pose: {currentPose.charAt(0).toUpperCase() + currentPose.slice(1)} · Change
            </button>

            <button
                className="btn btn-ghost"
                style={{ fontSize: 11, opacity: 0.8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "8px 12px" }}
                onClick={onSizeAdvisor}
            >
                📐 Find My Size — AI Size Advisor
            </button>

            <div className="divider" />
            <div style={{ display: "flex", justifyContent: "center" }}>
                <button className="btn btn-danger" onClick={onDeleteProfile}>🗑 Remove my photo</button>
            </div>
        </div>
    );
}
