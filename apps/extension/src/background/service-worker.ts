// Service Worker — TryItOn background script
// Routes messages between content script and popup
// Single onMessage listener (multiple listeners cause silent errors in MV3)

// ─── API token is configured via the extension options page or admin flow ─────
// Never hardcode tokens in source. Token is stored in chrome.storage.local
// and must be set via the options/setup flow before use.

chrome.runtime.onInstalled.addListener(() => {
    // Token is set via the popup settings or provisioned separately — not hardcoded
    chrome.storage.local.get(['replicateToken'], (result) => {
        if (!result.replicateToken) {
            console.warn('[TryItOn] Replicate token not set. Configure via extension options.');
        }
    });
});

// ─── State ────────────────────────────────────────────────────────────────────
let lastProductSrc: string | null = null;
let lastProductCategory: string = "tops";

// ─── Single unified message listener ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    // ── Product detection (from content script) ──
    if (msg.type === "PRODUCT_DETECTED") {
        lastProductSrc = msg.src;
        lastProductCategory = msg.category ?? "tops";
        // Try to open popup — may not be available in all contexts, ignore errors
        if (chrome.action?.openPopup) {
            chrome.action.openPopup().catch(() => { /* not available */ });
        }
        sendResponse({ ok: true });
        return true;
    }

    if (msg.type === "GET_LAST_PRODUCT") {
        sendResponse({ src: lastProductSrc, category: lastProductCategory });
        return true;
    }

    if (msg.type === "CLEAR_PRODUCT") {
        lastProductSrc = null;
        lastProductCategory = "tops";
        sendResponse({ ok: true });
        return true;
    }

    // ── Image fetch (CORS bypass) ──
    if (msg.type === "FETCH_IMAGE_BLOB") {
        fetchImageAsBase64(msg.url)
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true; // keep channel open for async response
    }

    // ── Manual image selection trigger ──
    if (msg.type === "START_MANUAL_SELECT") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "START_MANUAL_SELECT" });
            }
        });
        return true;
    }

    // ── Auth token management ──
    if (msg.type === "GET_TOKENS") {
        chrome.storage.local.get(["accessToken", "refreshToken"], (data) => {
            sendResponse(data);
        });
        return true;
    }

    if (msg.type === "SET_TOKENS") {
        chrome.storage.local.set({
            accessToken: msg.accessToken,
            refreshToken: msg.refreshToken,
        }, () => sendResponse({ ok: true }));
        return true;
    }

    if (msg.type === "CLEAR_TOKENS") {
        chrome.storage.local.remove(["accessToken", "refreshToken"], () =>
            sendResponse({ ok: true })
        );
        return true;
    }

    // Unknown message — respond to avoid hanging promise
    sendResponse({ ok: false, error: "Unknown message type: " + msg.type });
    return false;
});

// ─── Image fetching helper ────────────────────────────────────────────────────
async function fetchImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
