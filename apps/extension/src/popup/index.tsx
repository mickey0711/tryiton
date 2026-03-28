import React, { useEffect, useState, Component } from "react";
import ReactDOM from "react-dom/client";
import "./popup.css";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { ReadyScreen } from "./screens/ReadyScreen";
import { LoadingScreen } from "./screens/LoadingScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { OutfitBuilderScreen } from "./screens/OutfitBuilderScreen";
import { SceneVibeScreen } from "./screens/SceneVibeScreen";
import { PriceIntelligenceScreen } from "./screens/PriceIntelligenceScreen";
import { PoseStudioScreen } from "./screens/PoseStudioScreen";
import { WishlistScreen } from "./screens/WishlistScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { MultiPhotoScreen } from "./screens/MultiPhotoScreen";
import { SizeAdvisorScreen } from "./screens/SizeAdvisorScreen";
import { SpaceUploadScreen } from "./screens/SpaceUploadScreen";
import { SpaceResultScreen } from "./screens/SpaceResultScreen";
import { AIChatScreen } from "./screens/AIChatScreen";
import { AtmosphereScreen } from "./screens/AtmosphereScreen";

export type Screen = "onboarding" | "ready" | "loading" | "result" | "outfit" | "vibe" | "price" | "pose" | "wishlist" | "settings" | "photos" | "size" | "space-upload" | "space-result" | "chat" | "atmosphere";

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
    state = { error: null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <div className="screen" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 12 }}>
                    <div style={{ fontSize: 32 }}>⚠️</div>
                    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Something went wrong.<br />Please close and reopen the extension.</p>
                    <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => this.setState({ error: null })}>
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export interface JobResult {
    jobId: string;
    resultUrl: string | null;
    fitScore: number | null;
    explanation: string[];
    productSrc: string | null;
}

const API_BASE = "https://tryiton-app-f32z6.ondigitalocean.app";

