"use client";
import { useEffect, useState } from "react";
import styles from "./account.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function AccountPage() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [deleted, setDeleted] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("accessToken");
        if (!token) { window.location.href = "/login"; return; }
        fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(setUser).finally(() => setLoading(false));
    }, []);

    const handleDeleteAccount = async () => {
        if (!confirm("⚠️ This will permanently delete your account and ALL your photos and data. Are you sure?")) return;
        if (!confirm("Final confirmation: delete everything forever?")) return;
        setDeleting(true);
        const token = localStorage.getItem("accessToken");
        await fetch(`${API}/me`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        localStorage.clear();
        setDeleted(true);
        setDeleting(false);
    };

    if (deleted) return (
        <main className={styles.page}>
            <div className={styles.card}>
                <span style={{ fontSize: 48 }}>👋</span>
                <h1>Account deleted</h1>
                <p>All your data has been permanently removed.</p>
                <a href="/" className={styles.btn}>Go to TryItOn home →</a>
            </div>
        </main>
    );

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <a href="/" className={styles.logo}>TryItOn ✨</a>
                <div className={styles.nav}>
                    <a href="/saved" className={styles.navLink}>My Looks</a>
                    <a href="/account" className={styles.navLink} style={{ color: "#a5b4fc" }}>Account</a>
                </div>
            </header>

            <div className={styles.card}>
                {loading ? <div className={styles.spinner} /> : (
                    <>
                        <div className={styles.avatar}>{user?.email?.[0]?.toUpperCase() ?? "?"}</div>
                        <h2 className={styles.email}>{user?.email}</h2>
                        <p className={styles.plan}>Plan: <span className={styles.planBadge}>{user?.plan ?? "free"}</span></p>
                        <p className={styles.since}>Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</p>

                        <div className={styles.divider} />

                        <h3 className={styles.sectionTitle}>Data & Privacy</h3>
                        <p className={styles.hint}>Your photos are only used for generating try-ons and are never shared with third parties.</p>

                        <button
                            className={styles.signOut}
                            onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
                        >
                            Sign Out
                        </button>

                        <button className={styles.danger} onClick={handleDeleteAccount} disabled={deleting}>
                            {deleting ? "Deleting..." : "🗑 Delete My Account & All Data"}
                        </button>
                    </>
                )}
            </div>
        </main>
    );
}
