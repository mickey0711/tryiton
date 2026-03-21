import { Metadata } from "next";
import { SharePageClient } from "./SharePageClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Props {
    params: { shareId: string };
}

// Fetch share data server-side for SEO + OG tags
async function getShareData(shareId: string) {
    try {
        const res = await fetch(`${API_BASE}/share/s/${shareId}`, { next: { revalidate: 3600 } });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const data = await getShareData(params.shareId);
    const title = data?.product_title
        ? `See "${data.product_title}" on me! — TryItOn`
        : "Check out my virtual try-on! — TryItOn";
    return {
        title,
        description: `AI-powered virtual try-on. See how ${data?.product_title ?? "this product"} looks before you buy.`,
        openGraph: {
            title,
            images: data?.result_url ? [{ url: data.result_url }] : [],
        },
        twitter: { card: "summary_large_image", title },
    };
}

export default async function SharePage({ params }: Props) {
    const data = await getShareData(params.shareId);
    return <SharePageClient shareId={params.shareId} initialData={data} />;
}
