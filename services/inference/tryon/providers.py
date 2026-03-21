"""
AI Provider Abstraction Layer — TryItOn
Swap providers by setting AI_PROVIDER env var.
Supported: mock | replicate | segmind | custom
"""
from __future__ import annotations
import os
import io
import abc
import logging
from pathlib import Path
from typing import Optional
from PIL import Image

log = logging.getLogger("tryiton.providers")

AI_PROVIDER = os.environ.get("AI_PROVIDER", "mock")


# ─── Interface ────────────────────────────────────────────────────────────────

class AIProvider(abc.ABC):
    """
    Every provider must implement generate().
    Input:  user PIL.Image, product PIL.Image, category str
    Output: PIL.Image result
    """

    @abc.abstractmethod
    async def generate(
        self,
        user_image: Image.Image,
        product_image: Image.Image,
        category: str,
        quality_profile: str = "balanced",
    ) -> Image.Image:
        ...

    @property
    @abc.abstractmethod
    def name(self) -> str:
        ...


# ─── Mock Provider (local dev, CPU only) ─────────────────────────────────────

class MockProvider(AIProvider):
    """
    Category-aware composite overlay.
    Zero external deps — works offline.
    Replace with real provider for production.
    """

    name = "mock"

    CATEGORY_CONFIG = {
        "tops":        {"scale": 0.55, "y_offset": 0.30, "alpha": 185},
        "pants":       {"scale": 0.55, "y_offset": 0.55, "alpha": 185},
        "jacket":      {"scale": 0.60, "y_offset": 0.28, "alpha": 185},
        "dress":       {"scale": 0.60, "y_offset": 0.38, "alpha": 185},
        "shoes":       {"scale": 0.35, "y_offset": 0.82, "alpha": 200},
        "glasses":     {"scale": 0.32, "y_offset": 0.19, "alpha": 210},
        "watch":       {"scale": 0.20, "y_offset": 0.55, "alpha": 215},
        "jewelry":     {"scale": 0.22, "y_offset": 0.22, "alpha": 210},
        "hat":         {"scale": 0.35, "y_offset": 0.03, "alpha": 190},
        "hair":        {"scale": 0.60, "y_offset": 0.02, "alpha": 175},
        "makeup":      {"scale": 0.50, "y_offset": 0.08, "alpha": 160},
        "nails":       {"scale": 0.30, "y_offset": 0.72, "alpha": 200},
        # Space categories — placed in center/lower area of room photo
        "furniture":   {"scale": 0.72, "y_offset": 0.45, "alpha": 200},
        "electronics": {"scale": 0.48, "y_offset": 0.28, "alpha": 195},
        "lighting":    {"scale": 0.38, "y_offset": 0.08, "alpha": 195},
        "plants":      {"scale": 0.40, "y_offset": 0.38, "alpha": 200},
        "garden":      {"scale": 0.65, "y_offset": 0.42, "alpha": 195},
        "kitchen":     {"scale": 0.45, "y_offset": 0.35, "alpha": 195},
        "beauty":      {"scale": 0.30, "y_offset": 0.08, "alpha": 175},
        "other":       {"scale": 0.50, "y_offset": 0.35, "alpha": 180},
    }

    async def generate(self, user_image, product_image, category, quality_profile="balanced"):
        from PIL import ImageFilter, ImageEnhance
        cfg = self.CATEGORY_CONFIG.get(category, self.CATEGORY_CONFIG["other"])
        base = user_image.copy()
        bw, bh = base.size

        target_w = int(bw * cfg["scale"])
        aspect = product_image.height / max(product_image.width, 1)
        target_h = int(target_w * aspect)

        product = product_image.resize((target_w, target_h), Image.LANCZOS).convert("RGBA")
        alpha = Image.new("L", product.size, cfg["alpha"])
        product.putalpha(alpha)

        x = (bw - target_w) // 2
        y = max(0, min(int(bh * cfg["y_offset"]), bh - target_h))

        base_rgba = base.convert("RGBA")
        base_rgba.paste(product, (x, y), product)
        result = base_rgba.convert("RGB")

        # Post-process
        result = result.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=2))
        result = ImageEnhance.Color(result).enhance(1.06)
        result = ImageEnhance.Brightness(result).enhance(1.02)
        return result


# ─── Replicate Provider ───────────────────────────────────────────────────────

