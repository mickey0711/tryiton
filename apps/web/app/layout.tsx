import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "TryItOn — AI Virtual Fit",
    description: "See any product on you before you buy it. AI-powered virtual try-on.",
    keywords: "virtual try-on, AI fashion, fit check, online shopping",
    openGraph: {
        type: "website",
        title: "TryItOn — AI Virtual Fit",
        description: "See any product on you before you buy it.",
        images: [{ url: "/og.png" }],
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
