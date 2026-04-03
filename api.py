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
import hashlib
import json
import logging
import math
import os
import secrets
import uuid
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.ml.predict import PredictionResult, SEHASPredictor
from backend.services import database as db
from backend.services.models import Patient, PatientRegister, PatientLogin
from backend.services.notifications import NotificationService
from backend.services.realtime import AlertEventBroker

load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("sehas.api")

BASE_DIR = Path(__file__).resolve().parent
CAREGIVER_UI_DIR = BASE_DIR / "caregiver_dashboard"


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
    "http://localhost:8081",
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
event_broker = AlertEventBroker()
main_loop: asyncio.AbstractEventLoop | None = None


def _validate_api_key_value(api_key: Optional[str]) -> str:
    if not API_KEYS:
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


def require_api_key(api_key: Optional[str] = Security(api_key_header)) -> str:
    return _validate_api_key_value(api_key)


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


def _normalize_contacts(raw_contacts: Any) -> list[dict[str, Any]]:
    if isinstance(raw_contacts, list):
        return [contact for contact in raw_contacts if isinstance(contact, dict)]
    if isinstance(raw_contacts, str):
        try:
            parsed = json.loads(raw_contacts)
            if isinstance(parsed, list):
                return [contact for contact in parsed if isinstance(contact, dict)]
        except json.JSONDecodeError:
            logger.warning("Could not decode emergency contacts JSON.")
    return []


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


def _publish_event(event_type: str, payload: dict[str, Any]) -> None:
    if main_loop is None or main_loop.is_closed():
        return
    asyncio.run_coroutine_threadsafe(
        event_broker.publish({"type": event_type, "payload": payload}),
        main_loop,
    )


def _alert_event_payload(alert_record: dict[str, Any]) -> dict[str, Any]:
    snapshot = _normalize_snapshot(alert_record.get("sensor_snapshot"))
    return {
        "id": str(alert_record.get("id")),
        "patient_id": str(alert_record.get("patient_id") or ""),
        "patient_name": snapshot.get("patient_name"),
        "type": alert_record.get("type"),
        "severity": alert_record.get("severity"),
        "status": alert_record.get("status"),
        "timestamp": str(alert_record.get("timestamp") or ""),
        "gps_lat": alert_record.get("gps_lat") if alert_record.get("gps_lat") is not None else snapshot.get("gps_lat"),
        "gps_lng": alert_record.get("gps_lng") if alert_record.get("gps_lng") is not None else snapshot.get("gps_lng"),
        "message": snapshot.get("message"),
    }


def _log_delivery(alert_id: str, channel: str, recipient: str, success: bool, provider_response: str) -> None:
    db.log_notification_delivery(
        alert_id=alert_id,
        channel=channel,
        recipient=recipient,
        status="sent" if success else "failed",
        provider_response=provider_response if success else None,
        error_message=None if success else provider_response,
    )


def _send_contact_notifications(alert_record: dict[str, Any], title: str, body: str) -> None:
    patient = db.get_patient(alert_record["patient_id"])
    if not patient or not notification_service:
        return

    contacts = _normalize_contacts(patient.get("emergency_contacts"))
    for contact in contacts:
        phone = str(contact.get("phone") or "").strip()
        if not phone:
            continue
        sms_ok, sms_response = notification_service.send_sms_notification(phone, f"{title}\n{body}")
        _log_delivery(str(alert_record["id"]), "sms", phone, sms_ok, sms_response)
        wa_ok, wa_response = notification_service.send_whatsapp_notification(phone, f"{title}\n{body}")
        _log_delivery(str(alert_record["id"]), "whatsapp", phone, wa_ok, wa_response)


def _dispatch_alert(alert_record: dict[str, Any]) -> None:
    snapshot = _normalize_snapshot(alert_record.get("sensor_snapshot"))
    patient_id = str(alert_record.get("patient_id") or "")
    token = snapshot.get("device_token")
    title, body = _compose_dispatch_message(alert_record, snapshot)

    if notification_service:
        notification_service.trigger_in_app_alert(
            patient_id=patient_id,
            alert_type=str(alert_record.get("type") or "emergency"),
            severity=str(alert_record.get("severity") or "critical"),
        )

    if notification_service and token:
        push_sent = notification_service.send_push_notification(
            token=token,
            title=title,
            body=body,
            data={"alert_id": str(alert_record["id"]), "type": str(alert_record.get("type") or "emergency")},
        )
        _log_delivery(str(alert_record["id"]), "push", token, push_sent, "fcm")

    _send_contact_notifications(alert_record, title, body)
    alert_record["status"] = "dispatched"
    _publish_event("alert.dispatched", _alert_event_payload(alert_record))