class ReplicateProvider(AIProvider):
    """
    Production-grade try-on via Replicate API.

    Category → model routing:
      - Garments (tops/pants/dress/jacket) → IDM-VTON (cuuupid/idm-vton)
      - Shoes/sneakers                     → virtual-shoe-try-on
      - Glasses/sunglasses/hats            → face-accessory-tryon
      - Watches/jewelry/bags               → MockProvider composite (until dedicated model)
    """

    name = "replicate"

    MAX_RETRIES = 3
    RETRY_BASE_DELAY = 2.0

    # ── Model registry ────────────────────────────────────────────────────────
    # Each entry: (replicate_model_id, build_payload_fn)
    # If model_id is None → fall through to MockProvider
    CATEGORY_ROUTING: dict[str, tuple[str | None, str]] = {
        # Clothing — IDM-VTON
        "tops":    ("cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d7d0add5", "upper_body"),
        "jacket":  ("cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d7d0add5", "upper_body"),
        "dress":   ("cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d7d0add5", "dresses"),
        "pants":   ("cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d7d0add5", "lower_body"),
        # Shoes — virtual shoe try-on
        "shoes":   ("dcsaurabh/virtual-shoe-try-on:latest", "shoes"),
        # Face accessories — glasses + hat overlay
        "glasses": ("alaradirik/t2i-adapter-sdxl-face:latest", "glasses"),
        "hat":     ("alaradirik/t2i-adapter-sdxl-face:latest", "hat"),
        # Accessories — mock until specialized models available
        "watch":   (None, "watch"),
        "jewelry": (None, "jewelry"),
        "bag":     (None, "bag"),
        "hair":    (None, "hair"),
        "makeup":  (None, "makeup"),
        "nails":   (None, "nails"),
        "other":   (None, "other"),
    }

    def __init__(self):
        import replicate
        self._client = replicate
        self._default_model = os.environ.get(
            "REPLICATE_MODEL_TRYON",
            "cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d7d0add5"
        )
        # Allow per-category model overrides via env vars
        self._shoe_model = os.environ.get(
            "REPLICATE_MODEL_SHOES",
            "dcsaurabh/virtual-shoe-try-on:latest"
        )
        self._face_model = os.environ.get(
            "REPLICATE_MODEL_FACE_ACCESSORIES",
            "alaradirik/t2i-adapter-sdxl-face:latest"
        )
        token = os.environ.get("REPLICATE_API_TOKEN", "")
        if not token:
            log.warning("REPLICATE_API_TOKEN is not set — Replicate calls will fail")

    async def generate(self, user_image, product_image, category, quality_profile="balanced"):
        import asyncio
        import base64
        import httpx

        route = self.CATEGORY_ROUTING.get(category, (None, "other"))
        model_id, cat_slot = route

        # Fall through accessory categories to mock composite
        if model_id is None:
            log.info(f"Category '{category}' → MockProvider composite (no specialized model yet)")
            mock = MockProvider()
            return await mock.generate(user_image, product_image, category, quality_profile)

        def pil_to_b64(img: Image.Image) -> str:
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=92)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

        # Build model-specific payload
        if category in ("glasses", "hat"):
            payload = self._glasses_payload(user_image, product_image, category, pil_to_b64)
        elif category == "shoes":
            payload = self._shoes_payload(user_image, product_image, pil_to_b64)
        else:
            # Default IDM-VTON garment payload
            payload = {
                "human_img":    pil_to_b64(user_image),
                "garm_img":     pil_to_b64(product_image),
                "garment_des":  f"A {category} garment",
                "category":     cat_slot,
                "is_checked":   True,
                "is_checked_crop": True,
                "denoise_steps": 30 if quality_profile == "fast" else 40,
            }

        log.info(f"[Replicate] category={category} model={model_id} slot={cat_slot}")

        loop = asyncio.get_event_loop()
        last_err: Exception | None = None
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                result_urls = await loop.run_in_executor(
                    None,
                    lambda: self._client.run(model_id, input=payload),
                )
                break
            except Exception as e:
                last_err = e
                is_retryable = any(kw in str(e).lower() for kw in ("5", "timeout", "connection", "rate"))
                if attempt < self.MAX_RETRIES and is_retryable:
                    delay = self.RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    log.warning(f"Replicate attempt {attempt}/{self.MAX_RETRIES} → {e}. Retry in {delay}s")
                    await asyncio.sleep(delay)
                else:
                    raise
        else:
            raise last_err  # type: ignore

        url = result_urls[0] if isinstance(result_urls, list) else str(result_urls)
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.get(url)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert("RGB")

    # ── Payload builders ──────────────────────────────────────────────────────

    @staticmethod
    def _glasses_payload(user_img, product_img, category, b64fn):
        """Face-landmark accessory overlay payload."""
        return {
            "image":         b64fn(user_img),
            "accessory":     b64fn(product_img),
            "accessory_type": category,   # "glasses" | "hat"
            "preserve_face": True,
        }

    @staticmethod
    def _shoes_payload(user_img, product_img, b64fn):
        """Shoe try-on payload."""
        return {
            "human_image": b64fn(user_img),
            "shoe_image":  b64fn(product_img),
            "preserve_body_proportions": True,
        }


