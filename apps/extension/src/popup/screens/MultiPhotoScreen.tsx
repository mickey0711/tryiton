import React, { useState, useCallback } from "react";

interface Props {
    onBack: () => void;
    currentPhotos: string[];
    onSavePhotos: (photos: string[]) => void;
}

const MAX_PHOTOS = 5;

export function MultiPhotoScreen({ onBack, currentPhotos, onSavePhotos }: Props) {
    const [photos, setPhotos]   = useState<string[]>(currentPhotos);
    const [toast, setToast]     = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

    const handleAdd = useCallback(() => {
        if (photos.length >= MAX_PHOTOS) {
            showToast(`Maximum ${MAX_PHOTOS} photos`);
            return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) { showToast("File too large (max 8MB)"); return; }
            const reader = new FileReader();
            reader.onload = () => {
                const b64 = reader.result as string;
                setPhotos(prev => [...prev, b64]);
                showToast("📸 Photo added");
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }, [photos.length]);

    const handleRemove = (idx: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = () => {
        onSavePhotos(photos);
        showToast("✅ Profile photos saved!");
    };

    return (
        <div className="screen" style={{ position: "relative" }}>
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
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>📸 Multi-Photo Profile</span>
            </div>

            {/* Info */}
            <div style={{
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#a5b4fc",
                lineHeight: 1.5, textAlign: "center",
            }}>
                Upload up to <strong style={{ color: "#c4b5fd" }}>5 photos</strong> for a more accurate body model.
                Different angles help the AI generate better try-on results.
            </div>

            {/* Photo grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {photos.map((photo, idx) => (
                    <div key={idx} style={{
                        position: "relative", borderRadius: 10, overflow: "hidden",
                        aspectRatio: "3/4", background: "var(--surface-2)",
                        border: idx === 0 ? "2px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.06)",
                    }}>
                        <img src={photo} alt={`Photo ${idx + 1}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        {idx === 0 && (
                            <div style={{
                                position: "absolute", top: 4, left: 4,
                                background: "rgba(124,58,237,0.85)", borderRadius: 4,
                                padding: "1px 5px", fontSize: 8, fontWeight: 700, color: "white",
                            }}>
                                PRIMARY
                            </div>
                        )}
                        <button
                            onClick={() => handleRemove(idx)}
                            style={{
                                position: "absolute", top: 4, right: 4,
                                width: 20, height: 20, borderRadius: "50%",
                                background: "rgba(248,113,113,0.85)", border: "none",
                                color: "white", fontSize: 11, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                        >✕</button>
                    </div>
                ))}

                {/* Add button */}
                {photos.length < MAX_PHOTOS && (
                    <button
                        onClick={handleAdd}
                        style={{
                            borderRadius: 10, aspectRatio: "3/4",
                            background: "var(--surface-2)",
                            border: "2px dashed rgba(255,255,255,0.1)",
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            gap: 4, cursor: "pointer", color: "var(--text-muted)",
                        }}
                    >
                        <span style={{ fontSize: 24 }}>+</span>
                        <span style={{ fontSize: 9, fontWeight: 600 }}>Add Photo</span>
                    </button>
                )}
            </div>

            {/* Tips */}
            <div style={{
                background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "var(--text-muted)",
                lineHeight: 1.6,
            }}>
                <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>📋 Tips for best results:</div>
                <div>• Stand upright, arms slightly away from body</div>
                <div>• Good lighting, minimal background clutter</div>
                <div>• Front, side, and back angles work best</div>
                <div>• Tight-fitting clothes show body shape better</div>
            </div>

            {/* Counter + Save */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {photos.length}/{MAX_PHOTOS} photos
                </span>
                <div style={{
                    height: 4, flex: 1, margin: "0 12px", background: "var(--surface-3)", borderRadius: 2,
                    overflow: "hidden",
                }}>
                    <div style={{
                        width: `${(photos.length / MAX_PHOTOS) * 100}%`,
                        height: "100%", background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
                        borderRadius: 2, transition: "width 0.3s",
                    }} />
                </div>
            </div>

            <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={photos.length === 0}
                style={{ opacity: photos.length === 0 ? 0.5 : 1 }}
            >
                ✅ Save {photos.length} Photo{photos.length !== 1 ? "s" : ""}
            </button>
        </div>
    );
}
