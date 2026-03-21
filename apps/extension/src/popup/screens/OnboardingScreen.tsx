import React, { useRef, useState } from "react";

const API_BASE = "http://localhost:8080";

interface Props {
    onProfileSaved: (b64: string) => void;
    onLogin?: (token: string) => void;  // fired when user signs in via OAuth
}

// ── OAuth via chrome.identity ─────────────────────────────────────────────────

async function oauthWithGoogle(): Promise<{ access_token: string; user: any } | null> {
    return new Promise((resolve) => {
        (chrome as any).identity.getAuthToken({ interactive: true }, async (token: string | undefined) => {
            if ((chrome as any).runtime.lastError || !token) {
                resolve(null);
                return;
            }

            try {
                // Fetch Google user info with the access token
                const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const info = await infoRes.json() as any;

                // Exchange with our backend to get JWT
                const res = await fetch(`${API_BASE}/auth/oauth/google/exchange`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        google_access_token: token,
                        email: info.email,
                        name: info.name,
                        picture: info.picture,
                        sub: info.sub,
                    }),
                });
                if (res.ok) resolve(await res.json());
                else resolve(null);
            } catch { resolve(null); }
        });
    });
}

async function oauthWithFacebook(): Promise<{ access_token: string; user: any } | null> {
    const appId = "YOUR_FACEBOOK_APP_ID"; // set in settings
    const redirectUri = `https://${(chrome as any).runtime.id}.chromiumapp.org/`;

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: "email,public_profile",
        response_type: "code",
    })}`;

    return new Promise((resolve) => {
        (chrome as any).identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            async (callbackUrl: string | undefined) => {
                if ((chrome as any).runtime.lastError || !callbackUrl) {
                    resolve(null);
                    return;
                }
                const params = new URLSearchParams(new URL(callbackUrl).search);
                const code = params.get("code");
                if (!code) { resolve(null); return; }

                try {
                    const res = await fetch(`${API_BASE}/auth/oauth/facebook/exchange`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code, redirect_uri: redirectUri }),
                    });
                    if (res.ok) resolve(await res.json());
                    else resolve(null);
                } catch { resolve(null); }
            }
        );
    });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingScreen({ onProfileSaved, onLogin }: Props) {
    const [mode, setMode] = useState<"choose" | "camera" | "preview">("choose");
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [authLoading, setAuthLoading] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

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

            // Store token
            (chrome as any).storage.local.set({
                accessToken: result.access_token,
                userInfo: result.user,
            });

            if (onLogin) onLogin(result.access_token);
        } catch {
            setError("Sign-in failed. Please try again.");
        } finally {
            setAuthLoading(null);
        }
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: "user" },
            });
            streamRef.current = stream;
            setMode("camera");
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            }, 100);
        } catch {
            setError("Camera access denied. Please upload a photo instead.");
        }
    };

    const capture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
        const b64 = canvas.toDataURL("image/jpeg", 0.92);
        stopStream();
        setPreview(b64);
        setMode("preview");
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return setError("Please select an image file.");
        const reader = new FileReader();
        reader.onload = (ev) => {
            setPreview(ev.target?.result as string);
            setMode("preview");
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="screen">
            <div className="header">
                <span className="logo">TryItOn ✨</span>
            </div>
            <p className="subtitle" style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Add your photo once — see any product on <em>you</em>
            </p>

            {mode === "choose" && (
                <>
                    {/* ── Social Sign-In ── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <button
                            onClick={() => handleOAuth("google")}
                            disabled={!!authLoading}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                background: "#fff", color: "#1f1f1f", border: "none",
                                borderRadius: 12, padding: "12px 16px", fontWeight: 600, fontSize: 13,
                                cursor: "pointer", opacity: authLoading === "google" ? 0.7 : 1,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
                            {authLoading === "google" ? "Signing in…" : "Continue with Google"}
                        </button>

                        <button
                            onClick={() => handleOAuth("facebook")}
                            disabled={!!authLoading}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                background: "#1877F2", color: "#fff", border: "none",
                                borderRadius: 12, padding: "12px 16px", fontWeight: 600, fontSize: 13,
                                cursor: "pointer", opacity: authLoading === "facebook" ? 0.7 : 1,
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.969H15.83c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                            {authLoading === "facebook" ? "Signing in…" : "Continue with Facebook"}
                        </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>or upload your photo</span>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                    </div>

                    {/* ── Photo Upload ── */}
                    <label
                        htmlFor="file-picker"
                        className="upload-zone"
                        style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
                    >
                        <div className="icon">🖼️</div>
                        <h3>Upload a photo</h3>
                        <p>Full body or portrait · JPEG / PNG / WebP</p>
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
                        📸 Take a selfie
                    </button>

                    {error && <div className="error-banner">{error}</div>}

                    <p className="privacy-note">
                        🔒 Your photo is stored locally on your device.<br />
                        We never share it without your permission.
                    </p>
                </>
            )}

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
                    <button className="btn btn-ghost" onClick={() => { stopStream(); setMode("choose"); }}>Cancel</button>
                </>
            )}

            {mode === "preview" && preview && (
                <>
                    <img src={preview} alt="Your photo" style={{ width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" }} />
                    <button className="btn btn-primary" onClick={() => onProfileSaved(preview)}>
                        ✅ Use this photo
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setPreview(null); setMode("choose"); }}>
                        Retake / Choose another
                    </button>
                </>
            )}
        </div>
    );
}