def _escalate_alert(alert_record: dict[str, Any]) -> None:
    snapshot = _normalize_snapshot(alert_record.get("sensor_snapshot"))
    token = snapshot.get("device_token")
    title, body = _compose_escalation_message(alert_record, snapshot)

    if notification_service and token:
        push_sent = notification_service.send_push_notification(
            token=token,
            title=title,
            body=body,
            data={"alert_id": str(alert_record["id"]), "type": "escalation"},
        )
        _log_delivery(str(alert_record["id"]), "push", token, push_sent, "fcm")

    _send_contact_notifications(alert_record, title, body)
    alert_record["status"] = "escalated"
    _publish_event("alert.escalated", _alert_event_payload(alert_record))


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
    global predictor, notification_service, alert_worker_task, main_loop

    validate_runtime_configuration()
    logger.info("Applying database schema...")
    db.ensure_database_schema()

    logger.info("Loading SEHAS LSTM model...")
    predictor = SEHASPredictor()

    logger.info("Initializing notification service...")
    notification_service = NotificationService()

    if not DEBUG and not notification_service.is_ready:
        raise RuntimeError("Firebase notifications must be configured before production startup.")

    main_loop = asyncio.get_running_loop()
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
        main_loop = None
        logger.info("Model unloaded.")


app = FastAPI(
    title="SEHAS Health Alert API",
    description=(
        "**Smart Emergency Health Alert System**\n\n"
        "LSTM-based real-time anomaly detection with caregiver workflows."
    ),
    version="1.2.0",
    lifespan=lifespan,
    debug=DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Idempotency-Key"],
)


class SensorInput(BaseModel):
    heart_rate: float = Field(..., ge=0, le=300, example=72.0, description="Heart rate in BPM")
    acc_mean: float = Field(..., ge=0, example=1.05, description="Mean acceleration magnitude")
    acc_std: float = Field(..., ge=0, example=0.12, description="Std deviation of acceleration")
    patient_id: Optional[str] = Field(None, example="uuid-goes-here", description="Supabase UUID of the patient")
    patient_name: Optional[str] = Field("Patient", example="John Doe")
    device_id: Optional[str] = Field(None, example="pixel-7a-01")
    device_token: Optional[str] = Field(None, example="fcm_token_xyz", description="FCM device token")
    gps_lat: Optional[float] = Field(None, example=12.9716)
    gps_lng: Optional[float] = Field(None, example=77.5946)
    gyro_pitch: Optional[float] = Field(None, example=2.4)
    gyro_roll: Optional[float] = Field(None, example=-1.5)
    ambient_noise_db: Optional[float] = Field(None, example=88.0)
    voice_triggered: bool = Field(False, description="True when the mobile app heard a distress keyword")
    home_lat: Optional[float] = Field(None, example=12.9701)
    home_lng: Optional[float] = Field(None, example=77.5902)
    safe_zone_radius: Optional[int] = Field(None, ge=50, le=5000, example=500)


class PredictionResponse(BaseModel):
    score: float
    risk_level: str
    alert: bool
    message: str
    push_sent: bool = Field(False)


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


def _sequence_key_for(data: SensorInput) -> str | None:
    return data.patient_id or data.device_id or data.device_token


def _hash_payload(payload: dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode()).hexdigest()


def _maybe_return_idempotent_response(
    endpoint: str,
    idempotency_key: Optional[str],
    payload: dict[str, Any],
) -> JSONResponse | None:
    if not idempotency_key:
        return None
    request_hash = _hash_payload(payload)
    cached = db.get_idempotency_response(endpoint, idempotency_key, request_hash)
    if not cached:
        return None
    return JSONResponse(status_code=int(cached["response_status"]), content=cached["response_body"])


