"""
=============================================================
  SEHAS — Smart Emergency Health Alert System
  api.py — FastAPI Prediction Server
=============================================================
  Run with:
    uv run uvicorn api:app --reload --port 8000

  Swagger docs:
    http://127.0.0.1:8000/docs
=============================================================
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml.predict import SEHASPredictor

# ─────────────────────────────────────────────────
# Startup / Shutdown — load model once
# ─────────────────────────────────────────────────
predictor: SEHASPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    print("🚀 Loading SEHAS LSTM model...")
    predictor = SEHASPredictor()
    print("✅ API ready!")
    yield
    predictor = None
    print("🔴 Model unloaded.")


# ─────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────
app = FastAPI(
    title       = "SEHAS Health Alert API",
    description = (
        "**Smart Emergency Health Alert System**\n\n"
        "LSTM-based real-time anomaly detection.\n"
        "Send sensor readings → receive an emergency risk score instantly."
    ),
    version     = "1.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ─────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────
class SensorInput(BaseModel):
    heart_rate : float = Field(..., ge=0,  le=300, example=72.0,  description="Heart rate in BPM (Camera PPG)")
    acc_mean   : float = Field(..., ge=0,          example=1.05,  description="Mean acceleration magnitude — sqrt(x²+y²+z²)")
    acc_std    : float = Field(..., ge=0,          example=0.12,  description="Std deviation of acceleration (motion variability)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"summary": "Normal",   "value": {"heart_rate": 72,  "acc_mean": 1.05, "acc_std": 0.10}},
                {"summary": "Fall",     "value": {"heart_rate": 52,  "acc_mean": 0.60, "acc_std": 0.85}},
                {"summary": "Critical", "value": {"heart_rate": 38,  "acc_mean": 0.50, "acc_std": 0.95}},
            ]
        }
    }


class PredictionResponse(BaseModel):
    score      : float = Field(..., description="Model output: 0.0 (safe) → 1.0 (emergency)")
    risk_level : str   = Field(..., description="NORMAL | MEDIUM | CRITICAL")
    alert      : bool  = Field(..., description="True if emergency alert must be triggered")
    message    : str   = Field(..., description="Human-readable status")


class BatchPredictionItem(BaseModel):
    input      : SensorInput
    score      : float
    risk_level : str
    alert      : bool
    message    : str


class BatchResponse(BaseModel):
    count       : int
    predictions : list[BatchPredictionItem]


# ─────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────
@app.get("/", tags=["Status"])
def root():
    """API status check."""
    return {"status": "online", "service": "SEHAS Health Alert API", "version": "1.0.0"}


@app.get("/health", tags=["Status"])
def health():
    """Check if model is loaded and API is ready to serve."""
    ready = predictor is not None
    return {"model_loaded": ready, "status": "ready" if ready else "loading"}


@app.post("/predict", response_model=PredictionResponse, tags=["Prediction"])
def predict(data: SensorInput):
    """
    ## Run Emergency Risk Prediction

    Send a **single sensor snapshot** and receive an instant risk assessment.

    | Field | Unit | Source |
    |---|---|---|
    | `heart_rate` | bpm | Camera PPG |
    | `acc_mean` | g | Accelerometer (mean magnitude) |
    | `acc_std` | g | Accelerometer (motion variability) |

    ### Risk Levels
    | Score | Level | Action |
    |---|---|---|
    | < 0.4 | NORMAL | No action |
    | 0.4–0.7 | MEDIUM | Monitor |
    | > 0.7 | CRITICAL | 🚨 Alert |
    """
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet. Try again shortly.")
    try:
        result = predictor.predict(
            heart_rate=data.heart_rate,
            acc_mean=data.acc_mean,
            acc_std=data.acc_std,
        )
        return PredictionResponse(
            score      = round(result.score, 4),
            risk_level = result.risk_level,
            alert      = result.alert,
            message    = result.message,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


@app.post("/predict/batch", response_model=BatchResponse, tags=["Prediction"])
def predict_batch(readings: list[SensorInput]):
    """
    ## Batch Prediction

    Send **up to 100 sensor readings** at once.
    Useful for replaying buffered offline readings when connectivity resumes.
    """
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")
    if len(readings) > 100:
        raise HTTPException(status_code=400, detail="Max 100 readings per batch.")

    results = []
    for data in readings:
        result = predictor.predict(data.heart_rate, data.acc_mean, data.acc_std)
        results.append(BatchPredictionItem(
            input      = data,
            score      = round(result.score, 4),
            risk_level = result.risk_level,
            alert      = result.alert,
            message    = result.message,
        ))

    return BatchResponse(count=len(results), predictions=results)