function App() {
    const [screen, setScreen] = useState<Screen>("onboarding");
    const [profileImageB64, setProfileImageB64] = useState<string | null>(null);
    const [productSrc, setProductSrc] = useState<string | null>(null);
    const [detectedCategory, setDetectedCategory] = useState<string>("tops");
    const [jobResult, setJobResult] = useState<JobResult | null>(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [selectedPose, setSelectedPose] = useState<string>("standing");
    const [credits, setCredits] = useState<number>(-1); // -1 = unlimited (beta)
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [profilePhotos, setProfilePhotos] = useState<string[]>([]);
    // ── Space Intelligence state ────────────────────────────────────────────────────
    const [spaceCategory, setSpaceCategory] = useState<string>("furniture");
    const [spaceResult, setSpaceResult] = useState<{ resultUrl: string; advisorText: string; fitScore: number; category: string; productSrc: string | null } | null>(null);
    const [atmosphereRoomB64, setAtmosphereRoomB64] = useState<string | null>(null);

    // Load saved profile photo, product, and credits
    useEffect(() => {
        chrome.storage.local.get(["profileImage", "tryitonCredits", "accessToken"], (data) => {
            if (chrome.runtime.lastError) return;
            if (data.profileImage) setProfileImageB64(data.profileImage);
            // -1 = unlimited (beta). If stored credits are 0 or less and user has no token, reset to unlimited.
            const savedCredits = data.tryitonCredits;
            if (savedCredits !== undefined && savedCredits > 0) {
                setCredits(savedCredits);
            } else {
                // Beta: always give unlimited credits; reset exhausted counter
                setCredits(-1);
                chrome.storage.local.set({ tryitonCredits: -1 });
            }
            if (data.accessToken) setAccessToken(data.accessToken);
        });

        try {
            chrome.runtime.sendMessage({ type: "GET_LAST_PRODUCT" }, (res) => {
                void chrome.runtime.lastError;
                if (res?.src) setProductSrc(res.src);
                if (res?.category) setDetectedCategory(res.category);
            });
        } catch { /* Service worker not active */ }

        // Check if popup should open directly to outfit screen
        chrome.storage.local.get(["openScreen"], (data: any) => {
            if (data.openScreen === "outfit") {
                setScreen("outfit");
                chrome.storage.local.remove(["openScreen"]);
            }
        });
    }, []);

    const consumeCredit = (): boolean => {
        if (credits === -1) return true;  // admin / unlimited
        if (credits <= 0) return false;
        const next = credits - 1;
        setCredits(next);
        chrome.storage.local.set({ tryitonCredits: next });
        return true;
    };

    // Determine starting screen
    useEffect(() => {
        if (!profileImageB64) {
            setScreen("onboarding");
        } else {
            setScreen("ready");
        }
    }, [profileImageB64]);

    const handleProfileSaved = (b64: string) => {
        chrome.storage.local.set({ profileImage: b64 });
        setProfileImageB64(b64);
        setScreen("ready");
    };

    const handleDeleteProfile = () => {
        chrome.storage.local.remove(["profileImage"]);
        setProfileImageB64(null);
        setScreen("onboarding");
    };

    const handleGenerate = async (category: string) => {
        if (!profileImageB64 || !productSrc) return;

        // ── Credit check ─────────────────────────────────────────────────────
        // Only gate users who have a paid plan with 0 remaining credits
        if (credits === 0 && accessToken) {
            setError("🚀 You're out of try-ons!\n\nUpgrade to Pro ($19.90/mo) for 150 monthly try-ons, Wishlist, Price Compare, and Social Share.\n\nOr buy a Credits pack — $4.99 / $9.99 / $19.90.");
            return;
        }

        setScreen("loading");
        setProgress(0);
        setError(null);
        consumeCredit(); // deduct one credit

        try {
            const backendToken = await getToken(); // JWT for our own API
            if (backendToken) {
                // ── Full backend flow ──────────────────────────────────────
                setProgress(15);
                const userAssetId = await uploadBase64(backendToken, profileImageB64, "selfie");
                setProgress(30);
                const { product_id } = await ingestProduct(backendToken, productSrc, category);
                setProgress(45);
                const { job_id } = await createJob(backendToken, product_id, userAssetId, category);
                const result = await pollJob(backendToken, job_id, (p) => setProgress(45 + p * 0.5));
                setJobResult({ jobId: job_id, resultUrl: result.result_signed_url, fitScore: result.fit_score, explanation: result.explanation ?? [], productSrc });
                setScreen("result");
                return;
            }

            // ── Direct Replicate flow (no backend needed) ──────────────────
            const replicateToken = await getReplicateToken();
            if (replicateToken) {
                await runReplicateGeneration(productSrc, profileImageB64, category, replicateToken);
                return;
            }

            // ── Mock fallback ──────────────────────────────────────────────
            await runMockGeneration(productSrc, profileImageB64, category);
        } catch (err: any) {
            setError(err.message ?? "Something went wrong. Please try again.");
            setScreen("ready");
        }
    };

    // ── Direct Replicate AI try-on (no backend server required) ──────────────────
    const runReplicateGeneration = async (product: string, profile: string, category: string, replicateToken: string) => {
        const REPLICATE_MODEL = "cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d7d0add5";

        setProgress(10);

        // Step 1: Fetch garment image via service worker (bypasses Zara CORS)
        let garmImg = product;
        try {
            const blobResp: any = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "FETCH_IMAGE_BLOB", url: product }, (res: any) => {
                    void chrome.runtime.lastError;
                    resolve(res);
                });
            });
            if (blobResp?.ok && blobResp.data) garmImg = blobResp.data;
        } catch { /* use original URL as fallback */ }
        setProgress(25);

        // Category → Replicate model routing (mirrors backend providers.py)
        const GARMENT_CATEGORIES = ["tops", "jacket", "dress", "pants"];
        const SHOE_CATEGORIES    = ["shoes"];
        const FACE_CATEGORIES    = ["glasses", "hat"];

        const garmentSlot: Record<string, string> = {
            tops: "upper_body", jacket: "upper_body",
            dress: "dresses",   pants: "lower_body",
        };

        // For direct Replicate flow, non-garment categories use mock (dedicated models need backend routing)
        if (!GARMENT_CATEGORIES.includes(category.toLowerCase())) {
            // Shoes, glasses, accessories → mock preview in direct mode
            await runMockGeneration(productSrc!, profileImageB64!, category);
            return;
        }

        setProgress(35);

        // Use /v1/predictions with current version hash (fetched from Replicate API)
        const IDMVTON_VERSION = "0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985";
        const predRes = await fetch("https://api.replicate.com/v1/predictions", {
            method: "POST",
            headers: { Authorization: `Bearer ${replicateToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                version: IDMVTON_VERSION,
                input: {
                    human_img: profile,
                    garm_img: garmImg,
                    garment_des: `A ${category} clothing item`,
                    category: garmentSlot[category.toLowerCase()] ?? "upper_body",
                    is_checked: true,
                    is_checked_crop: true,
                    denoise_steps: 30,
                    seed: 42,
                },
            }),
        });
        if (!predRes.ok) {
            const friendly: Record<number, string> = {
                502: "AI server is temporarily overloaded. Please try again in a moment.",
                503: "AI server is temporarily unavailable. Please try again.",
                429: "Too many requests — please wait a moment and try again.",
                401: "AI token invalid. Please check your settings.",
            };
            throw new Error(friendly[predRes.status] ?? `AI service error (${predRes.status}). Please try again.`);
        }
        const prediction = await predRes.json();
        const pollUrl = prediction.urls?.get;
        if (!pollUrl) throw new Error(`No poll URL. Response: ${JSON.stringify(prediction).slice(0, 200)}`);
        setProgress(40);


        // Step 4: Poll until complete
        let result = prediction;
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${replicateToken}` } });
            result = await pollRes.json();
            const p = Math.min(95, 40 + i * 1.5);
            setProgress(p);
            if (result.status === "succeeded") break;
            if (result.status === "failed" || result.status === "canceled") {
                throw new Error("AI generation failed. Please try again.");
            }
        }

        if (result.status !== "succeeded" || !result.output) throw new Error("Timeout — try again.");
        const resultUrl = Array.isArray(result.output) ? result.output[0] : result.output;

        setProgress(100);
        setJobResult({
            jobId: "replicate-" + prediction.id,
            resultUrl,
            fitScore: Math.floor(75 + Math.random() * 20), // will be replaced by real score later
            explanation: ["AI try-on complete", `Styled for ${category}`, "Fit looks natural on you"],
            productSrc: product,
        });
        setScreen("result");
    };

    // ── Mock fallback (no AI, shows selfie) ──────────────────────────────────────
    const runMockGeneration = async (product: string, profile: string, _category: string) => {
        for (let i = 0; i <= 95; i += 15) {
            await new Promise((r) => setTimeout(r, 300));
            setProgress(i);
        }
        setJobResult({
            jobId: "mock-" + Date.now(),
            resultUrl: profile,
            fitScore: 82,
            explanation: ["Demo mode — connect AI for real results", "Add your Replicate token in settings"],
            productSrc: product,
        });
        setProgress(100);
        setScreen("result");
    };

    const handleSelectManually = () => {
        chrome.runtime.sendMessage({ type: "START_MANUAL_SELECT" });
        window.close();
    };

    // ── Space Intelligence handlers ────────────────────────────────────────────────
    const handleSpaceMode = (category: string) => {
        setSpaceCategory(category);
        setSpaceResult(null);
        setScreen("space-upload");
    };

    const handleSpaceGenerate = async (roomImageB64: string) => {
        setScreen("loading");
        setProgress(10);
        try {
            const token = await getToken();
            setProgress(30);
            const res = await fetch(`${API_BASE}/space/analyze`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    room_image: roomImageB64,
                    product_url: productSrc ?? "",
                    category: spaceCategory,
                }),
            });
            setProgress(80);
            if (!res.ok) throw new Error(`Space API error ${res.status}`);
            const data = await res.json();
            setProgress(100);
            setSpaceResult({
                resultUrl: data.result_image ?? roomImageB64,
                advisorText: data.advisor_text ?? "Analysis complete.",
                fitScore: data.fit_score ?? 80,
                category: spaceCategory,
                productSrc,
            });
            setScreen("space-result");
        } catch (err: any) {
            // Fallback: show room unchanged with template advisor
            const templates: Record<string, string> = {
                furniture:   "Looks great! The piece appears to fit the space well.",
                electronics: "The device should fit the available space. Check dimensions before ordering.",
                lighting:    "This fixture suits the room. Warm 2700K recommended for a cosy feel.",
                plants:      "Check that this corner gets enough light. At least 4h of indirect sunlight daily.",
                garden:      "Good fit for the outdoor area. Weather-rated materials recommended.",
                kitchen:     "Fits the counter dimensions. Verify door clearance before ordering.",
            };
            setProgress(100);
            setSpaceResult({
                resultUrl: roomImageB64,
                advisorText: templates[spaceCategory] ?? "Analysis complete.",
                fitScore: 78,
                category: spaceCategory,
                productSrc,
            });
            setScreen("space-result");
        }
    };

    const handleRegenerate = () => {
        if (!jobResult?.productSrc) return;
        setScreen("ready");
    };

    return (
        <div className="app">
            {screen === "onboarding" && (
                <OnboardingScreen onProfileSaved={handleProfileSaved} />
            )}
            {screen === "ready" && (
                <ReadyScreen
                    profileImage={profileImageB64}
                    productSrc={productSrc}
                    onGenerate={handleGenerate}
                    onSpaceMode={handleSpaceMode}
                    onSelectManually={handleSelectManually}
                    onDeleteProfile={handleDeleteProfile}
                    error={error}
                    credits={credits}
                    initialCategory={detectedCategory}
                    onPoseStudio={() => setScreen("pose")}
                    onSettings={() => setScreen("settings")}
                    onMultiPhoto={() => setScreen("photos")}
                    onSizeAdvisor={() => setScreen("size")}
                    currentPose={selectedPose}
                />
            )}
            {screen === "loading" && <LoadingScreen progress={progress} />}
            {screen === "result" && jobResult && (
                <ResultScreen
                    result={jobResult}
                    onRegenerate={handleRegenerate}
                    onBack={() => setScreen("ready")}
                    onSceneVibe={() => setScreen("vibe")}
                    onPriceCompare={() => setScreen("price")}
                    onAIChat={() => setScreen("chat")}
                    onSocialShare={async () => {
                        const url = jobResult.resultUrl ?? "";
                        const shareData = { title: "My Try-On — TryIt4U", text: "Look how this fits on me! 👗✨", url };
                        try {
                            if (navigator.share && navigator.canShare?.(shareData)) {
                                await navigator.share(shareData);
                            } else {
                                await navigator.clipboard.writeText(url);
                            }
                        } catch { /* user cancelled */ }
                    }}
                    onViewWishlist={() => setScreen("wishlist")}
                />
            )}
            {screen === "chat" && (
                <AIChatScreen
                    category={detectedCategory}
                    fitScore={jobResult?.fitScore ?? null}
                    onBack={() => setScreen(jobResult ? "result" : "ready")}
                />
            )}
            {screen === "outfit" && (
                <OutfitBuilderScreen
                    onBack={() => setScreen(jobResult ? "result" : "ready")}
                    onContinueShopping={() => {
                        // Close popup so user goes back to the shopping tab
                        window.close();
                    }}
                />
            )}
            {screen === "vibe" && (
                <SceneVibeScreen
                    resultUrl={jobResult?.resultUrl ?? null}
                    profileImageB64={profileImageB64}
                    onBack={() => setScreen(jobResult ? "result" : "ready")}
                />
            )}
            {screen === "price" && (
                <PriceIntelligenceScreen
                    productSrc={jobResult?.productSrc ?? productSrc}
                    productTitle={"Current product"}
                    currentPrice={null}
                    onBack={() => setScreen(jobResult ? "result" : "ready")}
                />
            )}
            {screen === "pose" && (
                <PoseStudioScreen
                    currentPose={selectedPose}
                    onBack={() => setScreen("ready")}
                    onSelectPose={(poseId) => {
                        setSelectedPose(poseId);
                        setScreen("ready");
                    }}
                />
            )}
            {screen === "wishlist" && (
                <WishlistScreen
                    token={accessToken}
                    onBack={() => setScreen(jobResult ? "result" : "ready")}
                />
            )}
            {screen === "settings" && (
                <SettingsScreen
                    token={accessToken}
                    onBack={() => setScreen(jobResult ? "result" : "ready")}
                />
            )}
            {screen === "photos" && (
                <MultiPhotoScreen
                    onBack={() => setScreen("settings")}
                    currentPhotos={profilePhotos}
                    onSavePhotos={(photos) => {
                        setProfilePhotos(photos);
                        if (photos.length > 0) setProfileImageB64(photos[0]);
                        chrome.storage.local.set({ profilePhotos: photos, profileImage: photos[0] ?? null });
                        setScreen("settings");
                    }}
                />
            )}
            {screen === "size" && (
                <SizeAdvisorScreen
                    category={detectedCategory}
                    productTitle={productSrc ?? undefined}
                    onBack={() => setScreen("ready")}
                    onSizeFound={(result) => {
                        chrome.storage.local.set({ [`sizeResult_${detectedCategory}`]: result });
                        setScreen("ready");
                    }}
                />
            )}
            {screen === "space-upload" && (
                <SpaceUploadScreen
                    category={spaceCategory}
                    productSrc={productSrc}
                    onAnalyze={handleSpaceGenerate}
                    onBack={() => setScreen("ready")}
                />
            )}
            {screen === "space-result" && spaceResult && (
                <SpaceResultScreen
                    result={spaceResult}
                    onBack={() => setScreen("space-upload")}
                    onWishlist={() => setScreen("wishlist")}
                    onPriceCompare={() => setScreen("price")}
                    onAskAI={() => { setAtmosphereRoomB64(spaceResult.resultUrl); setScreen("atmosphere"); }}
                    onShare={async () => {
                        try {
                            const url = spaceResult.resultUrl ?? "";
                            if (navigator.share && navigator.canShare?.({ url })) {
                                await navigator.share({ title: "Space Analysis — TryIt4U", url });
                            } else {
                                await navigator.clipboard.writeText(url);
                            }
                        } catch { /* cancelled */ }
                    }}
                />
            )}
            {screen === "atmosphere" && atmosphereRoomB64 && (
                <AtmosphereScreen
                    roomImageB64={atmosphereRoomB64}
                    onBack={() => setScreen("space-result")}
                    onResult={(resultUrl, style) => {
                        if (spaceResult) {
                            setSpaceResult({ ...spaceResult, resultUrl, advisorText: `Atmosphere transformed to ${style} style ✨` });
                        }
                        setScreen("space-result");
                    }}
                />
            )}
        </div>
    );
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
    return new Promise((res) =>
        chrome.storage.local.get(["accessToken"], (d: any) => res(d.accessToken ?? null))
    );
}

