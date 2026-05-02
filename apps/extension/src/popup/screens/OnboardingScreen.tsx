import React, { useRef, useState } from "react";

const API_BASE = "https://tryit4u.ai";

interface Props {
    onProfileSaved: (b64: string, measurements?: BodyMeasurements) => void;
    onLogin?: (token: string) => void;  // fired when user signs in via OAuth
    initialStep?: "auth" | "photo";     // skip auth if already have a token
}

export interface BodyMeasurements {
    height?: string;
    chest?: string;
    waist?: string;
    hips?: string;
    shoulder?: string;
    inseam?: string;
    recommendedSize?: string;
}

// ── OAuth: try chrome.identity.getAuthToken first, fallback to launchWebAuthFlow ──

async function oauthWithGoogle(): Promise<{ access_token: string; user: any } | null> {
    // Primary path: chrome.identity.getAuthToken (requires oauth2 in manifest)
    const tokenFromChrome = await new Promise<string | null>((resolve) => {
        (chrome as any).identity.getAuthToken({ interactive: true }, (token: string | undefined) => {
            if ((chrome as any).runtime.lastError || !token) resolve(null);
            else resolve(token);
        });
    });

    if (tokenFromChrome) {
        try {
            const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${tokenFromChrome}` },
            });
            const info = await infoRes.json() as any;
            const res = await fetch(`${API_BASE}/auth/oauth/google/exchange`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    google_access_token: tokenFromChrome,
                    email: info.email,
                    name: info.name,
                    picture: info.picture,
                    sub: info.sub,
                }),
            });
            if (res.ok) return await res.json();
        } catch { /* fall through to web auth flow */ }
    }

    // Fallback: launchWebAuthFlow pointing to website's extension auth endpoint
    const redirectUri = `https://${(chrome as any).runtime.id}.chromiumapp.org/`;
    const webAuthUrl = `${API_BASE}/auth/extension/google?${new URLSearchParams({ redirect_uri: redirectUri })}`;

    return new Promise((resolve) => {
        (chrome as any).identity.launchWebAuthFlow(
            { url: webAuthUrl, interactive: true },
            (callbackUrl: string | undefined) => {
                if ((chrome as any).runtime.lastError || !callbackUrl) { resolve(null); return; }
                try {
                    const params = new URLSearchParams(new URL(callbackUrl).search);
                    const token = params.get("access_token");
                    const userStr = params.get("user");
                    if (!token) { resolve(null); return; }
                    resolve({
                        access_token: token,
                        user: userStr ? JSON.parse(decodeURIComponent(userStr)) : {},
                    });
                } catch { resolve(null); }
            }
        );
    });
}

async function oauthWithFacebook(): Promise<{ access_token: string; user: any } | null> {
    const redirectUri = `https://${(chrome as any).runtime.id}.chromiumapp.org/`;
    const webAuthUrl = `${API_BASE}/auth/extension/facebook?${new URLSearchParams({ redirect_uri: redirectUri })}`;

    return new Promise((resolve) => {
        (chrome as any).identity.launchWebAuthFlow(
            { url: webAuthUrl, interactive: true },
            async (callbackUrl: string | undefined) => {
                if ((chrome as any).runtime.lastError || !callbackUrl) { resolve(null); return; }
                try {
                    const params = new URLSearchParams(new URL(callbackUrl).search);
                    const token = params.get("access_token");
                    const userStr = params.get("user");
                    if (token) {
                        resolve({
                            access_token: token,
                            user: userStr ? JSON.parse(decodeURIComponent(userStr)) : {},
                        });
                    } else {
                        // Legacy code exchange path
                        const code = params.get("code");
                        if (!code) { resolve(null); return; }
                        const res = await fetch(`${API_BASE}/auth/oauth/facebook/exchange`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ code, redirect_uri: redirectUri }),
                        });
                        if (res.ok) resolve(await res.json());
                        else resolve(null);
                    }
                } catch { resolve(null); }
            }
        );
    });
}

// ── Measurement extraction ────────────────────────────────────────────────────

