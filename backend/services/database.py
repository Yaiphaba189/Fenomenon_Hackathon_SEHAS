import json
import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv()

logger = logging.getLogger(__name__)
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema.sql"


def get_database_url() -> str:
    database_url = os.getenv("SUPABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL (SUPABASE_URL) not found in environment.")
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
            name,
            age,
            medical_history,
            emergency_contacts,
            safe_zone_radius,
            baseline_hr
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
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
    query = "SELECT * FROM alerts WHERE patient_id = %s ORDER BY timestamp DESC LIMIT %s"
    try:
        with get_cursor(dict_rows=True) as cur:
            cur.execute(query, (patient_id, limit))
            return cur.fetchall()
    except Exception:
        logger.exception("Error fetching alerts")
        return []


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
