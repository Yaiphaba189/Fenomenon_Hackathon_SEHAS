-- SQL Setup for SEHAS (Smart Emergency Health Alert System)
-- Run this in your Supabase SQL Editor

-- 1. Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    age INTEGER,
    medical_history TEXT,
    emergency_contacts JSONB, -- list of {name, phone, relation}
    safe_zone_radius INTEGER DEFAULT 500,
    baseline_hr FLOAT DEFAULT 72.0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Vitals Log (Time-series data)
CREATE TABLE IF NOT EXISTS vitals_log (
    id BIGSERIAL PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    heart_rate FLOAT,
    acc_mean FLOAT,
    acc_std FLOAT,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- 3. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'fall', 'cardiac', 'panic', 'wandering'
    severity TEXT NOT NULL, -- 'low', 'medium', 'critical'
    sensor_snapshot JSONB,
    gps_lat FLOAT,
    gps_lng FLOAT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    acknowledged_by TEXT,
    response_time INTEGER -- in seconds
);

-- Enable Realtime (optional, for dashboard updates)
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE vitals_log;
