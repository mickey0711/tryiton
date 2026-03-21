import styles from "./page.module.css";

export default function HomePage() {
    return (
        <main className={styles.page}>
            {/* Hero */}
            <div className={styles.glow1} />
            <div className={styles.glow2} />

            <nav className={styles.nav}>
                <div className={styles.logo}>TryItOn ✨</div>
                <a href="/login" className={styles.loginLink}>Sign in</a>
            </nav>

            <section className={styles.hero}>
                <div className={styles.badge}>🚀 AI-Powered Virtual Try-On</div>
                <h1 className={styles.headline}>
                    Will this<br />
                    <span className={styles.gradient}>fit me?</span>
                </h1>
                <p className={styles.sub}>
                    Browse any product on Instagram, Amazon, Zara, or anywhere you shop.<br />
                    One click — see it on <em>you</em>. Real AI. No guessing.
                </p>
                <a
                    href="https://chrome.google.com/webstore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.cta}
                >
                    ✨ Add to Chrome — It&apos;s Free
                </a>
                <p className={styles.ctaHint}>Works on any website · No account required to start</p>
            </section>

            {/* Categories */}
            <section className={styles.cats}>
                {["👕 Tops", "👖 Pants", "👟 Shoes", "🕶 Glasses", "⌚ Watches", "💍 Jewelry", "✂️ Haircuts", "💅 Nails", "🛋 Furniture"].map((c) => (
                    <span key={c} className={styles.catPill}>{c}</span>
                ))}
            </section>

            {/* How it works */}
            <section className={styles.how}>
                <h2 className={styles.sectionTitle}>How it works</h2>
                <div className={styles.steps}>
                    {[
                        { icon: "🖱", title: "Browse", desc: "See a product you like anywhere online" },
                        { icon: "📸", title: "One Click", desc: 'Press the "Will this fit me?" button' },
                        { icon: "🤖", title: "AI Magic", desc: "See the product on you in seconds" },
                        { icon: "⭐", title: "Decide", desc: "Save, share, or find a better match" },
                    ].map((s) => (
                        <div key={s.title} className={styles.step}>
                            <div className={styles.stepIcon}>{s.icon}</div>
                            <h3 className={styles.stepTitle}>{s.title}</h3>
                            <p className={styles.stepDesc}>{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}
