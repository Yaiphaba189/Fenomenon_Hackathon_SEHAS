"""
=============================================================
  SEHAS — Smart Emergency Health Alert System
  api.py — FastAPI Prediction Server
=============================================================
  Run with:
    uv run uvicorn api:app --host 0.0.0.0 --port 8000

  Swagger docs:
    http://127.0.0.1:8000/docs
=============================================================
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager, suppress
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from backend.ml.predict import SEHASPredictor
from backend.services import database as db
from backend.services.models import Patient
from backend.services.notifications import NotificationService

load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("sehas.api")


def _env_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: Optional[list[str]] = None) -> list[str]:
    raw_value = os.getenv(name)
    if raw_value is None:
        return list(default or [])
    return [item.strip() for item in raw_value.split(",") if item.strip()]


PORT = int(os.getenv("PORT", 8000))
DEBUG = _env_bool("DEBUG", default=False)
ALERT_SAFETY_WINDOW_SECONDS = int(os.getenv("ALERT_SAFETY_WINDOW_SECONDS", "10"))
ALERT_ESCALATION_SECONDS = int(os.getenv("ALERT_ESCALATION_SECONDS", "120"))
ALERT_WORKER_POLL_SECONDS = max(1, int(os.getenv("ALERT_WORKER_POLL_SECONDS", "2")))

DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
ALLOWED_ORIGINS = _csv_env("ALLOWED_ORIGINS", DEFAULT_DEV_ORIGINS if DEBUG else [])
ALLOW_CREDENTIALS = "*" not in ALLOWED_ORIGINS

API_KEYS = _csv_env("SEHAS_API_KEYS")
single_api_key = os.getenv("SEHAS_API_KEY", "").strip()
if not API_KEYS and single_api_key:
    API_KEYS = [single_api_key]
if not API_KEYS and DEBUG:
    API_KEYS = ["dev-only-change-me"]

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(api_key: Optional[str] = Security(api_key_header)) -> str:
    if not API_KEYS:
        logger.error("Request rejected because API keys are not configured.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server authentication is not configured.",
        )

    if api_key and any(secrets.compare_digest(api_key, expected) for expected in API_KEYS):
        return api_key

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "ApiKey"},
    )


def validate_runtime_configuration() -> None:
    if not ALLOWED_ORIGINS:
        raise RuntimeError("ALLOWED_ORIGINS must be configured before starting the API.")
    if not DEBUG and "*" in ALLOWED_ORIGINS:
        raise RuntimeError("Wildcard CORS origins are not allowed when DEBUG=false.")
    if not API_KEYS:
        raise RuntimeError("At least one API key must be configured.")


predictor: Optional[SEHASPredictor] = None
notification_service: Optional[NotificationService] = None
alert_worker_task: Optional[asyncio.Task] = None


def _normalize_snapshot(snapshot: Any) -> dict[str, Any]:
    if isinstance(snapshot, dict):
        return snapshot
    if isinstance(snapshot, str):
        try:
            loaded = json.loads(snapshot)
            if isinstance(loaded, dict):
                return loaded
        except json.JSONDecodeError:
            logger.warning("Could not decode alert sensor snapshot JSON.")
    return {}


def _build_maps_link(snapshot: dict[str, Any]) -> str:
    lat = snapshot.get("gps_lat")
    lng = snapshot.get("gps_lng")
    if lat is None or lng is None:
        return ""
    return f"\nLocation: https://maps.google.com/?q={lat},{lng}"


def _compose_dispatch_message(alert_record: dict[str, Any], snapshot: dict[str, Any]) -> tuple[str, str]:
    patient_name = snapshot.get("patient_name") or "Patient"
    alert_type = alert_record.get("type")
    if alert_type == "voice_sos":
        return (
            "VOICE SOS TRIGGERED",
            f"Emergency! {patient_name} triggered voice SOS.{_build_maps_link(snapshot)}",
        )
    if alert_type == "batch_detection":
        return (
            "HEALTH EMERGENCY DETECTED (Batch)",
            f"{patient_name} requires immediate assistance.{_build_maps_link(snapshot)}",
        )
    return (
        "HEALTH EMERGENCY DETECTED",
        f"{patient_name} requires immediate assistance.{_build_maps_link(snapshot)}",
    )


def _compose_escalation_message(alert_record: dict[str, Any], snapshot: dict[str, Any]) -> tuple[str, str]:
    patient_name = snapshot.get("patient_name") or "Patient"
    alert_type = alert_record.get("type")
    if alert_type == "voice_sos":
        return (
            "VOICE SOS NOT ACKNOWLEDGED",
            f"Urgent: {patient_name}'s voice SOS has not been acknowledged.",
        )
    return (
        "URGENT: NO RESPONSE",
        f"Critical: {patient_name} has not been reached. Alerting secondary contacts.",
    )


def _dispatch_alert(alert_record: dict[str, Any]) -> None:
    snapshot = _normalize_snapshot(alert_record.get("sensor_snapshot"))
    patient_id = str(alert_record.get("patient_id") or "")
    token = snapshot.get("device_token")

    if notification_service:
        notification_service.trigger_in_app_alert(
            patient_id=patient_id,
            alert_type=str(alert_record.get("type") or "emergency"),
            severity=str(alert_record.get("severity") or "critical"),
        )

    if notification_service and token:
        title, body = _compose_dispatch_message(alert_record, snapshot)
        notification_service.send_push_notification(
            token=token,
            title=title,
            body=body,
            data={"alert_id": str(alert_record["id"]), "type": str(alert_record.get("type") or "emergency")},
        )


def _escalate_alert(alert_record: dict[str, Any]) -> None:
    snapshot = _normalize_snapshot(alert_record.get("sensor_snapshot"))
    token = snapshot.get("device_token")
    if notification_service and token:
        title, body = _compose_escalation_message(alert_record, snapshot)
        notification_service.send_push_notification(
            token=token,
            title=title,
            body=body,
            data={"alert_id": str(alert_record["id"]), "type": "escalation"},
        )


def process_due_alerts_once() -> dict[str, int]:
    dispatched = 0
    escalated = 0

    for alert in db.get_due_pending_alerts(ALERT_SAFETY_WINDOW_SECONDS):
        claimed = db.claim_alert_for_dispatch(alert["id"])
        if not claimed:
            continue
        _dispatch_alert(claimed)
        dispatched += 1

    for alert in db.get_due_dispatched_alerts(ALERT_ESCALATION_SECONDS):
        claimed = db.claim_alert_for_escalation(alert["id"])
        if not claimed:
            continue
        _escalate_alert(claimed)
        escalated += 1

    return {"dispatched": dispatched, "escalated": escalated}


async def run_alert_worker() -> None:
    while True:
        try:
            result = await asyncio.to_thread(process_due_alerts_once)
            if result["dispatched"] or result["escalated"]:
                logger.info(
                    "Alert worker processed alerts: dispatched=%s escalated=%s",
                    result["dispatched"],
                    result["escalated"],
                )
            await asyncio.sleep(ALERT_WORKER_POLL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Alert worker iteration failed")
            await asyncio.sleep(ALERT_WORKER_POLL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor, notification_service, alert_worker_task

    validate_runtime_configuration()
    logger.info("Applying database schema...")
    db.ensure_database_schema()

    logger.info("Loading SEHAS LSTM model...")
    predictor = SEHASPredictor()

    logger.info("Initializing notification service...")
    notification_service = NotificationService()

    if not DEBUG and not notification_service.is_ready:
        raise RuntimeError("Firebase notifications must be configured before production startup.")

    alert_worker_task = asyncio.create_task(run_alert_worker())
    logger.info("API ready.")

    try:
        yield
    finally:
        if alert_worker_task:
            alert_worker_task.cancel()
            with suppress(asyncio.CancelledError):
                await alert_worker_task
        predictor = None
        notification_service = None
        alert_worker_task = None
        logger.info("Model unloaded.")


app = FastAPI(
    title="SEHAS Health Alert API",
    description=(
        "**Smart Emergency Health Alert System**\n\n"
        "LSTM-based real-time anomaly detection.\n"
        "Send sensor readings and receive an emergency risk score instantly."
    ),
    version="1.1.0",
    lifespan=lifespan,
    debug=DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)


class SensorInput(BaseModel):
    heart_rate: float = Field(..., ge=0, le=300, example=72.0, description="Heart rate in BPM (Camera PPG)")
    acc_mean: float = Field(..., ge=0, example=1.05, description="Mean acceleration magnitude")
    acc_std: float = Field(..., ge=0, example=0.12, description="Std deviation of acceleration")
    patient_id: Optional[str] = Field(None, example="uuid-goes-here", description="Supabase UUID of the patient")
    patient_name: Optional[str] = Field("Patient", example="John Doe")
    device_token: Optional[str] = Field(None, example="fcm_token_xyz", description="FCM device token")
    gps_lat: Optional[float] = Field(None, example=12.9716)
    gps_lng: Optional[float] = Field(None, example=77.5946)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"summary": "Normal", "value": {"heart_rate": 72, "acc_mean": 1.05, "acc_std": 0.10}},
                {"summary": "Fall", "value": {"heart_rate": 52, "acc_mean": 0.60, "acc_std": 0.85}},
                {"summary": "Critical", "value": {"heart_rate": 38, "acc_mean": 0.50, "acc_std": 0.95}},
            ]
        }
    }


class PredictionResponse(BaseModel):
    score: float = Field(..., description="Model output: 0.0 (safe) to 1.0 (emergency)")
    risk_level: str = Field(..., description="NORMAL | MEDIUM | CRITICAL")
    alert: bool = Field(..., description="True if an emergency alert was queued")
    message: str = Field(..., description="Human-readable status")
    push_sent: bool = Field(False, description="True if a push notification was dispatched immediately")


class BatchPredictionItem(BaseModel):
    input: SensorInput
    score: float
    risk_level: str
    alert: bool
    message: str
    push_sent: bool = Field(False)


class BatchResponse(BaseModel):
    count: int
    predictions: list[BatchPredictionItem]


def _require_loaded_model() -> SEHASPredictor:
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")
    return predictor


def _persist_vitals_if_present(data: SensorInput) -> None:
    if data.patient_id and not db.save_vital_reading(
        patient_id=data.patient_id,
        heart_rate=data.heart_rate,
        acc_mean=data.acc_mean,
        acc_std=data.acc_std,
    ):
        raise HTTPException(status_code=500, detail="Failed to persist vital reading.")


def _queue_alert(data: SensorInput, alert_type: str, severity: str):
    if not data.patient_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="patient_id is required for critical alerts.",
        )

    alert_id = db.create_alert(
        patient_id=data.patient_id,
        type=alert_type,
        severity=severity,
        sensor_snapshot=data.model_dump(),
        gps_lat=data.gps_lat,
        gps_lng=data.gps_lng,
    )
    if not alert_id:
        raise HTTPException(status_code=500, detail="Failed to persist critical alert.")
    return alert_id


@app.get("/", tags=["Status"])
def root():
    return {"status": "online", "service": "SEHAS Health Alert API", "version": "1.1.0"}


@app.get("/health", tags=["Status"])
def health():
    model_ready = predictor is not None
    db_ready = db.check_connection()
    notification_ready = bool(notification_service and notification_service.is_ready)
    ready = model_ready and db_ready and (notification_ready or DEBUG)
    return {
        "status": "ready" if ready else "degraded",
        "model_loaded": model_ready,
        "database_ready": db_ready,
        "notification_ready": notification_ready,
        "worker_running": alert_worker_task is not None and not alert_worker_task.done(),
    }


@app.post(
    "/predict",
    response_model=PredictionResponse,
    tags=["Prediction"],
    dependencies=[Depends(require_api_key)],
)
def predict(data: SensorInput):
    model = _require_loaded_model()

    try:
        result = model.predict(
            heart_rate=data.heart_rate,
            acc_mean=data.acc_mean,
            acc_std=data.acc_std,
        )
        _persist_vitals_if_present(data)

        if result.alert:
            alert_type = "fall" if data.acc_std > 0.5 else "cardiac"
            alert_id = _queue_alert(data, alert_type=alert_type, severity=result.risk_level.lower())
            logger.info("Queued critical alert %s for patient %s", alert_id, data.patient_id)
            message = (
                f"Emergency detected. Safety window active "
                f"({ALERT_SAFETY_WINDOW_SECONDS}s to cancel)."
            )
        else:
            message = result.message

        return PredictionResponse(
            score=round(result.score, 4),
            risk_level=result.risk_level,
            alert=result.alert,
            message=message,
            push_sent=False,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc


@app.post(
    "/predict/batch",
    response_model=BatchResponse,
    tags=["Prediction"],
    dependencies=[Depends(require_api_key)],
)
def predict_batch(readings: list[SensorInput]):
    model = _require_loaded_model()
    if len(readings) > 100:
        raise HTTPException(status_code=400, detail="Max 100 readings per batch.")

    results = []
    for index, data in enumerate(readings):
        result = model.predict(data.heart_rate, data.acc_mean, data.acc_std)
        _persist_vitals_if_present(data)

        if result.alert and not data.patient_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"patient_id is required for critical alerts in batch item {index}.",
            )

        if result.alert:
            alert_type = "batch_detection"
            alert_id = _queue_alert(data, alert_type=alert_type, severity=result.risk_level.lower())
            logger.info("Queued batch critical alert %s for patient %s", alert_id, data.patient_id)
            message = (
                f"Emergency detected. Safety window active "
                f"({ALERT_SAFETY_WINDOW_SECONDS}s to cancel)."
            )
        else:
            message = result.message

        results.append(
            BatchPredictionItem(
                input=data,
                score=round(result.score, 4),
                risk_level=result.risk_level,
                alert=result.alert,
                message=message,
                push_sent=False,
            )
        )

    return BatchResponse(count=len(results), predictions=results)


@app.post("/patients", tags=["Management"], dependencies=[Depends(require_api_key)])
def register_patient(patient: Patient):
    patient_id = patient.id or str(uuid.uuid4())
    success = db.upsert_patient(
        patient_id=patient_id,
        name=patient.name,
        age=patient.age,
        medical_history=patient.medical_history,
        contacts=[contact.model_dump() for contact in patient.emergency_contacts],
        safe_zone_radius=patient.safe_zone_radius,
        baseline_hr=patient.baseline_hr,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save patient profile.")
    return {"status": "success", "message": "Patient profile updated.", "patient_id": patient_id}


@app.get("/alerts/{patient_id}", tags=["Management"], dependencies=[Depends(require_api_key)])
def get_history(patient_id: str, limit: int = Query(20, ge=1, le=100)):
    history = db.get_alert_history(patient_id, limit)
    return {"patient_id": patient_id, "count": len(history), "alerts": history}


@app.post("/alerts/{alert_id}/cancel", tags=["Management"], dependencies=[Depends(require_api_key)])
def cancel_alert(alert_id: str):
    if db.cancel_alert_if_pending(alert_id):
        return {"status": "success", "message": "Alert cancelled. Caregivers will not be notified."}

    current = db.get_alert_status(alert_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    raise HTTPException(status_code=400, detail=f"Alert cannot be cancelled in state: {current}")


@app.post("/alerts/{alert_id}/acknowledge", tags=["Management"], dependencies=[Depends(require_api_key)])
def acknowledge_alert(alert_id: str, caregiver_name: str = Query("Rescuer", min_length=1, max_length=100)):
    if db.acknowledge_alert(alert_id, caregiver_name):
        return {"status": "success", "message": f"Alert acknowledged by {caregiver_name}."}

    current = db.get_alert_status(alert_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    raise HTTPException(status_code=400, detail=f"Alert cannot be acknowledged in state: {current}")


@app.post("/voice-sos", tags=["Prediction"], dependencies=[Depends(require_api_key)])
def voice_sos(data: SensorInput):
    _persist_vitals_if_present(data)
    alert_id = _queue_alert(data, alert_type="voice_sos", severity="critical")
    claimed = db.claim_alert_for_dispatch(alert_id)
    if claimed:
        _dispatch_alert(claimed)

    return {"status": "alert_dispatched", "message": "Voice SOS processed.", "alert_id": str(alert_id)}
