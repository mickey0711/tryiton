// Content Script — TryItOn
// Injects floating "Will this fit me?" button, detects product image and category

const API_BASE = "http://localhost:8080";
const BUTTON_ID = "tryiton-floating-btn";
const OVERLAY_ID = "tryiton-select-overlay";

// ─── Product Image Scoring ─────────────────────────────────────────────────────

interface ScoredImage {
    src: string;
    score: number;
    rect: DOMRect;
}

const IGNORE_PATTERNS = [
    /logo/i, /icon/i, /avatar/i, /profile/i, /sprite/i,
    /banner/i, /badge/i, /flag/i, /placeholder/i,
];

const IGNORE_CONTAINERS = ["nav", "header", "footer", "aside"];

function isIgnored(img: HTMLImageElement): boolean {
    const src = img.src || img.dataset.src || "";
    if (IGNORE_PATTERNS.some((p) => p.test(src))) return true;
    let el: Element | null = img;
    while (el) {
        if (IGNORE_CONTAINERS.includes(el.tagName.toLowerCase())) return true;
        el = el.parentElement;
    }
    return false;
}

function scoreImage(img: HTMLImageElement): ScoredImage | null {
    const rect = img.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w < 200 || h < 200) return null;
    if (isIgnored(img)) return null;
    const src = img.src || img.currentSrc || img.dataset.src || "";
    if (!src || src.startsWith("data:")) return null;

    const area = w * h;
    const cx = rect.left + w / 2;
    const cy = rect.top + h / 2;
    const vw = window.innerWidth, vh = window.innerHeight;
    const centerDist = Math.sqrt(Math.pow(cx - vw / 2, 2) + Math.pow(cy - vh / 2, 2));
    const maxDist = Math.sqrt((vw / 2) ** 2 + (vh / 2) ** 2);
    const centralityScore = 1 - centerDist / maxDist;

    const score = area * 0.6 + centralityScore * 100_000 * 0.4;
    return { src, score, rect };
}

function detectProductImage(): string | null {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
    const scored = imgs
        .map(scoreImage)
        .filter((x): x is ScoredImage => x !== null)
        .sort((a, b) => b.score - a.score);

    // Also check background-images
    const divs = Array.from(document.querySelectorAll<HTMLElement>("div, section, figure, a"));
    for (const div of divs) {
        const bg = window.getComputedStyle(div).backgroundImage;
        if (bg && bg !== "none" && bg.startsWith("url")) {
            const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
            if (match && match[1]) {
                const rect = div.getBoundingClientRect();
                if (rect.width > 200 && rect.height > 200) {
                    scored.push({ src: match[1], score: rect.width * rect.height * 0.5, rect });
                }
            }
        }
    }

    return scored.length ? scored[0].src : null;
}

// ─── Category Auto-Detection ──────────────────────────────────────────────────

type TryOnCategory =
    | "tops" | "pants" | "jacket" | "dress"
    | "shoes" | "glasses" | "watch" | "jewelry"
    | "hat" | "bag" | "hair" | "makeup" | "nails"
    | "furniture" | "electronics" | "lighting" | "plants" | "garden" | "kitchen"
    | "other";