def _store_idempotent_response(
    endpoint: str,
    idempotency_key: Optional[str],
    payload: dict[str, Any],
    response_status: int,
    response_body: dict[str, Any],
) -> None:
    if not idempotency_key:
        return
    db.save_idempotency_response(
        endpoint=endpoint,
        idempotency_key=idempotency_key,
        request_hash=_hash_payload(payload),
        response_status=response_status,
        response_body=response_body,
    )


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

    pending_event = {
        "id": str(alert_id),
        "patient_id": data.patient_id,
        "patient_name": data.patient_name,
        "type": alert_type,
        "severity": severity,
        "status": "pending",
        "timestamp": "",
        "gps_lat": data.gps_lat,
        "gps_lng": data.gps_lng,
        "message": "Emergency queued",
    }
    _publish_event("alert.pending", pending_event)
    return alert_id


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _apply_contextual_rules(data: SensorInput, result: PredictionResult) -> PredictionResult:
    score = result.score
    reasons: list[str] = []

    if data.voice_triggered:
        score = max(score, 0.98)
        reasons.append("voice distress detected")

    if data.acc_std > 0.7 and data.gyro_pitch is not None and abs(data.gyro_pitch) < 15:
        score = max(score, 0.9)
        reasons.append("possible fall posture confirmed")

    if data.gps_lat is not None and data.gps_lng is not None and data.home_lat is not None and data.home_lng is not None:
        radius = data.safe_zone_radius or 500
        distance = _haversine_meters(data.gps_lat, data.gps_lng, data.home_lat, data.home_lng)
        if distance > radius:
            score = max(score, 0.55)
            reasons.append(f"safe-zone breach ({int(distance)}m)")

    if data.heart_rate < 40 or data.heart_rate > 130:
        score = max(score, 0.88)
        reasons.append("critical heart-rate threshold")

    classified = SEHASPredictor._classify(score)
    if reasons:
        return PredictionResult(
            score=classified.score,
            risk_level=classified.risk_level,
            alert=classified.alert,
            message=f"{classified.message} Context: {', '.join(reasons)}.",
        )
    return classified


def _dashboard_payload() -> dict[str, Any]:
    return {
        "summary": db.get_dashboard_summary(),
        "recent_alerts": db.get_recent_alerts(limit=20),
        "patients": db.list_patients(limit=20),
    }


async def _stream_alert_events(api_key: str):
    _validate_api_key_value(api_key)
    queue = await event_broker.subscribe()
    try:
        initial_payload = json.dumps({"type": "snapshot", "payload": _dashboard_payload()})
        yield f"data: {initial_payload}\n\n"
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
                yield f"data: {json.dumps(event)}\n\n"
            except TimeoutError:
                yield ": keep-alive\n\n"
    finally:
        await event_broker.unsubscribe(queue)


@app.get("/", tags=["Status"])
def root():
    return {
        "status": "online",
        "service": "SEHAS Health Alert API",
        "version": "1.2.0",
        "caregiver_ui": "/caregiver",
    }


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


@app.get("/events/alerts", tags=["Dashboard"])
async def alert_events(api_key: str = Query(...)):
    return StreamingResponse(
        _stream_alert_events(api_key),
        media_type="text/event-stream",
    )


@app.get("/dashboard/overview", tags=["Dashboard"], dependencies=[Depends(require_api_key)])
def dashboard_overview():
    return _dashboard_payload()


@app.get("/alerts/recent", tags=["Dashboard"], dependencies=[Depends(require_api_key)])
def recent_alerts(limit: int = Query(25, ge=1, le=100)):
    return {"alerts": db.get_recent_alerts(limit=limit)}


@app.get("/patients", tags=["Management"], dependencies=[Depends(require_api_key)])
def list_patients(limit: int = Query(100, ge=1, le=200)):
    return {"patients": db.list_patients(limit=limit)}


@app.post(
    "/predict",
    response_model=PredictionResponse,
    tags=["Prediction"],
    dependencies=[Depends(require_api_key)],
)
def predict(
    data: SensorInput,
    request: Request,
    idempotency_key: Optional[str] = Header(default=None, alias="X-Idempotency-Key"),
):
    payload = data.model_dump()
    cached = _maybe_return_idempotent_response("/predict", idempotency_key, payload)
    if cached:
        return cached

    model = _require_loaded_model()
    try:
        result = model.predict(
            heart_rate=data.heart_rate,
            acc_mean=data.acc_mean,
            acc_std=data.acc_std,
            sequence_key=_sequence_key_for(data),
        )
        result = _apply_contextual_rules(data, result)
        _persist_vitals_if_present(data)

        if result.alert:
            alert_type = "voice_distress" if data.voice_triggered else ("fall" if data.acc_std > 0.5 else "cardiac")
            alert_id = _queue_alert(data, alert_type=alert_type, severity=result.risk_level.lower())
            logger.info("Queued critical alert %s for patient %s", alert_id, data.patient_id)
            message = (
                f"Emergency detected. Safety window active "
                f"({ALERT_SAFETY_WINDOW_SECONDS}s to cancel)."
            )
        else:
            message = result.message

        response_body = PredictionResponse(
            score=round(result.score, 4),
            risk_level=result.risk_level,
            alert=result.alert,
            message=message,
            push_sent=False,
        ).model_dump()
        _store_idempotent_response("/predict", idempotency_key, payload, 200, response_body)
        return response_body
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Prediction failed for %s", request.url.path)
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
        result = model.predict(
            heart_rate=data.heart_rate,
            acc_mean=data.acc_mean,
            acc_std=data.acc_std,
            sequence_key=_sequence_key_for(data),
        )
        result = _apply_contextual_rules(data, result)
        _persist_vitals_if_present(data)

        if result.alert and not data.patient_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"patient_id is required for critical alerts in batch item {index}.",
            )

        if result.alert:
            alert_id = _queue_alert(data, alert_type="batch_detection", severity=result.risk_level.lower())
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


