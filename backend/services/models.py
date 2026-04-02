from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

# --- Patient Models ---
class EmergencyContact(BaseModel):
    name         : str
    phone        : str
    relationship : str

class Patient(BaseModel):
    id                 : Optional[str] = Field(None, description="Supabase UUID")
    name               : str
    age                : int
    medical_history    : Optional[str] = None
    emergency_contacts : List[EmergencyContact]
    safe_zone_radius   : int = 500  # in meters
    baseline_hr        : float = 72.0

# --- Vital Sign Models ---
class VitalReading(BaseModel):
    patient_id : str
    heart_rate : float
    acc_mean   : float
    acc_std    : float
    timestamp  : datetime = Field(default_factory=datetime.utcnow)

# --- Alert Models ---
class Alert(BaseModel):
    id              : Optional[str] = None
    patient_id      : str
    type            : str = Field(..., example="fall") # fall, cardiac, panic, wandering
    severity        : str = Field(..., example="critical") # low, medium, critical
    sensor_snapshot : Dict[str, Any]
    gps_lat         : float
    gps_lng         : float
    timestamp       : datetime = Field(default_factory=datetime.utcnow)
    acknowledged_by : Optional[str] = None
    response_time   : Optional[int] = None # in seconds
