import json
import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

logger = logging.getLogger(__name__)
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema.sql"


def get_database_url() -> str:
    database_url = os.getenv("SUPABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL (SUPABASE_URL) not found in environment.")
    
    # Force SSL for Supabase connection poolers
    if "sslmode=" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url += f"{separator}sslmode=require"
        
    return database_url


def get_db_connection():
    """
    Initialize and return a direct PostgreSQL connection.
    Uses SUPABASE_URL or DATABASE_URL from the environment.
    """
    try:
        return psycopg2.connect(
            get_database_url(),
            connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5")),
        )
    except Exception:
        logger.exception("Database connection error")
        raise


@contextmanager
def get_cursor(dict_rows: bool = False) -> Iterator[Any]:
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor if dict_rows else None) as cur:
                yield cur
    finally:
        conn.close()


def ensure_database_schema():
    """Apply the idempotent schema needed by the API."""
    schema_sql = SCHEMA_PATH.read_text()
    with get_cursor() as cur:
        cur.execute(schema_sql)


def check_connection() -> bool:
    try:
        with get_cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        logger.exception("Database health check failed")
        return False


# --- Persistence Methods ---

def save_vital_reading(patient_id, heart_rate, acc_mean, acc_std):
    """Log a single vital reading to the historical time-series database."""
    if str(patient_id).startswith("local-"):
        return True # Silently discard corrupted offline IDs to prevent postgres crash

    query = """
        INSERT INTO vitals_log (patient_id, heart_rate, acc_mean, acc_std)
        VALUES (%s, %s, %s, %s)
    """
    try:
        with get_cursor() as cur:
            cur.execute(query, (patient_id, heart_rate, acc_mean, acc_std))
        return True
    except Exception:
        logger.exception("Error saving vitals")
        return False


def create_alert(patient_id, type, severity, sensor_snapshot, gps_lat=None, gps_lng=None):
    """Persist a critical emergency alert record."""
    if str(patient_id).startswith("local-"):
        import uuid
        return f"local-alert-{uuid.uuid4()}"

    query = """
        INSERT INTO alerts (patient_id, type, severity, sensor_snapshot, gps_lat, gps_lng)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                query,
                (patient_id, type, severity, json.dumps(sensor_snapshot), gps_lat, gps_lng),
            )
            return cur.fetchone()[0]
    except Exception:
        logger.exception("Error creating alert")
        return None


def upsert_patient(
    patient_id,
    name,
    email,
    password_hash,
    age,
    medical_history,
    contacts,
    safe_zone_radius=500,
    baseline_hr=72.0,
):
    """Register or update a patient's profile and emergency contacts."""
    query = """
        INSERT INTO patients (
            id,
            email,
            password_hash,
            name,
            age,
            medical_history,
            emergency_contacts,
            safe_zone_radius,
            baseline_hr
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            name = EXCLUDED.name,
            age = EXCLUDED.age,
            medical_history = EXCLUDED.medical_history,
            emergency_contacts = EXCLUDED.emergency_contacts,
            safe_zone_radius = EXCLUDED.safe_zone_radius,
            baseline_hr = EXCLUDED.baseline_hr
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                query,
                (
                    patient_id,
                    email,
                    password_hash,
                    name,
                    age,
                    medical_history,
                    json.dumps(contacts),
                    safe_zone_radius,
                    baseline_hr,
                ),
            )
        return True
    except Exception:
        logger.exception("Error upserting patient")
        return False

def get_patient_by_email(email):
    query = "SELECT * FROM patients WHERE email = %s"
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (email,))
            return cur.fetchone()
    except Exception:
        logger.exception("Error fetching patient by email")
        return None
        return True
    except Exception:
        logger.exception("Error upserting patient")
        return False


def update_alert_status(alert_id, status):
    """Update the status of an existing alert and its lifecycle timestamps."""
    timestamp_updates = {
        "dispatched": "dispatched_at = COALESCE(dispatched_at, NOW())",
        "cancelled": "cancelled_at = COALESCE(cancelled_at, NOW())",
        "acknowledged": "acknowledged_at = COALESCE(acknowledged_at, NOW())",
        "escalated": "escalated_at = COALESCE(escalated_at, NOW())",
    }
    set_clause = "status = %s"
    if status in timestamp_updates:
        set_clause = f"{set_clause}, {timestamp_updates[status]}"

    query = f"UPDATE alerts SET {set_clause} WHERE id = %s"
    try:
        with get_cursor() as cur:
            cur.execute(query, (status, alert_id))
            return cur.rowcount > 0
    except Exception:
        logger.exception("Error updating alert status")
        return False


def get_alert_status(alert_id):
    """Retrieve the current status of an alert."""
    if str(alert_id).startswith("local-"): return None
    query = "SELECT status FROM alerts WHERE id = %s"
    try:
        with get_cursor() as cur:
            cur.execute(query, (alert_id,))
            res = cur.fetchone()
        return res[0] if res else None
    except Exception:
        logger.exception("Error getting alert status")
        return None


def get_alert_history(patient_id, limit=20):
    """Fetch recent alert history for a specific patient."""
    if str(patient_id).startswith("local-"): return []
    query = "SELECT * FROM alerts WHERE patient_id = %s ORDER BY timestamp DESC LIMIT %s"
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (patient_id, limit))
            return cur.fetchall()
    except Exception:
        logger.exception("Error fetching alerts")
        return []


def get_recent_alerts(limit=25):
    query = """
        SELECT a.*, p.name AS patient_name
        FROM alerts a
        LEFT JOIN patients p ON p.id = a.patient_id
        ORDER BY a.timestamp DESC
        LIMIT %s
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (limit,))
            return cur.fetchall()
    except Exception:
        logger.exception("Error fetching recent alerts")
        return []


