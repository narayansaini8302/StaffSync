import os
import io
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from flask import Flask, request, jsonify
from PIL import Image
import face_recognition
from deepface import DeepFace

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BACKEND_URL = os.environ.get("BACKEND_URL", "http://host.docker.internal:4000")
BACKEND_DEVICE_KEY = os.environ.get("BACKEND_DEVICE_KEY", "")
FACES_DIR = Path(os.environ.get("FACES_DIR", "/app/faces"))
MATCH_TOLERANCE = float(os.environ.get("MATCH_TOLERANCE", "0.55"))
LIVENESS_ENABLED = os.environ.get("LIVENESS_ENABLED", "true").lower() == "true"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("face-service")

app = Flask(__name__)
FACES_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_image(file_storage) -> np.ndarray:
    """Read an uploaded file into a numpy RGB array, downscaling if huge."""
    img = Image.open(io.BytesIO(file_storage.read())).convert("RGB")
    max_side = 1200
    if max(img.size) > max_side:
        ratio = max_side / max(img.size)
        img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)))
    return np.array(img)


def _pick_largest_face(image: np.ndarray):
    """Return the largest face location as (top, right, bottom, left), or None."""
    locations = face_recognition.face_locations(image, model="hog")
    if not locations:
        return None

    def area(loc):
        top, right, bottom, left = loc
        return (bottom - top) * (right - left)

    locations.sort(key=area, reverse=True)
    return locations[0]


def _is_live(image: np.ndarray, face_location: tuple, enabled: bool) -> tuple[bool, float, str]:
    """
    Passive anti-spoofing on a padded face crop.
    Returns (is_live, score, reason).
    Fails open (returns True) if the model errors, so we don't break the flow.
    """
    if not enabled:
        return True, 1.0, ""

    top, right, bottom, left = face_location
    pad_h = int((bottom - top) * 0.3)
    pad_w = int((right - left) * 0.3)
    y1 = max(0, top - pad_h)
    y2 = min(image.shape[0], bottom + pad_h)
    x1 = max(0, left - pad_w)
    x2 = min(image.shape[1], right + pad_w)
    crop = image[y1:y2, x1:x2]

    try:
        result = DeepFace.extract_faces(
            img_path=crop,
            anti_spoofing=True,
            enforce_detection=False,
            detector_backend="skip",
        )
        if not result:
            return True, 1.0, ""
        face = result[0]
        is_real = bool(face.get("is_real", True))
        score = float(face.get("antispoof_score", 1.0))
        if not is_real:
            return (
                False,
                score,
                "Liveness check failed. Please look directly at the camera with good lighting. "
                "Do not use a photo or screen.",
            )
        return True, score, ""
    except Exception as e:
        log.warning("Liveness check error (non-fatal): %s", e)
        return True, 1.0, ""


def _encode_face_at(image: np.ndarray, location: tuple) -> Optional[np.ndarray]:
    """Encode exactly the given face location."""
    encodings = face_recognition.face_encodings(image, known_face_locations=[location])
    return encodings[0] if encodings else None


def _save_embedding(employee_id: str, embedding: np.ndarray) -> str:
    path = FACES_DIR / f"{employee_id}.npy"
    np.save(path, embedding)
    return str(path)


def _load_embedding(employee_id: str) -> Optional[np.ndarray]:
    path = FACES_DIR / f"{employee_id}.npy"
    if not path.exists():
        return None
    return np.load(path)


def _list_all_embeddings() -> dict:
    result = {}
    for p in FACES_DIR.glob("*.npy"):
        try:
            result[p.stem] = np.load(p)
        except Exception as e:
            log.warning("Failed to load %s: %s", p, e)
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    count = len(list(FACES_DIR.glob("*.npy")))
    return jsonify({
        "status": "ok",
        "enrolled": count,
        "backend": BACKEND_URL,
        "tolerance": MATCH_TOLERANCE,
        "liveness": LIVENESS_ENABLED,
    })


@app.post("/enroll")
def enroll():
    """Enroll or update an employee's face embedding.
    Form fields:
      - employeeId: uuid of the employee
      - file: image (multipart)
    """
    if "file" not in request.files:
        return jsonify({"error": "missing file"}), 400

    employee_id = request.form.get("employeeId")
    if not employee_id:
        return jsonify({"error": "missing employeeId"}), 400

    image = _read_image(request.files["file"])
    face_location = _pick_largest_face(image)
    if not face_location:
        return jsonify({"error": "no face detected"}), 422

    embedding = _encode_face_at(image, face_location)
    if embedding is None:
        return jsonify({"error": "no face detected"}), 422

    _save_embedding(employee_id, embedding)
    log.info("Enrolled %s", employee_id)

    return jsonify({
        "employeeId": employee_id,
        "embedding": embedding.tolist(),
        "dimensions": len(embedding),
    })


@app.post("/recognize")
def recognize():
    """Recognize a face from an uploaded image, with liveness check.
    Form fields:
      - file: image (multipart)
      - skip_liveness: "1" to skip liveness (used by internal enrollment flows)
    """
    if "file" not in request.files:
        return jsonify({"error": "missing file"}), 400

    image = _read_image(request.files["file"])
    face_location = _pick_largest_face(image)
    if not face_location:
        return jsonify({"error": "no face detected"}), 422

    # 1. Liveness check
    skip = request.form.get("skip_liveness") == "1"
    is_live, live_score, live_reason = _is_live(
        image, face_location, enabled=LIVENESS_ENABLED and not skip
    )
    if not is_live:
        return jsonify({
            "matched": False,
            "reason": "liveness_failed",
            "error": live_reason,
            "livenessScore": live_score,
        }), 200

    # 2. Compute embedding for the same face
    unknown = _encode_face_at(image, face_location)
    if unknown is None:
        return jsonify({"error": "no face detected"}), 422

    # 3. Match against enrolled faces
    known = _list_all_embeddings()
    if not known:
        return jsonify({"error": "no enrolled faces"}), 404

    ids = list(known.keys())
    matrix = np.array([known[i] for i in ids])

    distances = face_recognition.face_distance(matrix, unknown)
    best_idx = int(np.argmin(distances))
    best_id = ids[best_idx]
    best_distance = float(distances[best_idx])

    if best_distance > MATCH_TOLERANCE:
        return jsonify({
            "matched": False,
            "bestGuess": best_id,
            "distance": best_distance,
            "reason": "distance above tolerance",
        }), 200

    confidence = round(1.0 - best_distance, 4)

    return jsonify({
        "matched": True,
        "employeeId": best_id,
        "distance": best_distance,
        "confidence": confidence,
        "livenessScore": live_score,
    })


@app.delete("/faces/<employee_id>")
def delete_face(employee_id: str):
    path = FACES_DIR / f"{employee_id}.npy"
    if path.exists():
        path.unlink()
        return jsonify({"ok": True})
    return jsonify({"error": "not found"}), 404


# ---------------------------------------------------------------------------
# Entry (also runnable directly for dev)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)