import React, { useRef, useState } from "react";

const CATEGORY_LABELS: Record<string, { icon: string; label: string; hint: string }> = {
    furniture:   { icon: "🛋️", label: "Furniture",   hint: "Upload a photo of your living room, bedroom, or office" },
    electronics: { icon: "📺", label: "Electronics", hint: "Upload a photo of the room where you'll place it" },
    lighting:    { icon: "💡", label: "Lighting",    hint: "Upload a photo of the room to preview the light effect" },
    plants:      { icon: "🌱", label: "Plants",      hint: "Upload a photo of your space — AI will check sunlight suitability" },
    garden:      { icon: "🌿", label: "Garden",      hint: "Upload a photo of your garden, balcony, or patio" },
    kitchen:     { icon: "🍳", label: "Kitchen",     hint: "Upload a photo of your kitchen or counter space" },
    beauty:      { icon: "💄", label: "Beauty",      hint: "Upload a selfie for beauty try-on" },
};

interface Props {
    category: string;
    productSrc: string | null;
    onAnalyze: (roomImageB64: string) => void;
    onBack: () => void;
}

export function SpaceUploadScreen({ category, productSrc, onAnalyze, onBack }: Props) {
    const [preview, setPreview] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const meta = CATEGORY_LABELS[category] ?? { icon: "📷", label: category, hint: "Upload a photo of your space" };

    const handleFile = (file: File) => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    return (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", fontFamily: "Inter, sans-serif" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button onClick={onBack}
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: "12px" }}>
                    ← Back
                </button>
                <span style={{ fontSize: "18px" }}>{meta.icon}</span>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{meta.label} Try-On</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Space Intelligence</div>
                </div>
            </div>

            {/* Product preview */}
            {productSrc && (
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <img src={productSrc} alt="product" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, background: "#fff" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Ready to place in your space
                    </div>
                </div>
            )}

            {/* Upload zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                    border: `2px dashed ${dragging ? "rgba(124,58,237,0.8)" : preview ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.15)"}`,
                    borderRadius: "14px",
                    padding: "20px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: dragging ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.02)",
                    transition: "all 0.2s",
                    position: "relative",
                    overflow: "hidden",
                    minHeight: 160,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {preview ? (
                    <>
                        <img src={preview} alt="room" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: "10px" }} />
                        <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(74,222,128,0.9)", borderRadius: "8px", padding: "3px 8px", fontSize: "11px", fontWeight: 700, color: "#000" }}>✓ Ready</div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: 4 }}>Upload Space Photo</div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", maxWidth: 220, lineHeight: 1.5 }}>{meta.hint}</div>
                        <div style={{ marginTop: 12, fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>Drag & drop or click to browse</div>
                    </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {/* Camera option */}
            <button
                onClick={() => {
                    if (fileRef.current) {
                        fileRef.current.capture = "environment";
                        fileRef.current.click();
                    }
                }}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", padding: "8px", fontSize: "12px", cursor: "pointer" }}
            >
                📸 Take Photo with Camera
            </button>

            {/* AI info */}
            <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "10px", padding: "10px 12px", fontSize: "11px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                🤖 <strong style={{ color: "rgba(255,255,255,0.7)" }}>AI will:</strong> place the product in your space, analyse dimensions and style, and tell you if it's the right fit.
            </div>

            {/* CTA */}
            <button
                disabled={!preview}
                onClick={() => preview && onAnalyze(preview)}
                style={{
                    padding: "12px",
                    background: preview ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "rgba(255,255,255,0.06)",
                    border: "none",
                    borderRadius: "12px",
                    color: preview ? "#fff" : "rgba(255,255,255,0.3)",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: preview ? "pointer" : "not-allowed",
                    transition: "all 0.2s",
                    fontFamily: "Inter, sans-serif",
                }}
            >
                {preview ? `Analyse with AI →` : "Upload a photo first"}
            </button>
        </div>
    );
}