# ─── Space Intelligence Provider ──────────────────────────────────────────────

class SpaceProvider:
    """
    AI product placement into room/space photos.

    Pipeline:
      1. Remove product background (Replicate cjwbw/rembg)
      2. Composite product into room at correct scale/position (MockProvider logic)
      3. Generate AI advisor text (GPT-4o Vision if OPENAI_API_KEY set,
         else Replicate yorickvp/llava-13b, else template)

    Inputs:  room PIL.Image, product PIL.Image, category str
    Outputs: (result PIL.Image, advisor_text str, fit_score int)
    """

    SPACE_CATEGORIES = {
        "furniture", "electronics", "lighting", "plants",
        "garden", "kitchen", "beauty",
    }

    ADVISOR_TEMPLATES = {
        "furniture":   "This piece appears to fit the space well. The scale and style look compatible with the room.",
        "electronics": "The device fits the available wall/surface space. Consider cable management for a clean setup.",
        "lighting":    "The light fixture suits the room dimensions. Warm 2700K recommended for a cosy atmosphere.",
        "plants":      "This plant can work here. Check sunlight levels — ensure at least 4h of indirect light daily.",
        "garden":      "Good fit for the outdoor space. Ensure the material is weather-rated for your climate.",
        "kitchen":     "The appliance fits the counter/cabinet dimensions. Check door-swing clearance before ordering.",
        "beauty":      "Product placed for reference. Visit a mirror or use selfie mode for a true beauty try-on.",
    }

    def __init__(self):
        self._replicate_token = os.environ.get("REPLICATE_API_TOKEN", "")
        self._openai_key = os.environ.get("OPENAI_API_KEY", "")

    async def remove_background(self, product_image: "Image.Image") -> "Image.Image":
        """Remove product background via Replicate rembg, fallback to original."""
        if not self._replicate_token:
            return product_image
        try:
            import replicate
            import httpx
            import base64
            import io as _io
            buf = _io.BytesIO()
            product_image.save(buf, "PNG")
            b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
            import asyncio
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: replicate.run(
                    "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
                    input={"image": b64}
                )
            )
            url = result[0] if isinstance(result, list) else str(result)
            async with httpx.AsyncClient(timeout=60) as http:
                resp = await http.get(url)
                resp.raise_for_status()
                from PIL import Image as _Image
                return _Image.open(_io.BytesIO(resp.content)).convert("RGBA")
        except Exception as e:
            log.warning(f"[SpaceProvider] rembg failed ({e}), using original product image")
            return product_image

    async def generate_advisor(
        self,
        room_image: "Image.Image",
        product_image: "Image.Image",
        category: str,
    ) -> tuple[str, int]:
        """
        Returns (advisor_text, fit_score).
        Priority: GPT-4o Vision → Replicate LLAVA → template.
        """
        if self._openai_key:
            return await self._gpt4v_advisor(room_image, product_image, category)
        if self._replicate_token:
            return await self._llava_advisor(room_image, product_image, category)
        return self.ADVISOR_TEMPLATES.get(category, "Product placed in your space."), 85

    async def _gpt4v_advisor(self, room_img, product_img, category) -> tuple[str, int]:
        """GPT-4o Vision advisor."""
        try:
            import httpx
            import base64
            import io as _io
            import json

            def to_b64(img):
                buf = _io.BytesIO()
                img.save(buf, "JPEG", quality=85)
                return base64.b64encode(buf.getvalue()).decode()

            prompt = (
                f"You are an expert interior designer and product advisor. "
                f"The first image is a room/space photo. The second image is a '{category}' product. "
                f"Analyze: 1) Does this product fit the space aesthetically? 2) Does the scale look right? "
                f"3) Any concerns (dimensions, style clash, safety)? 4) Recommendations. "
                f"Reply in 2-3 sentences, conversational tone. Also give a fit_score 0-100 as JSON at the end: "
                f'{{\"fit_score\": N}}'
            )

            payload = {
                "model": "gpt-4o",
                "max_tokens": 300,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{to_b64(room_img)}"}},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{to_b64(product_img)}"}},
                    ]
                }]
            }

            async with httpx.AsyncClient(timeout=60) as http:
                resp = await http.post(
                    "https://api.openai.com/v1/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {self._openai_key}"},
                )
                resp.raise_for_status()
                text = resp.json()["choices"][0]["message"]["content"]

            # Extract fit_score from JSON at end of response
            fit_score = 85
            try:
                json_part = text[text.rfind("{"):text.rfind("}") + 1]
                fit_score = json.loads(json_part).get("fit_score", 85)
                text = text[:text.rfind("{")].strip()
            except Exception:
                pass

            return text, fit_score
        except Exception as e:
            log.warning(f"[SpaceProvider] GPT-4o Vision failed ({e}), falling back to template")
            return self.ADVISOR_TEMPLATES.get(category, "Product placed in your space."), 85

    async def _llava_advisor(self, room_img, product_img, category) -> tuple[str, int]:
        """Replicate LLAVA-13b advisor (free with Replicate token)."""
        try:
            import replicate
            import base64
            import io as _io
            import asyncio

            def to_b64(img):
                buf = _io.BytesIO()
                img.save(buf, "JPEG", quality=85)
                return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

            prompt = (
                f"Two images: first is a room, second is a {category} product. "
                f"In 2-3 sentences: does the product fit the room aesthetically and proportionally? "
                f"Any sizing concerns? What would you recommend?"
            )

            loop = asyncio.get_event_loop()
            output = await loop.run_in_executor(
                None,
                lambda: replicate.run(
                    "yorickvp/llava-13b:b5f6212d032508382d61ff00469ddda3e32fd8a0e75dc39d8a4191bb742157fb",
                    input={
                        "image": to_b64(room_img),
                        "prompt": prompt,
                        "max_tokens": 200,
                    }
                )
            )
            text = "".join(output) if hasattr(output, "__iter__") else str(output)
            return text.strip(), 80
        except Exception as e:
            log.warning(f"[SpaceProvider] LLAVA failed ({e}), using template")
            return self.ADVISOR_TEMPLATES.get(category, "Product placed in your space."), 80

    async def analyze(
        self,
        room_image: "Image.Image",
        product_image: "Image.Image",
        category: str,
    ) -> dict:
        """
        Full Space Intelligence pipeline.
        Returns: {result_image: PIL.Image, advisor_text: str, fit_score: int}
        """
        import asyncio

        # Step 1: Remove product background
        product_clean = await self.remove_background(product_image)
        if product_clean.mode != "RGBA":
            product_clean = product_clean.convert("RGBA")

        # Step 2: Composite product into room at appropriate scale/position
        mock = MockProvider()
        # Work on RGB copy of room
        room_rgb = room_image.convert("RGB")
        result_image = await mock.generate(room_rgb, product_clean, category)

        # Step 3: AI advisor (run concurrently with nothing to block)
        advisor_text, fit_score = await self.generate_advisor(room_image, product_image, category)

        return {
            "result_image": result_image,
            "advisor_text": advisor_text,
            "fit_score": fit_score,
        }


