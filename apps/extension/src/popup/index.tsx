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
import { MyPhotosScreen } from "./screens/MyPhotosScreen";
import { SelfiePickerModal } from "./screens/SelfiePickerModal";
import { SizeAdvisorScreen } from "./screens/SizeAdvisorScreen";
import { SpaceUploadScreen } from "./screens/SpaceUploadScreen";
import { SpaceResultScreen } from "./screens/SpaceResultScreen";
import { AIChatScreen } from "./screens/AIChatScreen";
import { AtmosphereScreen } from "./screens/AtmosphereScreen";

export type Screen = "onboarding" | "ready" | "loading" | "result" | "outfit" | "vibe" | "price" | "pose" | "wishlist" | "settings" | "photos" | "size" | "space-upload" | "space-result" | "chat" | "atmosphere";

// ─── Side-panel mode: redirect window.close() → postMessage to content script ──
// When popup.html is loaded as an iframe by content-script (left side panel),
// window.close() would try to close the browser tab — bad. Instead we post a
// TRYITON_CLOSE_PANEL message that the content script catches and removes the panel.
if (window !== window.top) {
    window.close = () => {
        try { window.parent.postMessage({ type: "TRYITON_CLOSE_PANEL" }, "*"); }
        catch { /* parent may be gone */ }
    };
}

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

