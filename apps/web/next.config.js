/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "export",       // Static export — served from DO CDN
    trailingSlash: true,    // generates login/index.html  — needed for DO static hosting clean URLs
    images: {
        unoptimized: true,  // Required for static export
        remotePatterns: [
            { protocol: "http",  hostname: "localhost" },
            { protocol: "https", hostname: "*.amazonaws.com" },
            { protocol: "https", hostname: "*.s3.amazonaws.com" },
            { protocol: "https", hostname: "logo.clearbit.com" },
        ],
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080",
    },
};
module.exports = nextConfig;
