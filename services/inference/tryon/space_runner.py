#!/usr/bin/env python3
"""
space_runner.py — CLI wrapper around SpaceProvider for the Node.js API.

Reads JSON from stdin:
  { "room_b64": "<base64 jpeg>", "product_url": "<url>", "category": "<str>" }

Writes JSON to stdout:
  { "resultB64": "<base64 jpeg>", "advisorText": "<str>", "fitScore": <int> }
"""
import sys
import json
import asyncio
import base64
import io
import os
import logging
import urllib.request

# Silence verbose logs from providers
logging.basicConfig(level=logging.WARNING)

# Make sure the service path is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from providers import SpaceProvider, MockProvider


def b64_to_pil(b64: str):
    from PIL import Image
    # Strip data URI prefix if present
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    data = base64.b64decode(b64)
    return Image.open(io.BytesIO(data)).convert("RGB")


def pil_to_b64(img) -> str:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def fetch_product_image(product_url: str):
    """Download product image from URL (handles both image URLs and product page URLs)."""
    from PIL import Image
    headers = {"User-Agent": "Mozilla/5.0 TryItOn-SpaceBot/1.0"}
    req = urllib.request.Request(product_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read()
            if "image" in content_type or product_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                return Image.open(io.BytesIO(data)).convert("RGBA")
            # If HTML page, create a placeholder product image
            return Image.new("RGBA", (400, 400), (200, 200, 200, 180))
    except Exception:
        return Image.new("RGBA", (400, 400), (180, 180, 200, 160))


async def main():
    raw = sys.stdin.read().strip()
    inp = json.loads(raw)

    room_b64 = inp["room_b64"]
    product_url = inp["product_url"]
    category = inp["category"]

    room_img = b64_to_pil(room_b64)
    product_img = fetch_product_image(product_url)

    provider = SpaceProvider()
    result = await provider.analyze(room_img, product_img, category)

    out = {
        "resultB64": pil_to_b64(result["result_image"]),
        "advisorText": result["advisor_text"],
        "fitScore": result["fit_score"],
    }
    print(json.dumps(out))


if __name__ == "__main__":
    asyncio.run(main())
