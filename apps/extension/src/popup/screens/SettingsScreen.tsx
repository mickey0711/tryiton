import React, { useState, useEffect, useCallback } from "react";

interface Props {
    onBack: () => void;
    token: string | null;
}

interface UserStatus {
    credits: number;
    plan: string;
    referralCode: string | null;
    referralUses: number;
}

const API_BASE = "http://localhost:8080";

export function SettingsScreen({ onBack, token }: Props) {
    const [status, setStatus]           = useState<UserStatus | null>(null);
    const [loading, setLoading]         = useState(true);
    const [redeemCode, setRedeemCode]   = useState("");
    const [toast, setToast]             = useState<string | null>(null);
    const [redeemLoading, setRedeemLoading] = useState(false);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

    const load = useCallback(async () => {
        if (!token) { setLoading(false); return; }
        try {
            const [payRes, refRes] = await Promise.all([
                fetch(`${API_BASE}/payments/status`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE}/referral/my-code`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            const pay = payRes.ok ? await payRes.json() : { credits: 5, plan: "free" };
            const ref = refRes.ok ? await refRes.json() : { code: null, uses: 0 };
            setStatus({ credits: pay.credits, plan: pay.plan, referralCode: ref.code, referralUses: ref.uses });
        } catch {
            setStatus({ credits: 5, plan: "free", referralCode: null, referralUses: 0 });
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const handleRedeem = async () => {
        if (!redeemCode.trim() || !token) return;
        setRedeemLoading(true);
        try {
            const res = await fetch(`${API_BASE}/referral/redeem`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ code: redeemCode.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                showToast("🎉 " + (data.message ?? "Referral applied!"));
                setRedeemCode("");
                load();
            } else {
                showToast("❌ " + (data.message ?? "Invalid code"));
            }
        } catch {
            showToast("❌ Connection error");
        } finally {
            setRedeemLoading(false);
        }
    };

    const copyReferralLink = async () => {
        if (!status?.referralCode) return;
        const link = `https://tryit4u.ai/ref/${status.referralCode}`;
        try {
            await navigator.clipboard.writeText(link);
            showToast("🔗 Referral link copied!");
        } catch {
            showToast("❌ Copy failed");
        }
    };

    const planColor = status?.plan === "pro" ? "#a78bfa" : "#94a3b8";
    const planLabel = status?.plan === "pro" ? "Pro" : "Free";

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
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>⚙️ Settings</span>
            </div>

            {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 52, borderRadius: 10, background: "var(--surface-2)", animation: "pulse 1.4s ease infinite" }} />)}
                </div>
            ) : (
                <>
                    {/* Plan & Credits Card */}
                    <div style={{
                        background: "var(--surface-2)", borderRadius: 12, padding: "16px",
                        border: `1px solid ${planColor}33`,
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Current Plan</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: planColor }}>{planLabel}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Credits</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24" }}>{status?.credits ?? 0}</div>
                            </div>
                        </div>
                        {status?.plan !== "pro" && (
                            <button className="btn btn-primary" style={{ fontSize: 11, padding: "8px 0" }}
                                onClick={() => showToast("Upgrade coming soon — set up Stripe first")}>
                                ⚡ Upgrade to Pro — $19.90/mo
                            </button>
                        )}
                    </div>

                    {/* Referral Card */}
                    <div style={{
                        background: "var(--surface-2)", borderRadius: 12, padding: "14px",
                        border: "1px solid rgba(251,191,36,0.15)",
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>🎁 Referral Program</div>
                        {status?.referralCode ? (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <div style={{
                                        flex: 1, background: "var(--surface-3)", borderRadius: 6,
                                        padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#e2e8f0",
                                        fontFamily: "monospace", letterSpacing: 1,
                                    }}>
                                        {status.referralCode}
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ fontSize: 11, padding: "8px 12px", whiteSpace: "nowrap" }}
                                        onClick={copyReferralLink}
                                    >
                                        📋 Copy
                                    </button>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                    {status.referralUses} friends joined · You earn 5 credits per referral
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                Sign in to get your personal referral code
                            </div>
                        )}
                    </div>

                    {/* Redeem Code */}
                    <div style={{
                        background: "var(--surface-2)", borderRadius: 12, padding: "14px",
                        border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>🎟 Have a referral code?</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                type="text"
                                value={redeemCode}
                                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                                placeholder="Enter code"
                                maxLength={12}
                                style={{
                                    flex: 1, background: "var(--surface-3)", border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13,
                                    fontFamily: "monospace", letterSpacing: 1, outline: "none",
                                }}
                            />
                            <button
                                className="btn btn-primary"
                                style={{ fontSize: 11, padding: "8px 14px", whiteSpace: "nowrap" }}
                                disabled={!redeemCode.trim() || redeemLoading}
                                onClick={handleRedeem}
                            >
                                {redeemLoading ? "..." : "Apply"}
                            </button>
                        </div>
                    </div>

                    {/* Quick links */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11, opacity: 0.6 }}
                            onClick={() => window.open("https://tryit4u.ai/#pricing", "_blank")}>
                            💎 View Plans & Pricing
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: 11, opacity: 0.6, color: "#f87171" }}
                            onClick={() => showToast("Contact support@tryit4u.ai to delete account")}>
                            🗑 Delete Account
                        </button>
                    </div>
                </>
            )}

            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
            `}</style>
        </div>
    );
}
