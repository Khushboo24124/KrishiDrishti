"""AgriSense AI service (FastAPI).

Implements the AI half of the Phase 2 contract. The Express backend proxies
to these endpoints, assigns prediction IDs, and persists ModelOutputs.

Design rules taken from the SDLC docs and enforced here:
  * Models load once at startup; if an artifact is missing, /health reports
    "degraded" and the affected endpoint returns 503 model_unavailable.
  * No fabricated or hardcoded predictions in this path, ever.
  * Every response carries modelVersion, confidence, and a routingStatus with
    a machine-readable reason.

Run:
    uvicorn agrisense.service.main:app --reload --port 8001
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from agrisense.config import MODEL_VERSION, routing_config
from agrisense.crop.predict import CropPredictor
from agrisense.disease.predict import DiseasePredictor
from agrisense.service.schemas import (
    AIResponse, CropRequest, ErrorResponse, HealthResponse,
)

log = logging.getLogger("agrisense")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

STATE: dict[str, object] = {"crop": None, "disease": None, "errors": []}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load artifacts once. Record, but do not hide, load failures."""
    errors: list[str] = []
    try:
        STATE["crop"] = CropPredictor()
        log.info("crop model loaded: %s", STATE["crop"].model_version)
    except Exception as exc:
        errors.append(f"crop: {exc}")
        log.error("crop model unavailable: %s", exc)
    try:
        STATE["disease"] = DiseasePredictor()
        log.info("disease model loaded: %s", STATE["disease"].model_version)
    except Exception as exc:
        errors.append(f"disease: {exc}")
        log.error("disease model unavailable: %s", exc)
    STATE["errors"] = errors
    routing_config()  # fail fast on a malformed config
    yield


app = FastAPI(
    title="AgriSense AI Service",
    version=MODEL_VERSION,
    description="Crop recommendation and leaf disease analysis with confidence routing.",
    lifespan=lifespan,
)


@app.get("/api/v1/health", response_model=HealthResponse)
def health() -> HealthResponse:
    crop, disease = STATE.get("crop"), STATE.get("disease")
    ok = crop is not None and disease is not None
    return HealthResponse(
        status="ok" if ok else "degraded",
        cropModel=getattr(crop, "model_version", None),
        diseaseModel=getattr(disease, "model_version", None),
        errors=list(STATE.get("errors") or []),
    )


@app.post(
    "/api/v1/ai/recommend/crop",
    response_model=AIResponse,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def recommend_crop(req: CropRequest):
    predictor = STATE.get("crop")
    if predictor is None:
        return JSONResponse(
            status_code=503,
            content={"error": "model_unavailable",
                     "details": "Crop model artifact is not loaded."},
        )
    result = predictor.predict(req.model_dump(exclude={"location"}))
    if "error" in result:
        return JSONResponse(
            status_code=400,
            content={"error": "validation_error", "details": result["details"]},
        )
    return AIResponse(**result)


@app.post(
    "/api/v1/ai/analyze/disease",
    response_model=AIResponse,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def analyze_disease(image: UploadFile = File(...)):
    predictor = STATE.get("disease")
    if predictor is None:
        return JSONResponse(
            status_code=503,
            content={"error": "model_unavailable",
                     "details": "Disease model artifact is not loaded."},
        )
    raw = await image.read()
    if not raw:
        return JSONResponse(
            status_code=400,
            content={"error": "upload_invalid", "details": "Empty file."},
        )
    try:
        result = predictor.predict_bytes(raw)
    except ValueError as exc:
        return JSONResponse(
            status_code=400, content={"error": "upload_invalid", "details": str(exc)}
        )
    return AIResponse(**result)
