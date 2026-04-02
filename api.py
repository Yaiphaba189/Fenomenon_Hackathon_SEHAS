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
from typing import Optional, List
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

PORT = int(os.getenv("PORT", 8000))
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

from backend.ml.predict import SEHASPredictor
from backend.services.notifications import NotificationService
from backend.services import database as db

# ─────────────────────────────────────────────────
# Global Services
# ─────────────────────────────────────────────────
predictor: SEHASPredictor | None = None
notification_service: NotificationService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor, notification_service
    print("🚀 Loading SEHAS LSTM model...")
    predictor = SEHASPredictor()
    
    print("📱 Initializing Notification Service...")
    notification_service = NotificationService()
    
    print("✅ API ready!")
    yield
    predictor = None
    notification_service = None
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
    debug       = DEBUG,
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
    heart_rate   : float         = Field(..., ge=0,  le=300, example=72.0,  description="Heart rate in BPM (Camera PPG)")
    acc_mean     : float         = Field(..., ge=0,          example=1.05,  description="Mean acceleration magnitude — sqrt(x²+y²+z²)")
    acc_std      : float         = Field(..., ge=0,          example=0.12,  description="Std deviation of acceleration (motion variability)")
    patient_id   : Optional[str] = Field(None,      example="uuid-goes-here", description="Supabase UUID of the patient")
    patient_name : Optional[str] = Field("Patient", example="John Doe")
    device_token : Optional[str] = Field(None,      example="fcm_token_xyz",  description="FCM token for push notifications")
    gps_lat      : Optional[float] = Field(None,    example=12.9716)
    gps_lng      : Optional[float] = Field(None,    example=77.5946)

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
    score       : float = Field(..., description="Model output: 0.0 (safe) → 1.0 (emergency)")
    risk_level  : str   = Field(..., description="NORMAL | MEDIUM | CRITICAL")
    alert       : bool  = Field(..., description="True if emergency alert must be triggered")
    message     : str   = Field(..., description="Human-readable status")
    push_sent   : bool  = Field(False, description="True if a push notification was dispatched")


class BatchPredictionItem(BaseModel):
    input      : SensorInput
    score      : float
    risk_level : str
    alert       : bool
    message     : str
    push_sent   : bool  = Field(False)


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
        # ─────────────────────────────────────────────────
        # 3. Persistence & Alerts
        # ─────────────────────────────────────────────────
        
        # Log Vitals to DB
        if data.patient_id:
            db.save_vital_reading(
                patient_id = data.patient_id,
                heart_rate = data.heart_rate,
                acc_mean   = data.acc_mean,
                acc_std    = data.acc_std
            )

        # Trigger Notifications & Store Alert for CRITICAL results
        push_sent = False
        alert_db_id = None
        
        if result.alert:
            # Save Alert to DB
            if data.patient_id:
                alert_db_id = db.create_alert(
                    patient_id      = data.patient_id,
                    type            = "fall" if data.acc_std > 0.5 else "cardiac",
                    severity        = result.risk_level.lower(),
                    sensor_snapshot = data.model_dump(),
                    gps_lat         = data.gps_lat,
                    gps_lng         = data.gps_lng
                )

            # 1. In-App Alert (Console Log for now)
            if notification_service:
                notification_service.trigger_in_app_alert(
                    patient_id = data.patient_id or data.patient_name or "Unknown",
                    alert_type = "emergency",
                    severity   = result.risk_level.lower()
                )
                
                # 2. Push Notification (FCM)
                if data.device_token:
                    maps_link = f"\n📍 Location: https://maps.google.com/?q={data.gps_lat},{data.gps_lng}" if data.gps_lat else ""
                    push_sent = notification_service.send_push_notification(
                        token = data.device_token,
                        title = "🚨 HEALTH EMERGENCY DETECTED",
                        body  = f"{data.patient_name or 'Patient'} requires immediate assistance! ({result.message}){maps_link}",
                        data  = {"score": str(result.score), "risk": result.risk_level, "alert_id": str(alert_db_id or "")}
                    )

        return PredictionResponse(
            score      = round(result.score, 4),
            risk_level = result.risk_level,
            alert      = result.alert,
            message    = result.message,
            push_sent  = push_sent,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


@app.post("/predict/batch", response_model=BatchResponse, tags=["Prediction"])
def predict_batch(readings: List[SensorInput]):
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
        
        # Trigger Notifications & Persistence for CRITICAL results in batch
        push_sent = False
        if result.alert:
            # Save Vitals & Alert
            if data.patient_id:
                db.save_vital_reading(data.patient_id, data.heart_rate, data.acc_mean, data.acc_std)
                db.create_alert(
                    patient_id      = data.patient_id,
                    type            = "batch_detection",
                    severity        = result.risk_level.lower(),
                    sensor_snapshot = data.model_dump(),
                    gps_lat         = data.gps_lat,
                    gps_lng         = data.gps_lng
                )

            if notification_service and data.device_token:
                push_sent = notification_service.send_push_notification(
                    token=data.device_token,
                    title="🚨 HEALTH EMERGENCY DETECTED (Batch)",
                    body=f"{data.patient_name or 'Patient'} requires help! ({result.message})",
                    data={"score": str(result.score), "risk": result.risk_level}
                )

        results.append(BatchPredictionItem(
            input      = data,
            score      = round(result.score, 4),
            risk_level = result.risk_level,
            alert      = result.alert,
            message    = result.message,
            push_sent  = push_sent,
        ))

    return BatchResponse(count=len(results), predictions=results)


# ─────────────────────────────────────────────────
# Patient & Alert Management (Flutter Integration)
# ─────────────────────────────────────────────────

from backend.services.models import Patient, Alert as AlertModel

@app.post("/patients", tags=["Management"])
def register_patient(patient: Patient):
    """Register or update a patient profile."""
    success = db.upsert_patient(
        patient_id      = patient.id or str(uuid.uuid4()),
        name            = patient.name,
        age             = patient.age,
        medical_history = patient.medical_history,
        contacts        = [c.model_dump() for c in patient.emergency_contacts]
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save patient profile.")
    return {"status": "success", "message": "Patient profile updated."}


@app.get("/alerts/{patient_id}", tags=["Management"])
def get_history(patient_id: str, limit: int = 20):
    """Fetch emergency alert history for the dashboard/app."""
    history = db.get_alert_history(patient_id, limit)
    return {"patient_id": patient_id, "count": len(history), "alerts": history}


@app.post("/voice-sos", tags=["Prediction"])
def voice_sos(data: SensorInput):
    """
    Dedicated endpoint for Voice-Triggered SOS ("Help!", "Bachao").
    Forces a Critical alert immediately.
    """
    if notification_service and data.device_token:
        notification_service.send_push_notification(
            token = data.device_token,
            title = "🎙️ VOICE SOS TRIGGERED",
            body  = f"EMERGENCY! {data.patient_name or 'Patient'} shouted for help!",
            data  = {"type": "voice_sos", "severity": "critical"}
        )
    
    # Log the alert
    if data.patient_id:
        db.create_alert(
            patient_id      = data.patient_id,
            type            = "voice_sos",
            severity        = "critical",
            sensor_snapshot = data.model_dump(),
            gps_lat         = data.gps_lat,
            gps_lng         = data.gps_lng
        )

    return {"status": "alert_dispatched", "message": "Voice SOS processed."}
