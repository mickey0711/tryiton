import { logger } from "../config/logger";

// ─── Price Intelligence Service ─────────────────────────────────────────────
// Searches Google Shopping via SerpAPI for the same product across multiple
// stores. Falls back to demo data if SERPAPI_KEY is not set.

interface PriceResult {
    store: string;
    price: number;
    currency: string;
    url: string;
    thumbnail: string | null;
    shipping: string | null;
    inStock: boolean;
    badge: string | null;
}

const API_KEY = process.env.SERPAPI_KEY;

export async function searchPrices(query: string, maxResults = 12): Promise<PriceResult[]> {
    if (!API_KEY) {
        logger.info({ query }, "🔍 [DEV] Price search — no SERPAPI_KEY, returning demo data");
        return getDemoResults(query);
    }

    try {
        const params = new URLSearchParams({
            engine: "google_shopping",
            q: query,
            api_key: API_KEY,
            num: String(maxResults),
            hl: "en",
            gl: "us",
        });

        const res = await fetch(`https://serpapi.com/search?${params}`);
        if (!res.ok) {
            logger.error({ status: res.status }, "SerpAPI request failed");
            return getDemoResults(query);
        }

        const data = await res.json();
        const results: PriceResult[] = (data.shopping_results ?? []).map((item: any) => ({
            store: item.source ?? "Unknown",
            price: parseFloat(String(item.extracted_price ?? item.price ?? 0).replace(/[^0-9.]/g, "")) || 0,
            currency: "$",
            url: item.link ?? "#",
            thumbnail: item.thumbnail ?? null,
            shipping: item.delivery ?? null,
            inStock: item.in_stock !== false,
            badge: item.tag ?? null,
        }));

        // Sort by price ascending
        results.sort((a, b) => a.price - b.price);
        return results.slice(0, maxResults);
    } catch (err) {
        logger.error({ err, query }, "Price search error");
        return getDemoResults(query);
    }
}

function getDemoResults(query: string): PriceResult[] {
    const stores = [
        { store: "Amazon", price: 42.99, badge: "Prime" },
        { store: "eBay", price: 38.50, badge: null },
        { store: "Zara", price: 49.99, badge: "Official" },
        { store: "ASOS", price: 35.00, badge: "Sale -30%" },
        { store: "H&M", price: 29.99, badge: null },
        { store: "Shein", price: 18.49, badge: "Cheapest" },
        { store: "Zalando", price: 45.00, badge: null },
        { store: "Farfetch", price: 55.00, badge: "Luxury" },
        { store: "Nordstrom", price: 52.00, badge: null },
        { store: "Revolve", price: 48.00, badge: null },
    ];

    return stores
        .sort((a, b) => a.price - b.price)
        .map(s => ({
            ...s,
            currency: "$",
            url: "#",
            thumbnail: null,
            shipping: s.price > 35 ? "Free" : "$4.99",
            inStock: Math.random() > 0.15,
        }));
}
