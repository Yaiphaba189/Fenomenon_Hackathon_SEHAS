-- SQL Setup for SEHAS (Smart Emergency Health Alert System)
-- Safe to run repeatedly against the same database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    age INTEGER CHECK (age >= 0 AND age <= 130),
    medical_history TEXT,
    emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    safe_zone_radius INTEGER NOT NULL DEFAULT 500,
    baseline_hr FLOAT NOT NULL DEFAULT 72.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS safe_zone_radius INTEGER NOT NULL DEFAULT 500,
    ADD COLUMN IF NOT EXISTS baseline_hr FLOAT NOT NULL DEFAULT 72.0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Vitals Log (Time-series data)
CREATE TABLE IF NOT EXISTS vitals_log (
    id BIGSERIAL PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    heart_rate FLOAT NOT NULL,
    acc_mean FLOAT NOT NULL,
    acc_std FLOAT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient_timestamp
    ON vitals_log (patient_id, timestamp DESC);

-- 3. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    sensor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    gps_lat FLOAT,
    gps_lng FLOAT,
    status TEXT NOT NULL DEFAULT 'pending',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    response_time INTEGER,
    CONSTRAINT alerts_status_check
        CHECK (status IN ('pending', 'dispatched', 'cancelled', 'acknowledged', 'escalated'))
);

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS sensor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS gps_lat FLOAT,
    ADD COLUMN IF NOT EXISTS gps_lng FLOAT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acknowledged_by TEXT,
    ADD COLUMN IF NOT EXISTS response_time INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'alerts_status_check'
    ) THEN
        ALTER TABLE alerts
            ADD CONSTRAINT alerts_status_check
            CHECK (status IN ('pending', 'dispatched', 'cancelled', 'acknowledged', 'escalated'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alerts_patient_timestamp
    ON alerts (patient_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_status_timestamp
    ON alerts (status, timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_alerts_status_dispatched_at
    ON alerts (status, dispatched_at ASC);

-- 4. Idempotency Records
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id BIGSERIAL PRIMARY KEY,
    endpoint TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (endpoint, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup
    ON idempotency_keys (endpoint, idempotency_key, request_hash);

-- 5. Notification Delivery Logs
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_response TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_alert_created
    ON notification_deliveries (alert_id, created_at DESC);

-- Enable Realtime (optional, for dashboard updates)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE vitals_log;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;