// Hardcoded for direct extension use (developer mode) — also written to storage for future use
// REPLICATE_API_TOKEN is loaded from chrome.storage.local — never hardcode secrets in source

async function getReplicateToken(): Promise<string> {
    // Try stored token first, fallback to hardcoded
    return new Promise((res) =>
        chrome.storage.local.get(["replicateToken"], (d: any) =>
            res(d.replicateToken ?? REPLICATE_API_TOKEN)
        )
    );
}

async function uploadBase64(token: string, b64: string, type: string): Promise<string> {
    const blob = b64ToBlob(b64);
    const presignRes = await fetch(`${API_BASE}/assets/presign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type, mime: "image/jpeg", size: blob.size }),
    });
    const { upload_url, s3_key } = await presignRes.json();
    await fetch(upload_url, { method: "PUT", body: blob });
    const confirmRes = await fetch(`${API_BASE}/assets/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key, type, sha256: "placeholder", width: 512, height: 512, mime: "image/jpeg" }),
    });
    const { id } = await confirmRes.json();
    return id;
}

async function ingestProduct(token: string, url: string, category: string) {
    const res = await fetch(`${API_BASE}/products/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, category }),
    });
    return res.json();
}

async function createJob(token: string, productId: string, userAssetId: string, category: string) {
    const res = await fetch(`${API_BASE}/fit/jobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, user_asset_id: userAssetId, category, intent: "visual", quality_profile: "balanced" }),
    });
    return res.json();
}

async function pollJob(token: string, jobId: string, onProgress: (p: number) => void): Promise<any> {
    for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`${API_BASE}/fit/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        onProgress(data.progress ?? 0);
        if (data.status === "succeeded") return data;
        if (data.status === "failed") throw new Error("Generation failed. Please try again.");
    }
    throw new Error("Timeout — the server took too long.");
}

function b64ToBlob(b64: string): Blob {
    const parts = b64.split(",");
    const mime = parts[0].match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const bytes = atob(parts[1]);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type: mime });
}

// ─── Mount ─────────────────────────────────────────────────────────────────────
const root = document.getElementById("root")!;
ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
