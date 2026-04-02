# 📱 Smart Emergency Health Alert System (SEHAS)
## *Transforming Smartphones into Life-Saving Health Monitors*

---

## 1. 🎯 Project Overview

### 1.1 Problem Statement
Medical emergencies — heart attacks, falls, sudden unconsciousness — are life-threatening precisely because help arrives too late. In India, thousands of elderly and chronically ill patients live alone or in under-monitored conditions. By the time a family member realizes something is wrong, irreversible damage has already occurred.

Existing solutions require expensive dedicated hardware (smartwatches, pulse oximeters) that most patients in semi-urban and rural India cannot afford. This project eliminates that barrier entirely by transforming any existing Android smartphone into a full-featured health monitoring and emergency alert device — **zero additional hardware required.**

### 1.2 Solution
The **Smart Emergency Health Alert System (SEHAS)** is a real-time, AI-powered mobile application that continuously monitors a patient's health by reading data from the smartphone's built-in sensors — accelerometer, gyroscope, camera, GPS, and microphone. 

When abnormal patterns are detected (falls, irregular heart rate, distress), the system automatically classifies severity, locates the patient, and dispatches alerts to caregivers and emergency services within **5 seconds**.

### 1.3 Key Objectives
- **Real-time Detection:** Monitor health emergencies using phone sensors only.
- **AI Precision:** Distinguish genuine emergencies from false alarms (target: <5% FPR).
- **Rapid Response:** Alert caregivers within 5 seconds via SMS, WhatsApp, and push notifications.
- **Location Tracking:** Share live GPS location automatically with every alert.
- **Provider Dashboard:** Live monitoring for doctors and caregivers.
- **Offline Reliability:** Function in low/no internet conditions using an offline-first fallback mode.

### 1.4 Why SEHAS Stands Out
> [!TIP]
> **Relevance (India):** Rural health gap — 70% of elderly lack nearby medical support. Works on any Android phone (2018+).
> **Response Speed:** Automated alerts in <5s vs. manual calls taking 1–3 mins.
> **AI Innovation:** Multi-sensor fusion combined with high-accuracy LSTM (Long Short-Term Memory) time-series detection for physiological and motion anomalies.
> **Offline Capability:** Alerts queue locally in SQLite and deliver on reconnect. Zero alerts lost.
> **Social Impact:** Directly saves lives with strong humanitarian and commercial value.

---

## 2. 🏛️ Full System Architecture

The system operates across five distinct layers to ensure reliability from sensor to caregiver.

```mermaid
graph TD
    subgraph Layer 1: Sensing
        S1[Accelerometer]
        S2[Gyroscope]
        S3[Camera PPG]
        S4[GPS]
        S5[Microphone]
    end

    subgraph Layer 2: Processing (On-Device AI)
        P1[Feature Extraction]
        P2[TFLite Anomaly Detection]
        P3[Sensor Fusion Layer]
    end

    subgraph Layer 3: Alert Engine
        A1[Severity Scoring]
        A2[10s Cancellation Window]
    end

    subgraph Layer 4: Notification Pipeline
        N1[FCM Push Notifications]
        N2[Real-time DB In-App Alerts]
    end

    subgraph Layer 5: Storage & Dashboard
        D1[Supabase PostgreSQL]
        D2[React.js Caregiver Dashboard]
    end

    S1 & S2 & S3 & S4 & S5 --> P1
    P1 --> P2 --> P3
    P3 --> A1 --> A2
    A2 -->|Timeout| N1 & N2 & N3
    N4 ---|Escalation| N1
    N1 & N2 & N3 --> D1
    D1 --> D2
```

---

## 3. 🔍 Mobile Phone Sensors — Full Details

Every sensor used is standard in modern smartphones. No additional hardware is required.

### 3.1 Accelerometer — Fall Detection

- **Mechanism:** Measures 3-axis linear acceleration (X, Y, Z).
- **Signature Detection:**
  1. **Phase 1 (Impact):** Resultant $R = \sqrt{x^2 + y^2 + z^2} > 25 \text{ m/s}^2$ for $\ge 80\text{ms}$.
  2. **Phase 2 (Stillness):** $R < 3 \text{ m/s}^2$ for $2+\text{ seconds}$ (person lying still).
