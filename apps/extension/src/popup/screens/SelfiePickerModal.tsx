/**
 * SelfiePickerModal
 *
 * Shown just before a try-on when the user has multiple saved selfies.
 * They pick which one to use, upload a new one, or take a selfie right now.
 */
import React, { useRef, useState } from "react";

interface Props {
    selfies: string[];            // base64 array
    category: string;             // what they're trying on (display only)
    onPick: (b64: string) => void;// picked → start generate
    onUploadNew: (b64: string) => void; // uploaded & selected
    onCancel: () => void;
}

export function SelfiePickerModal({ selfies, category, onPick, onUploadNew, onCancel }: Props) {
    const [camera, setCamera]   = useState(false);
    const [stream, setStream]   = useState<MediaStream | null>(null);
    const videoRef              = useRef<HTMLVideoElement>(null);
    const canvasRef             = useRef<HTMLCanvasElement>(null);
    const [toast, setToast]     = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

    // ── File upload ─────────────────────────────────────────────────────────────
    const handleUpload = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) { showToast("File too large (max 10 MB)"); return; }
            const reader = new FileReader();
            reader.onload = () => onUploadNew(reader.result as string);
            reader.readAsDataURL(file);
        };
        input.click();
    };

    // ── Camera ──────────────────────────────────────────────────────────────────
    const openCamera = async () => {
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

    const snap = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;
        c.width = v.videoWidth || 480;
        c.height = v.videoHeight || 480;
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        const b64 = c.toDataURL("image/jpeg", 0.9);
        closeCamera();
        onUploadNew(b64);
    };

    // ── Camera overlay ─────────────────────────────────────────────────────────
    if (camera) {
        return (
            <div style={OVERLAY}>
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <div style={SHEET}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>📷 Take a Selfie</span>
                        <button onClick={closeCamera} style={CLOSE_BTN}>✕</button>
                    </div>
                    <div style={{ borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "1/1" }}>
                        <video ref={videoRef} autoPlay playsInline muted
                            style={{ width: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                    </div>
                    <button style={PRIMARY_BTN} onClick={snap}>📸 Snap!</button>
                </div>
            </div>
        );
    }

    // ── Picker UI ───────────────────────────────────────────────────────────────
    return (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
            {toast && (
                <div style={{
                    position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
                    background: "rgba(20,20,35,0.97)", border: "1px solid rgba(165,180,252,0.4)",
                    borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600,
                    color: "#e2e8f0", zIndex: 1001, whiteSpace: "nowrap",
                }}>
                    {toast}
                </div>
            )}
            <div style={SHEET}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
                            🤳 Which photo to try on?
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            Trying: <strong style={{ color: "#a78bfa" }}>{category}</strong>
                        </div>
                    </div>
                    <button onClick={onCancel} style={CLOSE_BTN}>✕</button>
                </div>

                {/* Selfie grid */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: selfies.length === 1 ? "1fr" : "repeat(3, 1fr)",
                    gap: 7, marginBottom: 10,
                }}>
                    {selfies.map((photo, idx) => (
                        <div
                            key={idx}
                            onClick={() => onPick(photo)}
                            style={{
                                position: "relative", borderRadius: 10, overflow: "hidden",
                                aspectRatio: "3/4", background: "var(--surface-2)",
                                border: idx === 0
                                    ? "2px solid rgba(124,58,237,0.6)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLDivElement).style.transform = "scale(1.03)";
                                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 16px rgba(124,58,237,0.4)";
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
                                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                            }}
                        >
                            <img src={photo} alt={`Photo ${idx + 1}`}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }} />

                            {idx === 0 && (
                                <div style={{
                                    position: "absolute", top: 4, left: 4,
                                    background: "rgba(124,58,237,0.9)", borderRadius: 4,
                                    padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "white",
                                }}>
                                    ⭐ Primary
                                </div>
                            )}

                            {/* "Use this" overlay on hover */}
                            <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0,
                                background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                                padding: "12px 4px 5px",
                                display: "flex", justifyContent: "center",
                            }}>
                                <div style={{
                                    background: "rgba(124,58,237,0.9)", borderRadius: 5,
                                    padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "white",
                                }}>
                                    Use this
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                        onClick={handleUpload}
                        style={{
                            borderRadius: 10, padding: "11px 8px",
                            background: "var(--surface-2)",
                            border: "1.5px dashed rgba(255,255,255,0.15)",
                            color: "var(--text-muted)", cursor: "pointer",
                            fontSize: 11, fontWeight: 600,
                            display: "flex", flexDirection: "column",
                            alignItems: "center", gap: 4,
                        }}
                    >
                        <span style={{ fontSize: 18 }}>📁</span>
                        Upload new
                    </button>
                    <button
                        onClick={openCamera}
                        style={{
                            borderRadius: 10, padding: "11px 8px",
                            background: "rgba(124,58,237,0.12)",
                            border: "1.5px solid rgba(124,58,237,0.35)",
                            color: "#a78bfa", cursor: "pointer",
                            fontSize: 11, fontWeight: 600,
                            display: "flex", flexDirection: "column",
                            alignItems: "center", gap: 4,
                        }}
                    >
                        <span style={{ fontSize: 18 }}>📷</span>
                        Take selfie
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const OVERLAY: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-end",
    backdropFilter: "blur(4px)",
};

const SHEET: React.CSSProperties = {
    width: "100%", background: "var(--surface-1, #13131e)",
    borderRadius: "16px 16px 0 0",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "16px 14px 20px",
    display: "flex", flexDirection: "column", gap: 8,
    maxHeight: "88vh", overflowY: "auto",
};

const CLOSE_BTN: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)", border: "none",
    color: "var(--text-muted)", cursor: "pointer",
    borderRadius: 8, width: 28, height: 28,
    fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
};

const PRIMARY_BTN: React.CSSProperties = {
    width: "100%", padding: "13px",
    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
    border: "none", borderRadius: 12,
    color: "white", fontSize: 14, fontWeight: 700,
    cursor: "pointer", marginTop: 8,
};