async function extractMeasurements(b64: string): Promise<BodyMeasurements | null> {
    try {
        const token: string | null = await new Promise((res) =>
            (chrome as any).storage.local.get(["accessToken"], (d: any) => res(d.accessToken ?? null))
        );
        const resp = await fetch(`${API_BASE}/size/analyze`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ image: b64, category: "tops" }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return { ...data.measurements, recommendedSize: data.recommended };
    } catch {
        return null;
    }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "auth" | "photo" | "camera" | "preview" | "bodyAnalyzing";

// Is this tab running in dedicated camera-capture mode?
const IS_CAPTURE_TAB = new URLSearchParams(window.location.search).get("capture") === "1";
// Is this popup running inside an iframe (side panel)?
const IN_IFRAME = window !== window.top;

export function OnboardingScreen({ onProfileSaved, onLogin, initialStep = "auth" }: Props) {
    const startMode: Mode = IS_CAPTURE_TAB ? "camera" : (initialStep === "photo" ? "photo" : "auth");
    const [mode, setMode] = useState<Mode>(startMode);
    const [preview, setPreview] = useState<string | null>(null);
    const [bodyPreview, setBodyPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [authLoading, setAuthLoading] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const bodyFileRef = useRef<HTMLInputElement>(null);

    // ── Side-panel: listen for photo captured in camera tab ──────────────────
    React.useEffect(() => {
        if (!IN_IFRAME) return;
        const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area === "local" && changes.pendingCapturedPhoto?.newValue) {
                const photo = changes.pendingCapturedPhoto.newValue as string;
                (chrome as any).storage.local.remove("pendingCapturedPhoto");
                onProfileSaved(photo);
            }
        };
        (chrome as any).storage.onChanged.addListener(listener);
        return () => (chrome as any).storage.onChanged.removeListener(listener);
    }, []);

    // ── Capture-tab: start camera immediately ─────────────────────────────────
    React.useEffect(() => {
        if (IS_CAPTURE_TAB) startCameraStream();
    }, []);

    // ── Auth handler ──────────────────────────────────────────────────────────
    const handleOAuth = async (provider: "google" | "facebook") => {
        setAuthLoading(provider);
        setError(null);
        try {
            const result = provider === "google"
                ? await oauthWithGoogle()
                : await oauthWithFacebook();

            if (!result?.access_token) {
                setError(`${provider === "google" ? "Google" : "Facebook"} sign-in cancelled or failed.`);
                return;
            }

            (chrome as any).storage.local.set({
                accessToken: result.access_token,
                userInfo: result.user,
            });

            if (onLogin) onLogin(result.access_token);
            // Move to photo step after successful login
            setMode("photo");
        } catch {
            setError("Sign-in failed. Please try again.");
        } finally {
            setAuthLoading(null);
        }
    };

    // ── Camera helpers ────────────────────────────────────────────────────────
    const startCameraStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: "user" },
            });
            streamRef.current = stream;
            setMode("camera");
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }
            }, 150);
        } catch {
            setError("Camera access denied. Please allow camera access or upload a photo instead.");
        }
    };

    const startCamera = () => {
        if (IN_IFRAME) {
            const url = (chrome as any).runtime.getURL("popup.html") + "?capture=1";
            (chrome as any).tabs.create({ url });
        } else {
            startCameraStream();
        }
    };

    const capture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth || 720;
        canvas.height = videoRef.current.videoHeight || 1280;
        canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
        const b64 = canvas.toDataURL("image/jpeg", 0.92);
        stopStream();

        if (IS_CAPTURE_TAB) {
            (chrome as any).storage.local.set({ pendingCapturedPhoto: b64 }, () => { window.close(); });
        } else {
            setPreview(b64);
            setMode("preview");
        }
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    };

    // ── File handlers ─────────────────────────────────────────────────────────
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return setError("Please select an image file.");
        setError(null);
        const reader = new FileReader();
        reader.onload = (ev) => { setPreview(ev.target?.result as string); setMode("preview"); };
        reader.readAsDataURL(file);
    };

    const handleBodyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { setBodyPreview(ev.target?.result as string); };
        reader.readAsDataURL(file);
    };

    const handleBodyAnalyze = async () => {
        if (!bodyPreview || !preview) return;
        setMode("bodyAnalyzing");
        const m = await extractMeasurements(bodyPreview);
        if (m) (chrome as any).storage.local.set({ bodyMeasurements: m, recommendedSize: m.recommendedSize });
        onProfileSaved(preview, m ?? undefined);
    };

    const handleSkipBodyScan = () => {
        if (preview) onProfileSaved(preview, undefined);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="screen">
            {/* ── Header ── */}
            <div className="header">
                <span className="logo">TryItOn ✨</span>
                {mode === "preview" && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Step 2 of 2</span>
                )}
                {mode === "photo" && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Step 2 of 2</span>
                )}
                {mode === "auth" && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Step 1 of 2</span>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STEP 1: AUTH                                                  */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {mode === "auth" && (
                <>
                    <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>🛍️</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                            Welcome to TryItOn
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                            See any product on <em>you</em> before you buy it.
                            <br />Sign in to save your profile across devices.
                        </div>
                    </div>

                    {/* Social buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <button
                            onClick={() => handleOAuth("google")}
                            disabled={!!authLoading}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                background: "#fff", color: "#1f1f1f", border: "none",
                                borderRadius: 12, padding: "13px 16px", fontWeight: 600, fontSize: 13,
                                cursor: authLoading ? "not-allowed" : "pointer",
                                opacity: authLoading === "google" ? 0.7 : 1,
                                boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                            </svg>
                            {authLoading === "google" ? "Signing in…" : "Continue with Google"}
                        </button>

                        <button
                            onClick={() => handleOAuth("facebook")}
                            disabled={!!authLoading}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                background: "#1877F2", color: "#fff", border: "none",
                                borderRadius: 12, padding: "13px 16px", fontWeight: 600, fontSize: 13,
                                cursor: authLoading ? "not-allowed" : "pointer",
                                opacity: authLoading === "facebook" ? 0.7 : 1,
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                                <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.969H15.83c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                            </svg>
                            {authLoading === "facebook" ? "Signing in…" : "Continue with Facebook"}
                        </button>
                    </div>

                    {error && (
                        <div className="error-banner" style={{ marginTop: 4 }}>
                            {error}
                            {error.includes("Google") && (
                                <div style={{ marginTop: 6, fontSize: 10, opacity: 0.8 }}>
                                    Tip: Make sure you're signed into Chrome with your Google account.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Divider */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>or</span>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                    </div>

                    {/* Skip login */}
                    <button
                        onClick={() => { setError(null); setMode("photo"); }}
                        disabled={!!authLoading}
                        style={{
                            background: "transparent",
                            border: "1.5px solid rgba(255,255,255,0.15)",
                            borderRadius: 12, padding: "12px 16px",
                            color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Continue without account →
                    </button>

                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 1.5, margin: "4px 0 0" }}>
                        🔒 Your photos stay on your device. We never share them.
                    </p>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STEP 2: PHOTO UPLOAD                                          */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {mode === "photo" && (
                <>
                    <div style={{ textAlign: "center", padding: "4px 0 8px" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                            📸 Add your selfie
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            Upload once — try on any product instantly
                        </div>
                    </div>

                    {/* Upload zone */}
                    <label
                        htmlFor="file-picker"
                        className="upload-zone"
                        style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
                    >
                        <div className="icon">🖼️</div>
                        <h3>Upload a selfie</h3>
                        <p>Portrait or full body · JPEG / PNG / WebP</p>
                        <input
                            id="file-picker"
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleFile}
                        />
                    </label>

                    <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>— or —</div>

                    <button className="btn btn-secondary" onClick={startCamera}>
                        📷 Take a selfie
                    </button>

                    {error && <div className="error-banner">{error}</div>}

                    {/* Tips */}
                    <div style={{
                        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
                        borderRadius: 10, padding: "10px 12px", fontSize: 10, color: "rgba(255,255,255,0.5)",
                        lineHeight: 1.7,
                    }}>
                        <div style={{ fontWeight: 700, color: "#a5b4fc", marginBottom: 3 }}>📋 Best results:</div>
                        <div>• Stand upright, arms slightly away from body</div>
                        <div>• Good lighting, no heavy shadows</div>
                        <div>• Wear fitted clothing</div>
                    </div>

                    <p className="privacy-note">
                        🔒 Your photo is stored locally on your device.<br />
                        We never share it without your permission.
                    </p>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* CAMERA                                                         */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {mode === "camera" && (
                <>
                    <div className="camera-container">
                        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 12 }} />
                        <div className="camera-overlay">
                            <div className="body-frame" />
                        </div>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                        Stand straight · Keep your full body in the frame
                    </p>
                    <button className="btn btn-primary" onClick={capture}>📸 Capture</button>
                    <button className="btn btn-ghost" onClick={() => { stopStream(); setMode("photo"); }}>Cancel</button>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PREVIEW + OPTIONAL BODY SCAN                                  */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {mode === "preview" && preview && (
                <>
                    <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>
                        ✅ Great selfie!
                    </div>
                    <img src={preview} alt="Your photo" style={{ width: "100%", borderRadius: 12, maxHeight: 200, objectFit: "cover" }} />

                    <div style={{
                        background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
                        border: "1px solid rgba(99,102,241,0.3)",
                        borderRadius: 12, padding: "12px 14px",
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#c4b5fd", marginBottom: 4 }}>
                            📐 Optional: Full-body scan for perfect fit
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 10 }}>
                            Upload a full-body photo so our AI can learn your measurements — chest, waist, hips, height, inseam.
                        </div>
                        {["Stand straight, full body visible", "Wear fitted clothing (not baggy)", "Good front-facing lighting"].map((tip, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                                <span style={{ color: "#4ade80" }}>✓</span> {tip}
                            </div>
                        ))}
                    </div>

                    {/* Body photo upload */}
                    <div
                        onClick={() => bodyFileRef.current?.click()}
                        style={{
                            border: `2px dashed ${bodyPreview ? "rgba(74,222,128,0.6)" : "rgba(99,102,241,0.4)"}`,
                            borderRadius: 12, padding: bodyPreview ? 8 : "20px 16px",
                            textAlign: "center", cursor: "pointer",
                            background: bodyPreview ? "rgba(74,222,128,0.05)" : "rgba(99,102,241,0.05)",
                            transition: "all 0.2s",
                        }}
                    >
                        {bodyPreview ? (
                            <div style={{ position: "relative" }}>
                                <img src={bodyPreview} alt="Full body" style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 8 }} />
                                <div style={{
                                    position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)",
                                    background: "rgba(74,222,128,0.9)", borderRadius: 20,
                                    fontSize: 11, fontWeight: 700, color: "#000", padding: "2px 10px",
                                }}>✓ Full-body photo ready</div>
                            </div>
                        ) : (
                            <>
                                <div style={{ fontSize: 32, marginBottom: 6 }}>🧍</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 3 }}>
                                    Upload Full-body Photo
                                </div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Tap to select from gallery</div>
                            </>
                        )}
                        <input
                            ref={bodyFileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleBodyFile}
                        />
                    </div>

                    {bodyPreview ? (
                        <button className="btn btn-primary" onClick={handleBodyAnalyze}>
                            🔬 Analyse My Measurements & Continue
                        </button>
                    ) : (
                        <button className="btn btn-primary" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }} onClick={handleSkipBodyScan}>
                            ✅ Continue without body scan
                        </button>
                    )}

                    {bodyPreview && (
                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={handleSkipBodyScan}>
                            Skip for now
                        </button>
                    )}

                    <button className="btn btn-ghost" onClick={() => { setPreview(null); setBodyPreview(null); setMode("photo"); }}>
                        ← Retake selfie
                    </button>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* BODY ANALYZING                                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {mode === "bodyAnalyzing" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flex: 1, justifyContent: "center" }}>
                    <div style={{ fontSize: 48 }}>🔬</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Analysing your measurements…</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
                        AI is measuring your proportions.<br />This takes a few seconds.
                    </div>
                    <div style={{ width: 200, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                            height: "100%", width: "60%",
                            background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                            borderRadius: 4,
                            animation: "pulse 1.5s ease-in-out infinite",
                        }} />
                    </div>
                </div>
            )}
        </div>
    );
}
