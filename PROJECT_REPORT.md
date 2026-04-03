# SEHAS (Smart Emergency Health Alert System) — Hackathon Project Report

## 1. Project Overview
**SEHAS** is an intelligent, real-time medical monitoring application designed to protect at-risk patients by detecting anomalies like falls, cardiac arrest, or severe trauma. Built for rapid deployment in a hackathon context, the system completely bypasses simulated data in favor of hyper-accurate **real device hardware sensors** streaming directly to an AI backend.

## 2. Architecture & Tech Stack
The project is split into a physical mobile sensor suite and a predictive brain.

### **Frontend & Sensor Acquisition (React Native / Expo Native Build)**
- **Framework**: React Native compiled via standard iOS/Android dev builds.
- **UI/UX**: Custom medical dark-mode theme utilizing glass-morphism, animated pulse rings, and adaptive safety warnings.
- **State Management**: Zustand (`useAppStore`) with a modular Service Architecture (`heartRate.ts`, `sensors.ts`, `location.ts`).

### **Backend & AI Engine (Python / FastAPI)**
- **API Server**: Asynchronous FastAPI server.
- **Machine Learning**: An LSTM (Long Short-Term Memory) Neural Network model (`SEHASPredictor`) calibrated to classify sequences of bodily movements and heart arrhythmias into critical alerts.
- **Database Architecture**: SQLite wrapped with SQLAlchemy ORM handles patient data and persistent alert logs.

---

## 3. Key Technical Innovations

### A. The Seismocardiogram (SCG) Heart Monitor
To prioritize safety and device performance (avoiding overheating from continuous camera flash), we rejected the standard camera PPG model. Instead, we implemented a pure **Seismocardiogram (SCG)** algorithm:
- The app polls the device's **Accelerometer at 60Hz**.
- By placing the phone completely flat against the chest, we capture the physical micro-vibrations from the aortic valve opening and closing.
- A custom DSP (Digital Signal Processing) pipeline applies high-pass and low-pass filtering to strip gravity (1G), isolates the absolute magnitude peaks, and calculates accurate beats-per-minute (BPM).

### B. Fall & Trauma Detection (IMU Integration)
- The app streams spatial data utilizing both the **Accelerometer and Gyroscope**.
- It calculates sudden drops in altitude, sharp vector changes, and abnormal rest periods to feed the anomaly detection backend.

### C. Live Backend Prediction 
- A structured payload combining `bpm`, `accel_mean`, and `accel_std` is beamed to the FastAPI server at `http://10.209.223.41:8000/api/predict`.
- The AI algorithm evaluates the 3D-space timeline. If an anomaly is registered (Fallback confidence > threshold), a High Priority Alert is generated and piped straight back to the UI.

---

## 4. Work In Progress / Next Steps
As development continues, the final missing features for the hackathon are:
1. **Security & Authentication**: Adding `passlib` and `bcrypt` password hashing on the python backend alongside Mobile Login/Signup UI flows.
2. **Push Notifications**: Integrating a Firebase Cloud Messaging webhook so family members can receive the SOS broadcasts globally even when the app is in the background.
3. **Production Bridging**: Migrating the `API_BASE_URL` from the local dev IP to a secure `https://` proxy domain.

---

**Generated on:** April 2026
**Environment target**: `npx expo run:android` Native Release