def get_dashboard_summary():
    query = """
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
            COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched_count,
            COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged_count,
            COUNT(*) FILTER (WHERE status = 'escalated') AS escalated_count,
            COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') AS alerts_last_24h,
            COALESCE(AVG(response_time) FILTER (WHERE response_time IS NOT NULL), 0) AS avg_response_time_seconds
        FROM alerts
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query)
            return cur.fetchone() or {}
    except Exception:
        logger.exception("Error fetching dashboard summary")
        return {}


def get_patient(patient_id):
    query = "SELECT * FROM patients WHERE id = %s"
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (patient_id,))
            return cur.fetchone()
    except Exception:
        logger.exception("Error fetching patient")
        return None


def list_patients(limit=100):
    query = """
        SELECT p.*,
               (
                   SELECT MAX(a.timestamp)
                   FROM alerts a
                   WHERE a.patient_id = p.id
               ) AS latest_alert_at
        FROM patients p
        ORDER BY latest_alert_at DESC NULLS LAST, p.created_at DESC
        LIMIT %s
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (limit,))
            return cur.fetchall()
    except Exception:
        logger.exception("Error listing patients")
        return []


def get_idempotency_response(endpoint: str, idempotency_key: str, request_hash: str):
    query = """
        SELECT response_status, response_body
        FROM idempotency_keys
        WHERE endpoint = %s
          AND idempotency_key = %s
          AND request_hash = %s
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (endpoint, idempotency_key, request_hash))
            return cur.fetchone()
    except Exception:
        logger.exception("Error fetching idempotency response")
        return None


def save_idempotency_response(
    endpoint: str,
    idempotency_key: str,
    request_hash: str,
    response_status: int,
    response_body: dict[str, Any],
):
    query = """
        INSERT INTO idempotency_keys (
            endpoint,
            idempotency_key,
            request_hash,
            response_status,
            response_body
        )
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (endpoint, idempotency_key) DO UPDATE SET
            request_hash = EXCLUDED.request_hash,
            response_status = EXCLUDED.response_status,
            response_body = EXCLUDED.response_body
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                query,
                (
                    endpoint,
                    idempotency_key,
                    request_hash,
                    response_status,
                    json.dumps(response_body),
                ),
            )
        return True
    except Exception:
        logger.exception("Error saving idempotency response")
        return False


