"use client";
import { useEffect, useState } from "react";
import styles from "./saved.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const CATEGORIES = ["All", "tops", "pants", "dress", "shoes", "glasses", "watch", "jewelry", "furniture", "electronics"];

interface SavedItem {
    id: string;
    product_title?: string;
    product_category?: string;
    created_at: string;
    snapshot: {
        fit_score?: number;
        result_url?: string;
        product_image?: string;
        product_title?: string;
    };
}

export default function SavedPage() {
    const [items, setItems] = useState<SavedItem[]>([]);
    const [filter, setFilter] = useState("All");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem("accessToken");
        if (!token) {
            window.location.href = "/login";
            return;
        }

        fetch(`${API}/library/saved`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((d) => setItems(d.items ?? []))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const filtered = filter === "All" ? items : items.filter((i) => i.product_category === filter);

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <a href="/" className={styles.logo}>TryItOn ✨</a>
                <div className={styles.nav}>
                    <a href="/saved" className={styles.navLink} style={{ color: "#a5b4fc" }}>My Looks</a>
                    <a href="/account" className={styles.navLink}>Account</a>
                </div>
            </header>

            <h1 className={styles.title}>My Saved Looks</h1>

            {/* Category filter */}
            <div className={styles.filters}>
                {CATEGORIES.map((c) => (
                    <button
                        key={c}
                        className={`${styles.filterBtn} ${filter === c ? styles.active : ""}`}
                        onClick={() => setFilter(c)}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {loading && <div className={styles.empty}><div className={styles.spinner} /></div>}
            {error && <div className={styles.empty}><p style={{ color: "#f87171" }}>{error}</p></div>}

            {!loading && !error && filtered.length === 0 && (
                <div className={styles.empty}>
                    <span style={{ fontSize: 48 }}>🎭</span>
                    <h2>No saved looks yet</h2>
                    <p>Install the extension and try on some products!</p>
                    <a href="/" className={styles.cta}>Get TryItOn Extension →</a>
                </div>
            )}

            <div className={styles.grid}>
                {filtered.map((item) => {
                    const img = item.snapshot?.result_url || item.snapshot?.product_image;
                    const title = item.snapshot?.product_title || item.product_title || "Saved look";
                    const score = item.snapshot?.fit_score;

                    return (
                        <div key={item.id} className={styles.card}>
                            <div className={styles.imgWrap}>
                                {img ? (
                                    <img src={img} alt={title} className={styles.img} />
                                ) : (
                                    <div className={styles.imgPlaceholder}>🎭</div>
                                )}
                                {score != null && (
                                    <div className={styles.scoreBadge}>{score}% fit</div>
                                )}
                            </div>
                            <div className={styles.cardMeta}>
                                <p className={styles.cardTitle}>{title}</p>
                                <p className={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