# ─── Segmind Provider ─────────────────────────────────────────────────────────

class SegmindProvider(AIProvider):
    """
    Try-on via Segmind API.
    Set SEGMIND_API_KEY in .env
    """

    name = "segmind"

    def __init__(self):
        self._api_key = os.environ.get("SEGMIND_API_KEY", "")
        self._endpoint = os.environ.get(
            "SEGMIND_ENDPOINT",
            "https://api.segmind.com/v1/virtual-try-on"
        )

    async def generate(self, user_image, product_image, category, quality_profile="balanced"):
        import httpx
        import base64

        def pil_to_b64(img: Image.Image) -> str:
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=92)
            return base64.b64encode(buf.getvalue()).decode()

        payload = {
            "model_image": pil_to_b64(user_image),
            "cloth_image": pil_to_b64(product_image),
            "category": category,
            "num_inference_steps": 35 if quality_profile == "balanced" else 20,
        }

        async with httpx.AsyncClient(timeout=120) as http:
            resp = await http.post(
                self._endpoint,
                json=payload,
                headers={"x-api-key": self._api_key},
            )
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert("RGB")


# ─── Factory ──────────────────────────────────────────────────────────────────

def get_provider() -> AIProvider:
    provider_map = {
        "mock": MockProvider,
        "replicate": ReplicateProvider,
        "segmind": SegmindProvider,
    }
    cls = provider_map.get(AI_PROVIDER, MockProvider)
    log.info(f"Using AI provider: {cls.__name__}")
    return cls()


# Singleton
_provider: Optional[AIProvider] = None

def provider() -> AIProvider:
    global _provider
    if _provider is None:
        _provider = get_provider()
    return _provider
