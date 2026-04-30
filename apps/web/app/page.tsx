"use client";
import styles from "./page.module.css";

const BRANDS = [
    { name: "Amazon",     domain: "amazon.com",     href: "https://amazon.com",     aff: "?tag=tryiton-20" },
    { name: "ASOS",       domain: "asos.com",        href: "https://asos.com",       aff: "" },
    { name: "Zara",       domain: "zara.com",        href: "https://zara.com",       aff: "" },
    { name: "H&M",        domain: "hm.com",          href: "https://hm.com",         aff: "" },
    { name: "Nike",       domain: "nike.com",        href: "https://nike.com",       aff: "" },
    { name: "Adidas",     domain: "adidas.com",      href: "https://adidas.com",     aff: "" },
    { name: "Shein",      domain: "shein.com",       href: "https://shein.com",      aff: "" },
    { name: "Mango",      domain: "mango.com",       href: "https://mango.com",      aff: "" },
    { name: "IKEA",       domain: "ikea.com",        href: "https://ikea.com",       aff: "" },
    { name: "Farfetch",   domain: "farfetch.com",    href: "https://farfetch.com",   aff: "" },
    { name: "Net-a-Porter",domain:"net-a-porter.com",href:"https://net-a-porter.com",aff: "" },
    { name: "Revolve",    domain: "revolve.com",     href: "https://revolve.com",    aff: "" },
];

const CATEGORIES = [
    { emoji: "👕", label: "Tops" },
    { emoji: "👖", label: "Pants" },
    { emoji: "👗", label: "Dresses" },
    { emoji: "👟", label: "Shoes" },
    { emoji: "🕶", label: "Glasses" },
    { emoji: "⌚", label: "Watches" },
    { emoji: "💍", label: "Jewelry" },
    { emoji: "✂️", label: "Haircuts" },
    { emoji: "🛋", label: "Furniture" },
];

export default function HomePage() {
    return (
        <main className={styles.page}>
            <div className={styles.glow1} />
            <div className={styles.glow2} />

            {/* Nav */}
            <nav className={styles.nav}>
                <div className={styles.logo}>TryItOn ✨</div>
                <div className={styles.navLinks}>
                    <a href="/login" className={styles.loginLink}>Sign in</a>
                    <a href="/register" className={styles.registerBtn}>Get Started Free</a>
                </div>
            </nav>

            {/* Hero */}
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
                <div className={styles.ctaGroup}>
                    <a
                        href="https://chrome.google.com/webstore"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.cta}
                    >
                        ✨ Add to Chrome — It&apos;s Free
                    </a>
                    <a href="/register" className={styles.ctaSecondary}>
                        Create Account →
                    </a>
                </div>
                <p className={styles.ctaHint}>Works on any website · No account required to start</p>
            </section>

            {/* Categories */}
            <section className={styles.cats}>
                {CATEGORIES.map((c) => (
                    <span key={c.label} className={styles.catPill}>
                        {c.emoji} {c.label}
                    </span>
                ))}
            </section>

            {/* Works on these stores */}
            <section className={styles.brandsSection}>
                <p className={styles.brandsLabel}>Works on 1000+ stores including</p>
                <div className={styles.brandsGrid}>
                    {BRANDS.map((b) => (
                        <a
                            key={b.name}
                            href={b.href + b.aff}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className={styles.brandCard}
                            title={`Try on items from ${b.name}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${b.domain}&sz=128`}
                                alt={b.name}
                                className={styles.brandLogo}
                            />
                            <span className={styles.brandName}>{b.name}</span>
                        </a>
                    ))}
                </div>
            </section>

            {/* How it works */}
            <section className={styles.how}>
                <h2 className={styles.sectionTitle}>How it works</h2>
                <div className={styles.steps}>
                    {[
                        { icon: "🖱", title: "Browse", desc: "See a product you like anywhere online" },
                        { icon: "📸", title: "One Click", desc: 'Press the "Try On" button' },
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

            {/* Sign up CTA */}
            <section className={styles.signupSection}>
                <h2 className={styles.signupTitle}>Ready to try before you buy?</h2>
                <p className={styles.signupSub}>Join thousands of shoppers making smarter decisions with AI</p>
                <a href="/register" className={styles.cta}>Get Started Free — No Credit Card</a>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <p>© 2026 TryItOn Ltd. All rights reserved. ·{" "}
                    <a href="/privacy.html">Privacy</a> ·{" "}
                    <a href="/terms.html">Terms</a>
                    <span style={{ color: "rgba(255,255,255,.2)", fontSize: 11 }}>
                        {" "}· TryItOn is a brand by TryIt4U AI | Delaware, USA
                    </span>
                </p>
            </footer>
        </main>
    );
}