const CATEGORY_RULES: Array<[TryOnCategory, RegExp]> = [
    // Wearables
    ["glasses",     /glasses|sunglasses|eyewear|eyeglasses|optical|frame|lens|goggles/i],
    ["shoes",       /shoes?|sneakers?|boots?|heels?|sandals?|loafers?|slip.on|footwear|trainers?/i],
    ["watch",       /watch|timepiece|wristwatch/i],
    ["jewelry",     /necklace|ring|earring|bracelet|pendant|anklet|jewelry|jewellery|bangle/i],
    ["bag",         /handbag|purse|tote|backpack|clutch|satchel|crossbody|shoulder bag/i],
    ["hat",         /hat|cap|beanie|beret|fedora|snapback|bucket hat/i],
    ["nails",       /nail polish|nail art|nail gel|manicure/i],
    ["makeup",      /lipstick|foundation|mascara|eyeshadow|blush|concealer|makeup|cosmetics/i],
    ["hair",        /wig|hair extensions?|hair color|hairpiece/i],
    ["pants",       /pants|jeans|trousers|shorts|leggings|sweatpants|joggers|chinos/i],
    ["dress",       /dress|gown|jumpsuit|romper|skirt|maxi|midi/i],
    ["jacket",      /jacket|coat|hoodie|blazer|puffer|parka|cardigan|sweater/i],
    // Space Intelligence
    ["furniture",   /sofa|couch|armchair|chair|table|desk|bed|wardrobe|bookcase|bookshelf|shelf|cabinet|dresser|sideboard|bench|ottoman|futon|recliner|furniture/i],
    ["electronics", /tv|television|monitor|laptop|computer|speaker|soundbar|projector|console|printer|tablet|smart home|router|electronics/i],
    ["lighting",    /lamp|chandelier|pendant light|ceiling light|floor lamp|wall light|sconce|spotlight|led strip|lighting|light fixture/i],
    ["plants",      /plant|succulent|cactus|fern|potted|bonsai|orchid|monstera|herb|flower pot|indoor plant/i],
    ["garden",      /garden|outdoor|patio|terrace|balcony|lawn|plant pot|planter|pergola|gazebo|barbecue|bbq|garden furniture/i],
    ["kitchen",     /coffee maker|kettle|toaster|blender|microwave|air fryer|stand mixer|dishwasher|fridge|refrigerator|kitchen appliance|cookware|pot|pan/i],
];

function detectCategory(): TryOnCategory {
    // Collect text signals from multiple page sources
    const jsonLdTexts: string[] = [];
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
        .forEach(s => { try { jsonLdTexts.push(JSON.stringify(JSON.parse(s.textContent || ""))); } catch {} });

    const signals = [
        document.title,
        document.querySelector("h1")?.textContent ?? "",
        document.querySelector('[class*="breadcrumb"]')?.textContent ?? "",
        document.querySelector('[class*="category"]')?.textContent ?? "",
        document.querySelector('[data-category]')?.getAttribute("data-category") ?? "",
        document.querySelector('meta[name="keywords"]')?.getAttribute("content") ?? "",
        window.location.pathname,
        window.location.href,
        ...jsonLdTexts,
    ].join(" ");

    for (const [cat, pattern] of CATEGORY_RULES) {
        if (pattern.test(signals)) return cat;
    }
    return "tops"; // default
}

let _detectedCategory: TryOnCategory | null = null;
function getCachedCategory(): TryOnCategory {
    if (!_detectedCategory) _detectedCategory = detectCategory();
    return _detectedCategory;
}

// Category display info
const CAT_INFO: Record<TryOnCategory, { icon: string; label: string }> = {
    tops:        { icon: "👕", label: "Top" },
    pants:       { icon: "👖", label: "Pants" },
    jacket:      { icon: "🧥", label: "Jacket" },
    dress:       { icon: "👗", label: "Dress" },
    shoes:       { icon: "👟", label: "Shoes" },
    glasses:     { icon: "🕶", label: "Glasses" },
    watch:       { icon: "⌚", label: "Watch" },
    jewelry:     { icon: "💍", label: "Jewelry" },
    hat:         { icon: "🧢", label: "Hat" },
    bag:         { icon: "👜", label: "Bag" },
    hair:        { icon: "💇", label: "Hair" },
    makeup:      { icon: "💄", label: "Makeup" },
    nails:       { icon: "💅", label: "Nails" },
    furniture:   { icon: "🛋️", label: "Furniture" },
    electronics: { icon: "📺", label: "Electronics" },
    lighting:    { icon: "💡", label: "Lighting" },
    plants:      { icon: "🌱", label: "Plants" },
    garden:      { icon: "🌿", label: "Garden" },
    kitchen:     { icon: "🍳", label: "Kitchen" },
    other:       { icon: "📦", label: "Other" },
};

