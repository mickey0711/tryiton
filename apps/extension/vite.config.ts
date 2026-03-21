import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        react(),
        webExtension({
            manifest: path.resolve(__dirname, "public/manifest.json"),
            scriptViteConfig: {
                build: {
                    minify: false,
                },
            },
        }),
    ],
    root: __dirname,
    publicDir: "public",
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