- **False Alarm Prevention:** If motion rises again within 2s, the alert resets.

### 3.2 Camera + Flash — Heart Rate via PPG

- **Mechanism:** Photoplethysmography (PPG). The flash illuminates the fingertip; blood volume changes alter red channel pixel values.
- **Logic:** Extracts average red channel values @ 30fps → Bandpass filter (0.5–4 Hz) → Peak detection for BPM.
- **Thresholds:**
  - **Critical:** <40 BPM or >130 BPM.
  - **Medium:** 40–55 BPM or 100–130 BPM.
  - **Normal:** 55–100 BPM.

### 3.3 Gyroscope — Posture Confirmation

- **Logic:** Uses a complementary filter ($0.98 \times \text{gyro} + 0.02 \times \text{accel}$) for stable orientation.
- **Fall Validation:** Pitches/rolls near $0^\circ$ confirm the patient is lying flat, validating the accelerometer's impact data.

### 3.4 GPS — Location & Geofencing

- **Alert Dispatch:** Auto-generates a Google Maps link (`maps.google.com/?q=lat,lng`).
- **Geofencing:** Triggers **Medium** alerts if a dementia patient wanders outside a 500m home radius.

### 3.5 Microphone — Voice SOS

- **Wake Words:** Listens for "Help", "Emergency", or "Bachao".
- **Ambient Logic:** Screams or crashes (>85dB) combined with movement spikes trigger high-confidence alerts.

---

## 4. 🧠 AI Model — LSTM Sequence Detection

The system uses a Long Short-Term Memory (LSTM) network to detect emergency patterns in time-series sensor data.

### 4.1 LSTM Architecture

- **Input:** Sequence of 20 timesteps with 3 features (acceleration magnitude, motion variability, heart rate).
- **Layers:** 2x LSTM layers (64/32 units) + Dropout (0.2) + Dense output (Sigmoid).
- **Classification:** Score 0.0–1.0 (Normal → Critical).

```python
import tensorflow as tf

model = tf.keras.Sequential([
    tf.keras.layers.LSTM(64, return_sequences=True, input_shape=(20, 3)),
    tf.keras.layers.LSTM(32),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(16, activation='relu'),
    tf.keras.layers.Dense(1, activation='sigmoid')
])

model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
```

---

## 5. ⚙️ Backend & Dispatch Pipeline

### 5.1 FastAPI Structure

- `/predict`: Low-latency inference endpoint.
- `/alerts`: Historical alert logging.
- `/notifications`: Twilio/FCM dispatch logic.

### 5.2 Notification Channels

1. **FCM Push:** Real-time emergency alerts to all caregiver devices.
2. **In-App Notifications:** Instant dashboard updates for active monitoring.

---

## 6. 📊 Data Management

| Table | High-Level Fields |
| :--- | :--- |
| **Patients** | id, name, medical_history, emergency_contacts, safe_zone_radius |
| **Alerts** | id, patient_id, type, severity, sensor_snapshot, gps_coords, response_time |
| **Vitals Log** | timestamped HR, SpO2, and activity for trend monitoring |

---

## 7. 📱 Mobile App Logic

**Sequence Buffering:**

```javascript
const buffer = [];
function addData(accel, gyro, hr) {
  buffer.push([accel, gyro, hr]);
  if (buffer.length > 20) buffer.shift(); // Rolling window
}
```

**Required Permissions:**

- Camera/Flash (Heart Rate)
- Microphone (Voice SOS)
- Fine & Background Location (GPS)
- Foreground Service (Continuous monitoring)

---

## 8. 💻 Caregiver Dashboard

- **Live Vitals:** Real-time charts for heart rate and activity.
- **Alert Map:** GPS marker with 24-hour location trail.
- **Response Analytics:** Tracking average seconds to acknowledgement to improve care quality.

---
> **🔥 Project Moto:** *"Zero extra hardware, zero delay, infinite peace of mind."*
