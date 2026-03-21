"use client";
import { useState } from "react";
import styles from "./login.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [step, setStep] = useState<"email" | "code" | "done">("email");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStart = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API}/auth/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.message || "Failed to send code");
            setStep("code");
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API}/auth/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, code }),
            });
            if (!res.ok) throw new Error("Invalid code");
            const data = await res.json();
            localStorage.setItem("accessToken", data.access_token);
            localStorage.setItem("refreshToken", data.refresh_token);
            setStep("done");
            setTimeout(() => window.location.href = "/saved", 800);
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <main className={styles.page}>
            <div className={styles.card}>
                <h1 className={styles.logo}>TryItOn ✨</h1>
                <p className={styles.sub}>Sign in to access your saved looks and gallery</p>

                {step === "email" && (
                    <form onSubmit={handleStart} className={styles.form}>
                        <label className={styles.label}>Email address</label>
                        <input
                            className={styles.input}
                            type="email" required
                            placeholder="you@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                        {error && <p className={styles.error}>{error}</p>}
                        <button className={styles.btn} disabled={loading}>
                            {loading ? "Sending..." : "Send Magic Code →"}
                        </button>
                    </form>
                )}

                {step === "code" && (
                    <form onSubmit={handleVerify} className={styles.form}>
                        <p className={styles.hint}>We sent a 6-digit code to <strong>{email}</strong></p>
                        <label className={styles.label}>Verification code</label>
                        <input
                            className={`${styles.input} ${styles.codeInput}`}
                            type="text" required maxLength={6}
                            placeholder="123456"
                            value={code}
                            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                        />
                        {error && <p className={styles.error}>{error}</p>}
                        <button className={styles.btn} disabled={loading}>
                            {loading ? "Verifying..." : "Verify →"}
                        </button>
                        <button type="button" className={styles.ghost} onClick={() => setStep("email")}>
                            ← Use different email
                        </button>
                    </form>
                )}

                {step === "done" && (
                    <div className={styles.success}>
                        <span style={{ fontSize: 48 }}>✅</span>
                        <p>Signed in! Redirecting to your gallery...</p>
                    </div>
                )}
            </div>
        </main>
    );
}