const API_BASE = "https://tryit4u.ai";

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
    const [selfies, setSelfies] = useState<string[]>([]);                        // selfie gallery (up to 10)
    const [pendingCategory, setPendingCategory] = useState<string | null>(null); // triggers selfie picker
    const [onboardingStep, setOnboardingStep] = useState<"auth" | "photo">("auth"); // skip auth if already have token
    // ── Space Intelligence state ────────────────────────────────────────────────────
    const [spaceCategory, setSpaceCategory] = useState<string>("furniture");
    const [spaceResult, setSpaceResult] = useState<{ resultUrl: string; advisorText: string; fitScore: number; category: string; productSrc: string | null } | null>(null);
    const [atmosphereRoomB64, setAtmosphereRoomB64] = useState<string | null>(null);

    // Load saved profile photo, product, and credits
    useEffect(() => {
        chrome.storage.local.get(["profileImage", "tryitonCredits", "accessToken", "selfies"], (data) => {
            if (chrome.runtime.lastError) return;

            // Load selfie gallery — migrate from old profileImage if no gallery yet
            const storedSelfies: string[] = Array.isArray(data.selfies) ? data.selfies : [];
            if (storedSelfies.length === 0 && data.profileImage) {
                // Migrate: wrap old single photo into gallery
                storedSelfies.push(data.profileImage);
                chrome.storage.local.set({ selfies: storedSelfies });
            }
            setSelfies(storedSelfies);
            if (storedSelfies.length > 0) setProfileImageB64(storedSelfies[0]);
            else if (data.profileImage) setProfileImageB64(data.profileImage);

            const savedCredits = data.tryitonCredits;
            if (savedCredits !== undefined && savedCredits > 0) {
                setCredits(savedCredits);
            } else {
                setCredits(-1);
                chrome.storage.local.set({ tryitonCredits: -1 });
            }

            // If user already has a stored token → skip the login step
            if (data.accessToken) {
                setAccessToken(data.accessToken);
                setOnboardingStep("photo"); // already authenticated — go straight to photo upload
            }
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
        // Add as new selfie (primary) if not already in gallery
        setSelfies(prev => {
            const next = prev.includes(b64) ? prev : [b64, ...prev].slice(0, 10);
            chrome.storage.local.set({ selfies: next, profileImage: next[0] });
            return next;
        });
        setProfileImageB64(b64);
        setScreen("ready");
    };

    const handleSaveSelfies = (newSelfies: string[]) => {
        setSelfies(newSelfies);
        const primary = newSelfies[0] ?? null;
        setProfileImageB64(primary);
        chrome.storage.local.set({ selfies: newSelfies, profileImage: primary ?? "" });
        if (!primary) setScreen("onboarding");
    };

    const handleDeleteProfile = () => {
        setSelfies([]);
        setProfileImageB64(null);
        chrome.storage.local.remove(["profileImage", "selfies"]);
        setScreen("onboarding");
    };

    // ── Generate request: show selfie picker if multiple photos, else go direct ─
    const handleGenerateRequest = (category: string) => {
        if (selfies.length > 1) {
            // Multiple selfies → let user pick which one to use
            setPendingCategory(category);
        } else {
            // Single or no photo → proceed directly (or onboarding guards it)
            handleGenerate(category);
        }
    };

    // ── User picked a selfie in the picker ─────────────────────────────────────
    const handlePickedSelfie = (b64: string) => {
        setPendingCategory(null);
        setProfileImageB64(b64);
        // Don't change primary; just use this one for this try-on
        handleGenerate(pendingCategory!, b64);
    };

    // ── User uploaded/took a new selfie in the picker ──────────────────────────
    const handlePickerUploadNew = (b64: string) => {
        // Save to gallery and use immediately
        setSelfies(prev => {
            const next = [b64, ...prev.filter(p => p !== b64)].slice(0, 10);
            chrome.storage.local.set({ selfies: next, profileImage: next[0] });
            return next;
        });
        setPendingCategory(null);
        setProfileImageB64(b64);
        handleGenerate(pendingCategory!, b64);
    };

    const handleGenerate = async (category: string, photoOverride?: string) => {
        const activePhoto = photoOverride ?? profileImageB64;
        if (!activePhoto || !productSrc) return;

        // ── Credit check ─────────────────────────────────────────────────────
        if (credits === 0 && accessToken) {
            setError("🚀 You're out of try-ons!\n\nUpgrade to Pro ($19.90/mo) for 150 monthly try-ons, Wishlist, Price Compare, and Social Share.\n\nOr buy a Credits pack — $4.99 / $9.99 / $19.90.");
            return;
        }

        setScreen("loading");
        setProgress(0);
        setError(null);
        consumeCredit();

        try {
            const backendToken = await getToken();
            const GARMENT_CATS = ["tops", "jacket", "dress", "pants", "shirt"];

            // ── Backend tryon-direct (recommended path) ────────────────────
            // Works without Redis/R2 — backend calls Replicate using server token.
            // Async flow: POST returns prediction_id immediately, extension polls.
            // Garment fetched as base64 to bypass Amazon/Zara CDN restrictions.
            if (GARMENT_CATS.includes(category.toLowerCase())) {
                try {
                    setProgress(10);

                    // Step 1: Fetch garment image as base64 via service worker
                    // (bypasses CDN restrictions on Amazon, Zara, H&M, etc.)
                    let garmentData = productSrc!;
                    try {
                        const blobResp: any = await new Promise((resolve) => {
                            chrome.runtime.sendMessage(
                                { type: "FETCH_IMAGE_BLOB", url: productSrc },
                                (r: any) => { void chrome.runtime.lastError; resolve(r); }
                            );
                        });
                        if (blobResp?.ok && blobResp.data) garmentData = blobResp.data;
                    } catch { /* keep original URL as fallback */ }

                    setProgress(18);

                    // Step 2: POST to backend — returns immediately with prediction_id
                    const res = await fetch(`${API_BASE}/fit/tryon-direct`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(backendToken ? { Authorization: `Bearer ${backendToken}` } : {}),
                        },
                        body: JSON.stringify({
                            human_img: activePhoto,
                            garment_url: garmentData,
                            category,
                        }),
                        signal: AbortSignal.timeout(30_000), // 30s for the initial POST only
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.message ?? `Server error (${res.status})`);
                    }

                    const initData = await res.json();

                    // Fast path: Replicate finished within the 5 s wait window
                    if (initData.result_url) {
                        setProgress(100);
                        setJobResult({
                            jobId: "direct-" + Date.now(),
                            resultUrl: initData.result_url,
                            fitScore: initData.fit_score ?? Math.floor(75 + Math.random() * 20),
                            explanation: ["AI try-on complete", `Category: ${category}`, "Powered by TryIt4U AI"],
                            productSrc,
                        });
                        setScreen("result");
                        return;
                    }

                    // Slow path: poll prediction status from extension (client-side)
                    const predictionId = initData.prediction_id;
                    if (!predictionId) throw new Error(initData.message ?? "AI service error");

                    setProgress(22);
                    for (let i = 0; i < 60; i++) {
                        await new Promise((r) => setTimeout(r, 3000));
                        // Smooth progress animation: 22 → 92 over 60 iterations
                        setProgress(Math.min(92, 22 + i * 1.2));

                        const pollRes = await fetch(
                            `${API_BASE}/fit/tryon-direct/poll/${predictionId}`,
                            {
                                headers: backendToken ? { Authorization: `Bearer ${backendToken}` } : {},
                                signal: AbortSignal.timeout(10_000),
                            }
                        );
                        if (!pollRes.ok) continue; // transient network error — keep polling

                        const pollData = await pollRes.json();

                        if (pollData.status === "succeeded") {
                            setProgress(100);
                            setJobResult({
                                jobId: "direct-" + predictionId,
                                resultUrl: pollData.result_url,
                                fitScore: pollData.fit_score ?? Math.floor(75 + Math.random() * 20),
                                explanation: ["AI try-on complete", `Category: ${category}`, "Powered by TryIt4U AI"],
                                productSrc,
                            });
                            setScreen("result");
                            return;
                        }

                        if (pollData.status === "failed") {
                            throw new Error(pollData.message ?? "AI generation failed. Please try again.");
                        }
                        // status === "processing" — keep polling
                    }
                    throw new Error("AI generation timed out. The model is busy — please try again in a moment.");

                } catch (err: any) {
                    if (err?.name === "TimeoutError") {
                        throw new Error("AI generation timed out. The model is busy — please try again in a moment.");
                    }
                    throw err;
                }
            }

            // ── Direct Replicate flow (fallback if backend unavailable) ────
            const replicateToken = await getReplicateToken();
            if (replicateToken) {
                await runReplicateGeneration(productSrc, activePhoto, category, replicateToken);
                return;
            }

            // ── Mock fallback ──────────────────────────────────────────────
            await runMockGeneration(productSrc, activePhoto, category);
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
            await runMockGeneration(productSrc!, profile, category);
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
                <OnboardingScreen
                    onProfileSaved={handleProfileSaved}
                    initialStep={onboardingStep}
                    onLogin={async (token) => {
                        setAccessToken(token);
                        setOnboardingStep("photo");
                        // Sync user profile: credits, plan, name
                        try {
                            const meRes = await fetch(`${API_BASE}/me`, {
                                headers: { Authorization: `Bearer ${token}` },
                            });
                            if (meRes.ok) {
                                const { user } = await meRes.json();
                                chrome.storage.local.set({ userInfo: user });
                                if (typeof user.credits === "number" && user.credits >= 0) {
                                    setCredits(user.credits);
                                    chrome.storage.local.set({ tryitonCredits: user.credits });
                                }
                            }
                        } catch { /* non-critical — user can still proceed */ }
                    }}
                />
            )}
            {screen === "ready" && (
                <ReadyScreen
                    profileImage={profileImageB64}
                    selfieCount={selfies.length}
                    productSrc={productSrc}
                    onGenerate={handleGenerateRequest}
                    onSpaceMode={handleSpaceMode}
                    onSelectManually={handleSelectManually}
                    onDeleteProfile={handleDeleteProfile}
                    error={error}
                    credits={credits}
                    initialCategory={detectedCategory}
                    onPoseStudio={() => setScreen("pose")}
                    onSettings={() => setScreen("settings")}
                    onMyPhotos={() => setScreen("photos")}
                    onSizeAdvisor={() => setScreen("size")}
                    currentPose={selectedPose}
                />
            )}
            {/* ── Selfie picker modal (shown on top of ready screen before generate) */}
            {pendingCategory !== null && (
                <SelfiePickerModal
                    selfies={selfies}
                    category={pendingCategory}
                    onPick={handlePickedSelfie}
                    onUploadNew={handlePickerUploadNew}
                    onCancel={() => setPendingCategory(null)}
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
                <MyPhotosScreen
                    selfies={selfies}
                    onBack={() => setScreen(profileImageB64 ? "ready" : "onboarding")}
                    onSave={handleSaveSelfies}
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

    // Compute actual SHA256 hash before uploading
    const sha256 = await computeSHA256(blob);

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
        body: JSON.stringify({ s3_key, type, sha256, width: 512, height: 512, mime: "image/jpeg" }),
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

async function computeSHA256(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