// ─── Floating Button ───────────────────────────────────────────────────────────

function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const cat = getCachedCategory();
    const info = CAT_INFO[cat];
    const isSpace = ["furniture","electronics","lighting","plants","garden","kitchen"].includes(cat);

    const btn = document.createElement("div");
    btn.id = BUTTON_ID;
    btn.innerHTML = `
    <div class="tryiton-icon">${info.icon}</div>
    <span class="tryiton-label">${isSpace ? `Place in Space` : `Try on ${info.label}`}</span>
  `;

    Object.assign(btn.style, {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: "2147483647",
        background: isSpace
            ? "linear-gradient(135deg, #10b981, #059669)"
            : "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "white",
        borderRadius: "50px",
        padding: "12px 20px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        boxShadow: isSpace
            ? "0 4px 24px rgba(16,185,129,0.5)"
            : "0 4px 24px rgba(99,102,241,0.5)",
        fontSize: "14px",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: "600",
        userSelect: "none",
        transition: "transform 0.2s, box-shadow 0.2s",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.2)",
    });

    btn.addEventListener("mouseenter", () => {
        btn.style.transform = "scale(1.05)";
        btn.style.boxShadow = "0 8px 32px rgba(99,102,241,0.7)";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "0 4px 24px rgba(99,102,241,0.5)";
    });

    btn.addEventListener("click", () => {
        const src = detectProductImage();
        const category = getCachedCategory();
        if (src) {
            try {
                chrome.runtime.sendMessage({ type: "PRODUCT_DETECTED", src, category });
            } catch {
                // Extension context invalidated after reload — user needs to refresh
            }
        } else {
            startManualSelection();
        }
    });

    document.body.appendChild(btn);
}

// ─── Manual Selection Mode ─────────────────────────────────────────────────────

let selecting = false;
let overlayTarget: Element | null = null;

function startManualSelection() {
    if (selecting) return;
    selecting = true;

    // Show instruction toast
    const toast = document.createElement("div");
    toast.id = "tryiton-toast";
    toast.textContent = "Click a product image to select it";
    Object.assign(toast.style, {
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(30,30,30,0.95)",
        color: "white",
        padding: "12px 20px",
        borderRadius: "8px",
        zIndex: "2147483646",
        fontSize: "14px",
        fontFamily: "Inter, system-ui, sans-serif",
        pointerEvents: "none",
    });
    document.body.appendChild(toast);

    const onMove = (e: MouseEvent) => {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (target && target !== overlayTarget) {
            if (overlayTarget) (overlayTarget as HTMLElement).style.outline = "";
            overlayTarget = target;
            (overlayTarget as HTMLElement).style.outline = "3px solid #6366f1";
        }
    };

    const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();

        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;

        let src: string | null = null;
        if (el instanceof HTMLImageElement) {
            src = el.src || el.currentSrc;
        } else {
            const bg = window.getComputedStyle(el).backgroundImage;
            const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
            if (m) src = m[1];
        }
        if (src) {
            try {
                chrome.runtime.sendMessage({ type: "PRODUCT_DETECTED", src, category: getCachedCategory() });
            } catch {
                // Extension context invalidated — silently ignore
            }
        }
    };

    const cleanup = () => {
        selecting = false;
        if (overlayTarget) (overlayTarget as HTMLElement).style.outline = "";
        overlayTarget = null;
        toast.remove();
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("click", onClick, true);
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    setTimeout(cleanup, 15_000); // auto-cancel after 15s
}

// ─── Init ──────────────────────────────────────────────────────────────────────

// Inject button after short delay (wait for page render)
setTimeout(createButton, 1200);

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_MANUAL_SELECT") startManualSelection();
});