def log_notification_delivery(
    alert_id,
    channel: str,
    recipient: str,
    status: str,
    provider_response: str | None = None,
    error_message: str | None = None,
):
    query = """
        INSERT INTO notification_deliveries (
            alert_id,
            channel,
            recipient,
            status,
            provider_response,
            error_message
        )
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                query,
                (alert_id, channel, recipient, status, provider_response, error_message),
            )
        return True
    except Exception:
        logger.exception("Error logging notification delivery")
        return False


def get_due_pending_alerts(safety_window_seconds: int, limit: int = 50):
    query = """
        SELECT id, patient_id, type, severity, sensor_snapshot, gps_lat, gps_lng, timestamp
        FROM alerts
        WHERE status = 'pending'
          AND timestamp <= NOW() - make_interval(secs => %s)
        ORDER BY timestamp ASC
        LIMIT %s
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (safety_window_seconds, limit))
            return cur.fetchall()
    except Exception:
        logger.exception("Error fetching due pending alerts")
        return []


def get_due_dispatched_alerts(escalation_seconds: int, limit: int = 50):
    query = """
        SELECT id, patient_id, type, severity, sensor_snapshot, gps_lat, gps_lng, dispatched_at, timestamp
        FROM alerts
        WHERE status = 'dispatched'
          AND COALESCE(dispatched_at, timestamp) <= NOW() - make_interval(secs => %s)
        ORDER BY COALESCE(dispatched_at, timestamp) ASC
        LIMIT %s
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (escalation_seconds, limit))
            return cur.fetchall()
    except Exception:
        logger.exception("Error fetching due dispatched alerts")
        return []


def claim_alert_for_dispatch(alert_id):
    if str(alert_id).startswith("local-"): return None
    query = """
        UPDATE alerts
        SET status = 'dispatched',
            dispatched_at = COALESCE(dispatched_at, NOW())
        WHERE id = %s AND status = 'pending'
        RETURNING id, patient_id, type, severity, sensor_snapshot, gps_lat, gps_lng, timestamp, dispatched_at
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (alert_id,))
            return cur.fetchone()
    except Exception:
        logger.exception("Error claiming alert for dispatch")
        return None


def claim_alert_for_escalation(alert_id):
    if str(alert_id).startswith("local-"): return None
    query = """
        UPDATE alerts
        SET status = 'escalated',
            escalated_at = COALESCE(escalated_at, NOW())
        WHERE id = %s AND status = 'dispatched'
        RETURNING id, patient_id, type, severity, sensor_snapshot, gps_lat, gps_lng, timestamp, dispatched_at, escalated_at
    """
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (alert_id,))
            return cur.fetchone()
    except Exception:
        logger.exception("Error claiming alert for escalation")
        return None


def cancel_alert_if_pending(alert_id):
    if str(alert_id).startswith("local-"): return True
    query = """
        UPDATE alerts
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW())
        WHERE id = %s AND status = 'pending'
        RETURNING id
    """
    try:
        with get_cursor() as cur:
            cur.execute(query, (alert_id,))
            return cur.fetchone() is not None
    except Exception:
        logger.exception("Error cancelling alert")
        return False


def acknowledge_alert(alert_id, caregiver_name):
    query = """
        UPDATE alerts
        SET status = 'acknowledged',
            acknowledged_by = %s,
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            response_time = EXTRACT(EPOCH FROM (NOW() - COALESCE(dispatched_at, timestamp)))::INTEGER
        WHERE id = %s AND status IN ('pending', 'dispatched', 'escalated')
        RETURNING id
    """
    try:
        with get_cursor() as cur:
            cur.execute(query, (caregiver_name, alert_id))
            return cur.fetchone() is not None
    except Exception:
        logger.exception("Error acknowledging alert")
        return False
