import React, { useState, useRef, useCallback, useEffect } from "react";
import type { JobResult } from "../index";

interface Props {
    result: JobResult;
    onRegenerate: () => void;
    onBack: () => void;
    onSceneVibe: () => void;
    onPriceCompare: () => void;
    onSocialShare: () => void;
    onViewWishlist: () => void;
    onAIChat: () => void;
}

function scoreColor(score: number): string {
    if (score >= 80) return "#4ade80";
    if (score >= 60) return "#fbbf24";
    return "#f87171";
}

function scoreLabel(score: number): string {
    if (score >= 85) return "Excellent fit";
    if (score >= 75) return "Good fit";
    if (score >= 60) return "Decent fit";
    return "May not fit well";
}

// ── Zoomable Image ─────────────────────────────────────────────────────────────

function ZoomableImage({ src, alt }: { src: string; alt: string }) {
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);   // 0 / 90 / 180 / 270
    const [dragging, setDragging] = useState(false);
    const [imgError, setImgError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
    const scaleRef = useRef(1);
    const translateRef = useRef({ x: 0, y: 0 });

    const reset = () => {
        setScale(1); setTranslate({ x: 0, y: 0 }); setRotation(0);
        scaleRef.current = 1; translateRef.current = { x: 0, y: 0 };
    };

    // Native wheel with passive:false so preventDefault works
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const next = Math.min(5, Math.max(1, scaleRef.current - e.deltaY * 0.003));
            scaleRef.current = next;
            setScale(next);
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (scaleRef.current <= 1) return;
        setDragging(true);
        dragStart.current = { mx: e.clientX, my: e.clientY, tx: translateRef.current.x, ty: translateRef.current.y };
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging || !dragStart.current) return;
        const next = {
            x: dragStart.current.tx + (e.clientX - dragStart.current.mx),
            y: dragStart.current.ty + (e.clientY - dragStart.current.my),
        };
        translateRef.current = next;
        setTranslate(next);
    }, [dragging]);

    const onMouseUp = useCallback(() => { setDragging(false); dragStart.current = null; }, []);

    const rotateLeft  = () => setRotation(r => (r - 90 + 360) % 360);
    const rotateRight = () => setRotation(r => (r + 90) % 360);
    const isLandscape = rotation === 90 || rotation === 270;

    if (imgError) {
        return (
            <div className="product-preview-placeholder" style={{ height: 220 }}>
                <span style={{ fontSize: 36 }}>🎨</span>
                <span style={{ fontSize: 12, textAlign: "center", padding: "0 16px" }}>Image couldn't load</span>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Image area */}
            <div
                ref={containerRef}
                style={{
                    width: "100%", height: 380,
                    overflow: "hidden", borderRadius: 12,
                    background: "linear-gradient(135deg, #0a0a12, #0f0f1e)",
                    position: "relative", userSelect: "none",
                    cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
                    border: "1px solid rgba(99,102,241,0.2)",
                    boxShadow: "inset 0 0 24px rgba(99,102,241,0.05)",
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onDoubleClick={reset}
            >
                <img
                    src={src}
                    alt={alt}
                    onError={() => setImgError(true)}
                    style={{
                        width: "100%", height: "100%",
                        objectFit: "contain",      // ALWAYS contain — never crop the result
                        display: "block",
                        transform: `scale(${scale}) rotate(${rotation}deg) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
                        transformOrigin: "center center",
                        transition: dragging ? "none" : "transform 0.2s ease",
                    }}
                    draggable={false}
                />
                {/* Zoom level badge */}
                {scale > 1 && (
                    <div style={{
                        position: "absolute", top: 8, right: 8,
                        background: "rgba(0,0,0,0.55)", borderRadius: 6,
                        fontSize: 11, color: "#c4b5fd", padding: "2px 6px",
                        pointerEvents: "none",
                    }}>
                        {scale.toFixed(1)}×
                    </div>
                )}
            </div>

            {/* Controls toolbar */}
            <div style={{ display: "flex", gap: 5, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                {/* Rotate left */}
                <button onClick={rotateLeft} title="Rotate left" style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 8, color: "#a5b4fc", fontSize: 15, width: 34, height: 30,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>↺</button>

                {/* Zoom out */}
                <button onClick={() => setScale(s => { const n = Math.max(1, +(s - 0.5).toFixed(1)); scaleRef.current = n; return n; })} title="Zoom out" style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 8, color: "#a5b4fc", fontSize: 16, width: 34, height: 30,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>−</button>

                {/* Center label */}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", minWidth: 40, textAlign: "center" }}>
                    {rotation % 360 !== 0 ? `${rotation}°` : `${scale.toFixed(1)}×`}
                </span>

                {/* Zoom in */}
                <button onClick={() => setScale(s => { const n = Math.min(5, +(s + 0.5).toFixed(1)); scaleRef.current = n; return n; })} title="Zoom in" style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 8, color: "#a5b4fc", fontSize: 16, width: 34, height: 30,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>+</button>

                {/* Rotate right */}
                <button onClick={rotateRight} title="Rotate right" style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 8, color: "#a5b4fc", fontSize: 15, width: 34, height: 30,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>↻</button>

                {/* Reset */}
                <button onClick={reset} title="Reset" style={{
                    background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                    borderRadius: 8, color: "#8888aa", fontSize: 11, padding: "0 8px", height: 30,
                    cursor: "pointer",
                }}>Reset</button>
            </div>
        </div>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ResultScreen({ result, onRegenerate, onBack, onSceneVibe, onPriceCompare, onSocialShare, onViewWishlist, onAIChat }: Props) {
    const [showBefore, setShowBefore] = useState(false);
    const [saved, setSaved] = useState(false);
    const [addedToOutfit, setAddedToOutfit] = useState(false);
    const [outfitCount, setOutfitCount]   = useState(0);
    const [toast, setToast] = useState<string | null>(null);

    // Load current outfit count on mount
    useEffect(() => {
        chrome.storage.local.get(["outfitSession"], (data: any) => {
            setOutfitCount((data.outfitSession ?? []).length);
        });
    }, []);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

    const handleDownload = () => {
        if (!result.resultUrl) return;
        const a = document.createElement("a");
        a.href = result.resultUrl;
        a.download = "tryiton-result.jpg";
        a.click();
        showToast("⬇ Downloading…");
    };

    const handleShare = async () => {
        const url = result.resultUrl;
        if (!url) { showToast("❌ No result to share yet"); return; }

        // Try native Web Share API (works on mobile / supported desktops)
        if (navigator.share) {
            try {
                // Fetch image as blob for image sharing
                const resp = await fetch(url);
                const blob = await resp.blob();
                const file = new File([blob], "tryiton-look.jpg", { type: "image/jpeg" });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: "Look what I'd look like in this!",
                        text: "Tried on this outfit with TryItOn AI ✨",
                    });
                } else {
                    await navigator.share({
                        url,
                        title: "My TryItOn AI Look ✨",
                        text: "See how I'd look in this! Powered by TryItOn AI",
                    });
                }
                showToast("🎉 Shared!");
                return;
            } catch (e: any) {
                if (e?.name === "AbortError") { showToast("Share cancelled"); return; }
                // Fall through to clipboard
            }
        }

        // Fallback: copy image URL to clipboard
        try {
            await navigator.clipboard.writeText(url);
            showToast("🔗 Image URL copied — paste anywhere to share!");
        } catch {
            showToast("❌ Couldn't share. Try downloading the image.");
        }
    };

    const handleSave = async () => {
        setSaved(true);
        showToast("⭐ Saved to My Looks!");
        chrome.storage.local.get(["savedItems"], (data: any) => {
            const items = data.savedItems ?? [];
            items.unshift({ jobId: result.jobId, resultUrl: result.resultUrl, productSrc: result.productSrc, fitScore: result.fitScore, savedAt: Date.now() });
            chrome.storage.local.set({ savedItems: items.slice(0, 50) });
        });
        const token = await getToken();
        if (token && !result.jobId.startsWith("mock-")) {
            try {
                await fetch("https://tryiton-app-f32z6.ondigitalocean.app/library/saved", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ job_id: result.jobId, snapshot: { result_url: result.resultUrl, product_image: result.productSrc, fit_score: result.fitScore } }),
                });
            } catch { /* non-critical */ }
        }
    };

    const handleAddToOutfit = () => {
        chrome.storage.local.get(["outfitSession"], (data: any) => {
            const session = data.outfitSession ?? [];
            session.push({
                resultUrl: result.resultUrl,
                productSrc: result.productSrc,
                fitScore: result.fitScore,
                addedAt: Date.now(),
            });
            chrome.storage.local.set({ outfitSession: session });
            setAddedToOutfit(true);
            setOutfitCount(session.length);
            showToast(`🎨 Added! ${session.length} item${session.length > 1 ? "s" : ""} in your outfit — keep shopping!`);
        });
    };

    const handleViewOutfit = () => {
        // Store a flag so the popup opens on the Outfit screen
        chrome.storage.local.set({ openScreen: "outfit" });
        // Open popup
        try { chrome.runtime.sendMessage({ type: "OPEN_OUTFIT" }); } catch {}
    };

    const displayUrl = showBefore ? result.productSrc : result.resultUrl;
    const color = result.fitScore != null ? scoreColor(result.fitScore) : "#a5b4fc";

    return (
        <div className="screen" style={{ position: "relative" }}>
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

            <div className="header">
                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onBack}>← Back</button>
                <span className="logo" style={{ marginLeft: "auto" }}>TryItOn ✨</span>
            </div>

            {displayUrl ? (
                <ZoomableImage key={displayUrl} src={displayUrl} alt={showBefore ? "Original product" : "Your try-on"} />
            ) : (
                <div className="product-preview-placeholder" style={{ height: 220 }}>
                    <span style={{ fontSize: 36 }}>🎨</span>
                    <span>No result image available</span>
                </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, padding: "8px 12px", background: !showBefore ? "rgba(99,102,241,0.2)" : "var(--surface-3)", color: !showBefore ? "#a5b4fc" : "var(--text-muted)" }} onClick={() => setShowBefore(false)}>✨ Try-On</button>
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, padding: "8px 12px", background: showBefore ? "rgba(99,102,241,0.2)" : "var(--surface-3)", color: showBefore ? "#a5b4fc" : "var(--text-muted)" }} onClick={() => setShowBefore(true)}>📦 Original</button>
            </div>

            {result.fitScore != null && (
                <div className="card" style={{ gap: 10, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Fit Score</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 12, padding: "2px 8px" }}>{scoreLabel(result.fitScore)}</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color }}>{result.fitScore}%</span>
                        </div>
                    </div>
                    <div className="fit-score-bar">
                        <div className="fit-score-fill" style={{ width: `${result.fitScore}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                        {result.explanation.map((e, i) => (
                            <span key={i} style={{ fontSize: 11, color: "#c4b5fd", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 10, padding: "2px 8px" }}>{e}</span>
                        ))}
                    </div>
                </div>
            )}

            <div className="action-row">
                <button className="btn btn-secondary" onClick={handleDownload}>⬇</button>
                <button className="btn btn-secondary" onClick={handleShare}>🔗 Share</button>
                <button className="btn btn-secondary" style={{ background: saved ? "rgba(34,197,94,0.2)" : undefined, color: saved ? "#4ade80" : undefined, border: saved ? "1px solid rgba(74,222,128,0.4)" : undefined, flex: 1 }} onClick={handleSave} disabled={saved}>
                    {saved ? "✅ Saved" : "⭐ Save"}
                </button>
            </div>

            {/* ── Complete the Look CTA ────────────────────────────────── */}
            <div style={{ display: "flex", gap: 8 }}>
                <button
                    className="btn btn-secondary"
                    style={{
                        flex: 1, fontSize: 12,
                        background: addedToOutfit ? "rgba(167,139,250,0.2)" : "rgba(99,102,241,0.1)",
                        border: addedToOutfit ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(99,102,241,0.25)",
                        color: addedToOutfit ? "#c4b5fd" : "#a5b4fc",
                    }}
                    onClick={handleAddToOutfit}
                    disabled={addedToOutfit}
                >
                    {addedToOutfit ? `👗 In Outfit (${outfitCount + 1} items)` : `🎨 Add to Outfit${outfitCount > 0 ? ` (+${outfitCount} saved)` : ""}`}
                </button>
                {outfitCount > 0 && (
                    <button
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: "8px 12px", whiteSpace: "nowrap" }}
                        onClick={handleViewOutfit}
                    >
                        👁 View Look
                    </button>
                )}
            </div>

            <button
                className="btn btn-primary"
                style={{ width: "100%", fontSize: 13, padding: "10px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", marginBottom: 2 }}
                onClick={onAIChat}
            >
                💬 Ask AI Stylist
            </button>

            <button className="btn btn-ghost" onClick={onRegenerate} style={{ fontSize: 12, opacity: 0.7 }}>🔄 Try a different look</button>

            {/* ── Try Another Style — shown only after viewing Original ── */}
            {showBefore && (
                <div style={{
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", marginBottom: 2 }}>
                        ✨ Try Another Style
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
                        Use the original as your base and generate a new variation:
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            className="btn btn-secondary"
                            style={{ flex: 1, fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px" }}
                            onClick={onRegenerate}
                        >
                            <span style={{ fontSize: 18 }}>🎨</span>
                            <span>Color / Style</span>
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ flex: 1, fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px" }}
                            onClick={onSceneVibe}
                        >
                            <span style={{ fontSize: 18 }}>🌅</span>
                            <span>Scene Vibe</span>
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ flex: 1, fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px" }}
                            onClick={() => { /* pose studio from parent */ onSceneVibe(); }}
                        >
                            <span style={{ fontSize: 18 }}>💃</span>
                            <span>Pose</span>
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={onPriceCompare} style={{ flex: 1, fontSize: 11 }}>💸 Find cheaper price</button>
                <button className="btn btn-secondary" onClick={onSocialShare} style={{ flex: 1, fontSize: 11 }}>↗ Share Look</button>
            </div>
            <button className="btn btn-ghost" onClick={onViewWishlist} style={{ fontSize: 11, opacity: 0.65 }}>⭐ View My Wishlist</button>
        </div>
    );
}

async function getToken(): Promise<string | null> {
    return new Promise((res) => chrome.storage.local.get(["accessToken"], (d: any) => res(d.accessToken ?? null)));
}
