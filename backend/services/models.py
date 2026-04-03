from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# --- Patient Models ---
class EmergencyContact(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=5, max_length=30)
    relationship: str = Field(..., min_length=1, max_length=50)

class Patient(BaseModel):
    id: Optional[str] = Field(None, description="Supabase UUID")
    email: Optional[str] = Field(None)
    password_hash: Optional[str] = Field(None, exclude=True)
    name: str = Field(..., min_length=1, max_length=100)
    age: int = Field(..., ge=0, le=130)
    medical_history: Optional[str] = Field(None, max_length=2000)
    emergency_contacts: List[EmergencyContact] = Field(..., min_length=1)
    safe_zone_radius: int = Field(500, ge=50, le=5000)  # meters
    baseline_hr: float = Field(72.0, ge=20, le=240)

class PatientRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(...)
    password: str = Field(..., min_length=6)
    age: int = Field(..., ge=0, le=130)
    medical_history: Optional[str] = Field(None, max_length=2000)
    emergency_contacts: List[EmergencyContact] = Field(default_factory=list)
    safe_zone_radius: int = Field(500, ge=50, le=5000)
    baseline_hr: float = Field(72.0, ge=20, le=240)

class PatientLogin(BaseModel):
    email: str
    password: str

# --- Vital Sign Models ---
class VitalReading(BaseModel):
    patient_id: str
    heart_rate: float = Field(..., ge=0, le=300)
    acc_mean: float = Field(..., ge=0)
    acc_std: float = Field(..., ge=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# --- Alert Models ---
class Alert(BaseModel):
    id: Optional[str] = None
    patient_id: str
    type: str = Field(..., example="fall")  # fall, cardiac, panic, wandering
    severity: str = Field(..., example="critical")  # low, medium, critical
    sensor_snapshot: Dict[str, Any]
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    acknowledged_by: Optional[str] = None
    response_time: Optional[int] = None  # seconds
