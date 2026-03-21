import { readFileSync, writeFileSync } from "fs";

const htmlPath = "dist/popup.html";
let html = readFileSync(htmlPath, "utf8");

// Replace the raw .tsx script reference with the compiled CSS + JS
html = html.replace(
    '<script type="module" src="/src/popup/index.tsx"></script>',
    '<link rel="stylesheet" href="/popup.css"><script type="module" src="/popup.js"></script>'
);

writeFileSync(htmlPath, html);
console.log("✓ Patched dist/popup.html: index.tsx → popup.js");
