"""Pydantic schemas mirroring the Phase 2 API contract."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

RoutingStatus = Literal[
    "HIGH_CONFIDENCE", "REVIEW_REQUIRED", "ADDITIONAL_INPUT_REQUIRED", "EXPERT_REQUIRED"
]


class Location(BaseModel):
    latitude: float | None = None
    longitude: float | None = None


class CropRequest(BaseModel):
    nitrogen: float = Field(..., description="N, kg/ha")
    phosphorus: float = Field(..., description="P, kg/ha")
    potassium: float = Field(..., description="K, kg/ha")
    temperature: float = Field(..., description="degrees Celsius")
    humidity: float = Field(..., description="relative humidity, %")
    ph: float = Field(..., description="soil pH, 0-14")
    rainfall: float = Field(..., description="mm")
    location: Location | None = None


class AIResponse(BaseModel):
    """The shared AI response contract from Phase 2, section 5.

    `predictionId` is intentionally absent: Phase 3 states the backend owns
    prediction IDs. This service returns the model's evidence; Express assigns
    the ID and persists it.
    """
    recommendedCrop: str | None = None
    disease: str | None = None
    crop: str | None = None
    confidence: float
    margin: float
    modelVersion: str
    routingStatus: RoutingStatus
    reason: str
    message: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: str
    details: list[str] | str | None = None


class HealthResponse(BaseModel):
    status: str
    cropModel: str | None = None
    diseaseModel: str | None = None
    errors: list[str] = Field(default_factory=list)
