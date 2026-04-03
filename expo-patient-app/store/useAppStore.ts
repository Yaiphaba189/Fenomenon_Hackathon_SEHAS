/**
 * SEHAS App State — Zustand Store
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { SensorReading } from '../services/sensors';
import { LocationData } from '../services/location';
import { HeartRateReading } from '../services/heartRate';
import { AlertRecord, PredictionResponse } from '../services/api';

interface PatientProfile {
  id: string;
  name: string;
  age: number;
  medicalHistory: string;
  emergencyContacts: Array<{ name: string; phone: string; relationship: string }>;
  safeZoneRadius: number;
  baselineHr: number;
  homeLat?: number;
  homeLng?: number;
}

interface AppState {
  // Patient
  patient: PatientProfile | null;
  isRegistered: boolean;
  isLoaded: boolean;
  setPatient: (patient: PatientProfile) => Promise<void>;
  clearPatient: () => Promise<void>;
  loadPatient: () => Promise<void>;

  // Monitoring
  isMonitoring: boolean;
  setMonitoring: (active: boolean) => void;

  // Sensors
  latestSensorReading: SensorReading | null;
  setSensorReading: (reading: SensorReading) => void;

  // Location
  currentLocation: LocationData | null;
  setLocation: (location: LocationData) => void;

  // Heart rate
  heartRate: HeartRateReading | null;
  setHeartRate: (reading: HeartRateReading) => void;

  // Predictions
  latestPrediction: PredictionResponse | null;
  setPrediction: (prediction: PredictionResponse) => void;

  // Alerts
  alerts: AlertRecord[];
  setAlerts: (alerts: AlertRecord[]) => void;
  addAlert: (alert: AlertRecord) => void;
  updateAlertStatus: (alertId: string, status: string) => void;

  // Network
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  offlineQueueSize: number;
  setOfflineQueueSize: (size: number) => void;

  // Backend
  backendHealthy: boolean;
  setBackendHealthy: (healthy: boolean) => void;

  // Demo mode
  demoMode: boolean;
  setDemoMode: (demo: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Patient
  patient: null,
  isRegistered: false,
  isLoaded: false,
  setPatient: async (patient) => {
    await SecureStore.setItemAsync('sehas_patient', JSON.stringify(patient));
    set({ patient, isRegistered: true });
  },
  clearPatient: async () => {
    await SecureStore.deleteItemAsync('sehas_patient');
    set({ patient: null, isRegistered: false });
  },
  loadPatient: async () => {
    try {
      const stored = await SecureStore.getItemAsync('sehas_patient');
      if (stored) {
        const patient = JSON.parse(stored);
        set({ patient, isRegistered: true });
      }
    } catch (e) {
      console.warn('Failed to load patient from secure store', e);
    } finally {
      set({ isLoaded: true });
    }
  },

  // Monitoring
  isMonitoring: false,
  setMonitoring: (active) => set({ isMonitoring: active }),

  // Sensors
  latestSensorReading: null,
  setSensorReading: (reading) => set({ latestSensorReading: reading }),

  // Location
  currentLocation: null,
  setLocation: (location) => set({ currentLocation: location }),

  // Heart rate
  heartRate: null,
  setHeartRate: (reading) => set({ heartRate: reading }),

  // Predictions
  latestPrediction: null,
  setPrediction: (prediction) => set({ latestPrediction: prediction }),

  // Alerts
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
  updateAlertStatus: (alertId, status) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, status } : a,
      ),
    })),

  // Network
  isOnline: true,
  setOnline: (online) => set({ isOnline: online }),
  offlineQueueSize: 0,
  setOfflineQueueSize: (size) => set({ offlineQueueSize: size }),

  // Backend
  backendHealthy: false,
  setBackendHealthy: (healthy) => set({ backendHealthy: healthy }),

  // Demo mode
  demoMode: true,
  setDemoMode: (demo) => set({ demoMode: demo }),
}));