@app.post("/auth/register", tags=["Auth"])
def register_patient(
    patient: PatientRegister,
    idempotency_key: Optional[str] = Header(default=None, alias="X-Idempotency-Key"),
):
    payload = patient.model_dump()
    cached = _maybe_return_idempotent_response("/auth/register", idempotency_key, payload)
    if cached:
        return cached

    # Check if user already exists
    existing_user = db.get_patient_by_email(patient.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    patient_id = str(uuid.uuid4())
    password_hash = db.get_password_hash(patient.password)
    
    success = db.upsert_patient(
        patient_id=patient_id,
        name=patient.name,
        email=patient.email,
        password_hash=password_hash,
        age=patient.age,
        medical_history=patient.medical_history,
        contacts=[contact.model_dump() for contact in patient.emergency_contacts],
        safe_zone_radius=patient.safe_zone_radius,
        baseline_hr=patient.baseline_hr,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to register patient profile.")

    response_body = {"status": "success", "message": "Patient registered successfully.", "patient_id": patient_id}
    _store_idempotent_response("/auth/register", idempotency_key, payload, 200, response_body)
    return response_body

@app.post("/auth/login", tags=["Auth"])
def login_patient(credentials: PatientLogin):
    user = db.get_patient_by_email(credentials.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    if not db.verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    # Exclude password hash from response
    user.pop("password_hash", None)
    # Parse jsonb back to dict for the api response
    if isinstance(user.get("emergency_contacts"), str):
        user["emergency_contacts"] = json.loads(user["emergency_contacts"])
        
    return {"status": "success", "message": "Login successful.", "patient": user}


@app.get("/alerts/{patient_id}", tags=["Management"], dependencies=[Depends(require_api_key)])
def get_history(patient_id: str, limit: int = Query(20, ge=1, le=100)):
    history = db.get_alert_history(patient_id, limit)
    return {"patient_id": patient_id, "count": len(history), "alerts": history}


@app.post("/alerts/{alert_id}/cancel", tags=["Management"], dependencies=[Depends(require_api_key)])
def cancel_alert(alert_id: str):
    if db.cancel_alert_if_pending(alert_id):
        _publish_event(
            "alert.cancelled",
            {"id": alert_id, "status": "cancelled", "message": "Alert cancelled by patient."},
        )
        return {"status": "success", "message": "Alert cancelled. Caregivers will not be notified."}

    current = db.get_alert_status(alert_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    raise HTTPException(status_code=400, detail=f"Alert cannot be cancelled in state: {current}")


@app.post("/alerts/{alert_id}/acknowledge", tags=["Management"], dependencies=[Depends(require_api_key)])
def acknowledge_alert(alert_id: str, caregiver_name: str = Query("Rescuer", min_length=1, max_length=100)):
    if db.acknowledge_alert(alert_id, caregiver_name):
        _publish_event(
            "alert.acknowledged",
            {
                "id": alert_id,
                "status": "acknowledged",
                "acknowledged_by": caregiver_name,
                "message": f"Alert acknowledged by {caregiver_name}.",
            },
        )
        return {"status": "success", "message": f"Alert acknowledged by {caregiver_name}."}

    current = db.get_alert_status(alert_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    raise HTTPException(status_code=400, detail=f"Alert cannot be acknowledged in state: {current}")


@app.post("/voice-sos", tags=["Prediction"], dependencies=[Depends(require_api_key)])
def voice_sos(
    data: SensorInput,
    idempotency_key: Optional[str] = Header(default=None, alias="X-Idempotency-Key"),
):
    payload = data.model_dump()
    cached = _maybe_return_idempotent_response("/voice-sos", idempotency_key, payload)
    if cached:
        return cached

    enriched = data.model_copy(update={"voice_triggered": True})
    _persist_vitals_if_present(enriched)
    alert_id = _queue_alert(enriched, alert_type="voice_sos", severity="critical")
    claimed = db.claim_alert_for_dispatch(alert_id)
    if claimed:
        _dispatch_alert(claimed)

    response_body = {"status": "alert_dispatched", "message": "Voice SOS processed.", "alert_id": str(alert_id)}
    _store_idempotent_response("/voice-sos", idempotency_key, payload, 200, response_body)
    return response_body


if CAREGIVER_UI_DIR.exists():
    app.mount("/caregiver", StaticFiles(directory=str(CAREGIVER_UI_DIR), html=True), name="caregiver")
