"""
Selfie Quality Gate — client-side-like checks for uploaded selfies
Validates: resolution, blur, brightness, face presence (OpenCV Haar cascade)
Returns: QualityResult(ok, reason, metrics)
"""
import io
import logging
from typing import NamedTuple
from PIL import Image, ImageFilter
import numpy as np

log = logging.getLogger("tryiton.quality_gate")

MIN_RESOLUTION  = (400, 400)   # px
MIN_BRIGHTNESS  = 40           # avg pixel value (0-255)
MAX_BRIGHTNESS  = 210          # too blown out
MIN_SHARPNESS   = 80           # Laplacian variance threshold
FACE_FRAC_MIN   = 0.04         # face bbox must be ≥4 % of image area


class QualityResult(NamedTuple):
    ok: bool
    reason: str | None
    metrics: dict


# ─── OpenCV face detector (lazy-loaded) ───────────────────────────────────────

_face_cascade = None

def _get_face_cascade():
    """Load OpenCV Haar cascade once, returns None if cv2 not available."""
    global _face_cascade
    if _face_cascade is not None:
        return _face_cascade
    try:
        import cv2
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _face_cascade = cv2.CascadeClassifier(cascade_path)
        log.info("OpenCV face cascade loaded")
    except Exception as e:
        log.warning(f"OpenCV not available — face detection disabled: {e}")
        _face_cascade = None
    return _face_cascade


def _detect_face(img: Image.Image) -> tuple[bool, str]:
    """
    Returns (face_found: bool, detail_str: str).
    Falls back to True if OpenCV is unavailable (non-blocking).
    """
    cascade = _get_face_cascade()
    if cascade is None:
        return True, "skipped (no opencv)"

    try:
        import cv2
        # Downscale for speed
        small = img.resize((640, int(img.height * 640 / img.width)), Image.LANCZOS)
        arr = np.array(small.convert("L"))
        faces = cascade.detectMultiScale(arr, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        if len(faces) == 0:
            return False, "no face detected"
        # Largest face
        w_img, h_img = small.size
        areas = [w * h for (_, _, w, h) in faces]
        max_frac = max(areas) / (w_img * h_img)
        if max_frac < FACE_FRAC_MIN:
            return False, f"face too small ({max_frac:.1%} of frame)"
        return True, f"{len(faces)} face(s) detected, largest={max_frac:.1%}"
    except Exception as e:
        log.warning(f"Face detection error: {e}")
        return True, f"detection error (skipped): {e}"


# ─── Main quality check ───────────────────────────────────────────────────────

def check_selfie_quality(image_bytes: bytes) -> QualityResult:
    """
    Returns QualityResult(ok, rejection_reason_or_None, metrics_dict).
    Also accepts the old-style call site that unpacks 3 values (backwards-compat).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        metrics: dict = {"width": w, "height": h}

        # 1. Resolution
        if w < MIN_RESOLUTION[0] or h < MIN_RESOLUTION[1]:
            return QualityResult(
                False,
                f"Image too small ({w}x{h}). Minimum: {MIN_RESOLUTION[0]}x{MIN_RESOLUTION[1]}.",
                metrics,
            )

        # 2. Brightness
        arr = np.array(img.resize((128, 128)), dtype=np.float32)
        brightness = float(arr.mean())
        metrics["brightness"] = round(brightness, 1)
        if brightness < MIN_BRIGHTNESS:
            return QualityResult(False, "Image is too dark. Please use better lighting.", metrics)
        if brightness > MAX_BRIGHTNESS:
            return QualityResult(False, "Image is too bright / overexposed.", metrics)

        # 3. Sharpness (Laplacian variance)
        gray = img.convert("L").resize((256, 256))
        lp = gray.filter(ImageFilter.FIND_EDGES)
        lp_arr = np.array(lp, dtype=np.float32)
        sharpness = float(np.var(lp_arr))
        metrics["sharpness"] = round(sharpness, 1)
        if sharpness < MIN_SHARPNESS:
            return QualityResult(False, "Image is too blurry. Please take a sharper photo.", metrics)

        # 4. Aspect ratio hint
        if w > h * 2.0:
            return QualityResult(
                False,
                "Image looks like a landscape photo. Please use a portrait-oriented photo.",
                metrics,
            )

        # 5. Face detection
        face_ok, face_detail = _detect_face(img)
        metrics["face_check"] = face_detail
        if not face_ok:
            return QualityResult(
                False,
                "No face detected in the photo. Please upload a clear selfie with your face visible.",
                metrics,
            )

        return QualityResult(True, None, metrics)

    except Exception as e:
        log.warning(f"Quality check failed with exception: {e}")
        return QualityResult(False, "Could not process image. Please try a different photo.", {})


def check_product_image(image_bytes: bytes) -> tuple[bool, str | None]:
    """Basic sanity check for product images."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size
        if w < 100 or h < 100:
            return False, "Product image too small."
        return True, None
    except Exception:
        return False, "Could not read product image."

