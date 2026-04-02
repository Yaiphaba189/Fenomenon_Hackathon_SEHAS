import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

# The user provided a direct postgres URL in SUPABASE_URL
DATABASE_URL = os.getenv("SUPABASE_URL")

def get_db_connection():
    """
    Initialize and return a direct PostgreSQL connection.
    Uses SUPABASE_URL from .env as the connection string.
    """
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL (SUPABASE_URL) not found in environment.")
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"❌ Database Connection Error: {e}")
        raise

# --- Persistence Methods ---

def save_vital_reading(patient_id, heart_rate, acc_mean, acc_std):
    """Log a single vital reading to the historical time-series database."""
    query = """
        INSERT INTO vitals_log (patient_id, heart_rate, acc_mean, acc_std)
        VALUES (%s, %s, %s, %s)
    """
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(query, (patient_id, heart_rate, acc_mean, acc_std))
            conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving vitals: {e}")
        return False

def create_alert(patient_id, type, severity, sensor_snapshot, gps_lat=None, gps_lng=None):
    """Persist a critical emergency alert record."""
    query = """
        INSERT INTO alerts (patient_id, type, severity, sensor_snapshot, gps_lat, gps_lng)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    """
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(query, (
                patient_id, type, severity, 
                json.dumps(sensor_snapshot), 
                gps_lat, gps_lng
            ))
            alert_id = cur.fetchone()[0]
            conn.commit()
        conn.close()
        return alert_id
    except Exception as e:
        print(f"Error creating alert: {e}")
        return None

def upsert_patient(patient_id, name, age, medical_history, contacts):
    """Register or update a patient's profile and emergency contacts."""
    query = """
        INSERT INTO patients (id, name, age, medical_history, emergency_contacts)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            age = EXCLUDED.age,
            medical_history = EXCLUDED.medical_history,
            emergency_contacts = EXCLUDED.emergency_contacts
    """
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(query, (
                patient_id, name, age, 
                medical_history, json.dumps(contacts)
            ))
            conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error upserting patient: {e}")
        return False

def get_alert_history(patient_id, limit=20):
    """Fetch recent alert history for a specific patient."""
    query = "SELECT * FROM alerts WHERE patient_id = %s ORDER BY timestamp DESC LIMIT %s"
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (patient_id, limit))
            results = cur.fetchall()
        conn.close()
        return results
    except Exception as e:
        print(f"Error fetching alerts: {e}")
        return []
