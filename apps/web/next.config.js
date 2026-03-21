/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            { protocol: "http", hostname: "localhost" },
            { protocol: "https", hostname: "*.amazonaws.com" },
            { protocol: "https", hostname: "*.s3.amazonaws.com" },
        ],
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080",
    },
};
module.exports = nextConfig;
