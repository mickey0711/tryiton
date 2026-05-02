import React, { useState, useRef, useCallback } from "react";

interface Props {
    selfies: string[];           // base64 array, [0] = primary
    onBack: () => void;
    onSave: (selfies: string[]) => void;
}

const MAX_SELFIES = 10;

export function MyPhotosScreen({ selfies: initial, onBack, onSave }: Props) {
    const [photos, setPhotos]       = useState<string[]>(initial);
    const [toast, setToast]         = useState<string | null>(null);
    const [camera, setCamera]       = useState(false);
    const [stream, setStream]       = useState<MediaStream | null>(null);
    const videoRef                  = useRef<HTMLVideoElement>(null);
    const canvasRef                 = useRef<HTMLCanvasElement>(null);

    const showToast = (msg: string, ms = 3000) => {
        setToast(msg);
        setTimeout(() => setToast(null), ms);
    };

    // ── Upload from file ────────────────────────────────────────────────────────
    const handleUpload = useCallback(() => {
        if (photos.length >= MAX_SELFIES) { showToast(`Maximum ${MAX_SELFIES} photos`); return; }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) { showToast("File too large (max 10 MB)"); return; }
            const reader = new FileReader();
            reader.onload = () => {
                const b64 = reader.result as string;
                setPhotos(prev => {
                    const next = [...prev, b64];
                    onSave(next);
                    return next;
                });
                showToast("📸 Photo added!");
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }, [photos.length, onSave]);

    // ── Camera ──────────────────────────────────────────────────────────────────
    const openCamera = async () => {
        if (photos.length >= MAX_SELFIES) { showToast(`Maximum ${MAX_SELFIES} photos`); return; }
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
            });
            setStream(s);
            setCamera(true);
            setTimeout(() => {
                if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
            }, 100);
        } catch {
            showToast("❌ Camera not available");
        }
    };

    const closeCamera = () => {
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);
        setCamera(false);
    };

    const snapPhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;
        c.width = v.videoWidth || 480;
        c.height = v.videoHeight || 480;
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        const b64 = c.toDataURL("image/jpeg", 0.9);
        closeCamera();
        setPhotos(prev => {
            const next = [...prev, b64];
            onSave(next);
            return next;
        });
        showToast("📸 Selfie saved!");
    };

    // ── Delete ──────────────────────────────────────────────────────────────────
    const handleDelete = (idx: number) => {
        setPhotos(prev => {
            const next = prev.filter((_, i) => i !== idx);
            onSave(next);
            return next;
        });
        showToast("🗑 Removed");
    };

    // ── Set as primary (move to index 0) ─────────────────────────────────────
    const setPrimary = (idx: number) => {
        if (idx === 0) return;
        setPhotos(prev => {
            const next = [prev[idx], ...prev.filter((_, i) => i !== idx)];
            onSave(next);
            return next;
        });
        showToast("⭐ Set as primary photo");
    };

    // ── Camera UI ───────────────────────────────────────────────────────────────
    if (camera) {
        return (
            <div className="screen" style={{ position: "relative" }}>
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <div className="header">
                    <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={closeCamera}>✕ Cancel</button>
                    <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>📷 Take Selfie</span>
                </div>
                <div style={{ borderRadius: 14, overflow: "hidden", background: "#000", aspectRatio: "1/1" }}>
                    <video ref={videoRef} autoPlay playsInline muted
                        style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                    Stand upright · Good lighting · Arms slightly out
                </div>
                <button className="btn btn-primary" style={{ fontSize: 15, padding: "14px" }} onClick={snapPhoto}>
                    📸 Snap!
                </button>
            </div>
        );
    }

    // ── Main gallery UI ─────────────────────────────────────────────────────────
    return (
        <div className="screen" style={{ position: "relative" }}>
            {toast && (
                <div style={{
                    position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
                    background: "rgba(20,20,35,0.97)", border: "1px solid rgba(165,180,252,0.4)",
                    borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600,
                    color: "#e2e8f0", zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="header">
                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onBack}>← Back</button>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>
                    📸 My Selfies
                </span>
                <span style={{
                    marginLeft: 8, fontSize: 11, fontWeight: 600,
                    background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.4)",
                    borderRadius: 20, padding: "2px 8px", color: "#c4b5fd",
                }}>
                    {photos.length}/{MAX_SELFIES}
                </span>
            </div>

            {/* Info banner */}
            <div style={{
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 10, padding: "10px 14px", fontSize: 11, color: "#a5b4fc",
                lineHeight: 1.6,
            }}>
                Save up to <strong style={{ color: "#c4b5fd" }}>10 selfies</strong>. When you try on any product, pick
                from your gallery — no need to upload every time. ⭐ = primary photo used by default.
            </div>

            {/* Photo grid */}
            {photos.length === 0 ? (
                <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 12, padding: "32px 0", color: "var(--text-muted)",
                }}>
                    <span style={{ fontSize: 48 }}>🤳</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>No selfies yet</span>
                    <span style={{ fontSize: 11, textAlign: "center", maxWidth: 220 }}>
                        Upload a photo or take a selfie to get started.
                        You'll be able to pick from these when trying on clothes.
                    </span>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {photos.map((photo, idx) => (
                        <div key={idx} style={{
                            position: "relative", borderRadius: 12, overflow: "hidden",
                            aspectRatio: "3/4", background: "var(--surface-2)",
                            border: idx === 0
                                ? "2px solid rgba(124,58,237,0.7)"
                                : "1px solid rgba(255,255,255,0.06)",
                            boxShadow: idx === 0 ? "0 0 12px rgba(124,58,237,0.3)" : "none",
                        }}>
                            <img src={photo} alt={`Selfie ${idx + 1}`}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }} />

                            {/* Primary badge */}
                            {idx === 0 && (
                                <div style={{
                                    position: "absolute", top: 4, left: 4,
                                    background: "rgba(124,58,237,0.9)", borderRadius: 5,
                                    padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "white",
                                    letterSpacing: 0.5,
                                }}>
                                    ⭐ PRIMARY
                                </div>
                            )}

                            {/* Action buttons overlay */}
                            <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0,
                                background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                                padding: "16px 4px 4px",
                                display: "flex", gap: 4, justifyContent: "center",
                            }}>
                                {idx !== 0 && (
                                    <button
                                        onClick={() => setPrimary(idx)}
                                        title="Set as primary"
                                        style={{
                                            flex: 1, height: 22, borderRadius: 5,
                                            background: "rgba(124,58,237,0.8)", border: "none",
                                            color: "white", fontSize: 9, fontWeight: 700, cursor: "pointer",
                                        }}
                                    >⭐ Primary</button>
                                )}
                                <button
                                    onClick={() => handleDelete(idx)}
                                    title="Delete"
                                    style={{
                                        width: 22, height: 22, borderRadius: 5,
                                        background: "rgba(239,68,68,0.8)", border: "none",
                                        color: "white", fontSize: 11, cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                    }}
                                >🗑</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add buttons */}
            {photos.length < MAX_SELFIES && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                        onClick={handleUpload}
                        style={{
                            borderRadius: 12, padding: "14px 8px",
                            background: "var(--surface-2)",
                            border: "2px dashed rgba(124,58,237,0.35)",
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            gap: 6, cursor: "pointer", color: "#a78bfa",
                        }}
                    >
                        <span style={{ fontSize: 22 }}>📁</span>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Upload Photo</span>
                    </button>
                    <button
                        onClick={openCamera}
                        style={{
                            borderRadius: 12, padding: "14px 8px",
                            background: "rgba(124,58,237,0.12)",
                            border: "2px solid rgba(124,58,237,0.35)",
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            gap: 6, cursor: "pointer", color: "#c4b5fd",
                        }}
                    >
                        <span style={{ fontSize: 22 }}>📷</span>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Take Selfie</span>
                    </button>
                </div>
            )}

            {/* Tips */}
            <div style={{
                background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "var(--text-muted)",
                lineHeight: 1.7,
            }}>
                <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>📋 Tips for best results:</div>
                <div>• Stand upright, arms slightly away from body</div>
                <div>• Bright, even lighting — avoid strong shadows</div>
                <div>• Wear tight-fitting clothes so the AI sees your body shape</div>
                <div>• Try different angles (front, ¾) for variety</div>
            </div>
        </div>
    );
}
