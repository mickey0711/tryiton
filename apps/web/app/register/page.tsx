"use client";
import { useState } from "react";
import styles from "../login/login.module.css";   // reuse the same design tokens

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function RegisterPage() {
    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm]   = useState("");
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [done, setDone]         = useState(false);

    /* ── OAuth redirects ── */
    const oauthLogin = (provider: "google" | "facebook" | "apple") => {
        window.location.href = `${API}/oauth/${provider}`;
    };

    /* ── Email / password register ── */
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) { setError("Passwords don't match"); return; }
        if (password.length < 8)  { setError("Password must be at least 8 characters"); return; }
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Registration failed");
            // Auto-login if tokens returned, otherwise show verify-email message
            if (data.access_token) {
                localStorage.setItem("accessToken",  data.access_token);
                localStorage.setItem("refreshToken", data.refresh_token);
                window.location.href = "/saved";
            } else {
                setDone(true);
            }
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    };

    if (done) return (
        <main className={styles.page}>
            <div className={styles.card}>
                <a href="/" className={styles.logo}>TryItOn ✨</a>
                <div className={styles.success}>
                    <span style={{ fontSize: 44 }}>📬</span>
                    <p>
                        Almost there! Check your inbox at <strong>{email}</strong> and click
                        the verification link to activate your account.
                    </p>
                    <a href="/login" className={styles.btn} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
                        Go to Sign In →
                    </a>
                </div>
            </div>
        </main>
    );

    return (
        <main className={styles.page}>
            <div className={styles.card}>
                <a href="/" className={styles.logo}>TryItOn ✨</a>
                <p className={styles.sub}>Create your free account</p>

                {/* OAuth quick-signup */}
                <div className={styles.oauthGroup}>
                    <button className={styles.oauthBtn} onClick={() => oauthLogin("google")}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                        </svg>
                        Sign up with Google
                    </button>

                    <button className={styles.oauthBtn} onClick={() => oauthLogin("facebook")}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                        </svg>
                        Sign up with Facebook
                    </button>

                    <button className={styles.oauthBtn} onClick={() => oauthLogin("apple")}>
                        <svg width="18" height="18" viewBox="0 0 814 1000" fill="currentColor">
                            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.6 0 279.3 0 186.2 0 80.9 55.3 27.9 104 24c48.7-4.1 95.8 38.4 124.1 38.4 28.3 0 80.2-41.7 145.5-41.7 29 0 125.3 11.1 186.2 90.5zm-209.2-181c-3.2 22.2-31.5 107.7-95.6 158.6-60.8 50.9-128.7 83-194 83-2.6 0-5.3-.1-7.9-.4-4.9-30.1 5.9-110.7 65.6-166.8 59.7-56.1 133.3-83 231.9-74.4z"/>
                        </svg>
                        Sign up with Apple
                    </button>
                </div>

                <div className={styles.divider}><span>or</span></div>

                {/* Email + password form */}
                <form onSubmit={handleRegister} className={styles.form}>
                    <label className={styles.label}>Email</label>
                    <input
                        className={styles.input} type="email" required
                        placeholder="you@example.com"
                        value={email} onChange={e => setEmail(e.target.value)}
                    />
                    <label className={styles.label}>Password</label>
                    <input
                        className={styles.input} type="password" required
                        placeholder="Min. 8 characters"
                        value={password} onChange={e => setPassword(e.target.value)}
                    />
                    <label className={styles.label}>Confirm password</label>
                    <input
                        className={styles.input} type="password" required
                        placeholder="Repeat password"
                        value={confirm} onChange={e => setConfirm(e.target.value)}
                    />
                    {error && <p className={styles.error}>{error}</p>}
                    <button className={styles.btn} disabled={loading}>
                        {loading ? "Creating account..." : "Create Account — Free →"}
                    </button>
                </form>

                <p className={styles.switchLink}>
                    Already have an account?{" "}
                    <a href="/login" className={styles.switchA}>Sign in →</a>
                </p>
            </div>
        </main>
    );
}
