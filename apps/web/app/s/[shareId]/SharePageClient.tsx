"use client";
import { useState } from "react";
import styles from "./share.module.css";

interface ShareData {
    share_id: string;
    result_url: string | null;
    product_title?: string;
    fit_score: number | null;
    created_at: string;
}

interface Props {
    shareId: string;
    initialData: ShareData | null;
}

export function SharePageClient({ shareId, initialData }: Props) {
    const [copied, setCopied] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);

    if (!initialData || !initialData.result_url) {
        return (
            <main className={styles.page}>
                <div className={styles.notFound}>
                    <span style={{ fontSize: 48 }}>😕</span>
                    <h1>Result not found</h1>
                    <p>This try-on may have expired or been deleted.</p>
                    <a href="/" className={styles.ctaBtn}>Try TryItOn →</a>
                </div>
            </main>
        );
    }

    const d = initialData;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const a = document.createElement("a");
        a.href = d.result_url!;
        a.download = "tryiton-result.jpg";
        a.click();
    };

    return (
        <main className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.logo}>TryItOn ✨</div>
                <a
                    href="https://chrome.google.com/webstore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.getBtn}
                >
                    Get the Extension →
                </a>
            </header>

            {/* Main card */}
            <div className={styles.card}>
                <div className={styles.imageWrap}>
                    <img
                        src={d.result_url}
                        alt={`Virtual try-on: ${d.product_title ?? "product"}`}
                        className={styles.resultImg}
                    />
                    {/* Watermark */}
                    <div className={styles.watermark}>Styled with TryItOn ✨</div>
                </div>

                <div className={styles.meta}>
                    {d.product_title && <h1 className={styles.productTitle}>{d.product_title}</h1>}

                    {d.fit_score !== null && (
                        <div className={styles.fitScore}>
                            <span className={styles.fitLabel}>Fit Score</span>
                            <div className={styles.fitBar}>
                                <div className={styles.fitFill} style={{ width: `${d.fit_score}%` }} />
                            </div>
                            <span className={styles.fitNum}>{d.fit_score}%</span>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={handleDownload}>
                            ⬇ Download
                        </button>
                        <button className={styles.actionBtn} onClick={handleCopy}>
                            {copied ? "✅ Copied!" : "🔗 Copy Link"}
                        </button>
                    </div>
                </div>
            </div>

            {/* CTA section */}
            <section className={styles.cta}>
                <div className={styles.ctaGlow} />
                <h2 className={styles.ctaTitle}>Want to try it on <em>you</em>?</h2>
                <p className={styles.ctaSub}>
                    Install TryItOn — see any product on yourself before you buy it.<br />
                    Works on Instagram, any fashion site, and everywhere you shop.
                </p>
                <a
                    href="https://chrome.google.com/webstore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.ctaBtn}
                >
                    ✨ Install Free — Try It Now
                </a>
            </section>
        </main>
    );
}
