/**
 * SEHAS Backend API Client
 * Handles all communication with the FastAPI backend
 */

import { Config } from '../constants/config';
import { getCachedPushToken } from './notifications';

const headers = () => ({
  'Content-Type': 'application/json',
  'X-API-Key': Config.API_KEY,
});

export interface SensorPayload {
  heart_rate: number;
  acc_mean: number;
  acc_std: number;
  patient_id?: string;
  patient_name?: string;
  device_id?: string;
  device_token?: string;
  gps_lat?: number;
  gps_lng?: number;
  gyro_pitch?: number;
  gyro_roll?: number;
  ambient_noise_db?: number;
  voice_triggered?: boolean;
  home_lat?: number;
  home_lng?: number;
  safe_zone_radius?: number;
}

export interface PredictionResponse {
  score: number;
  risk_level: 'NORMAL' | 'MEDIUM' | 'CRITICAL';
  alert: boolean;
  message: string;
  push_sent: boolean;
}

export interface PatientPayload {
  name: string;
  email: string;
  password?: string;
  age: number;
  medical_history?: string;
  emergency_contacts: Array<{
    name: string;
    phone: string;
    relationship: string;
  }>;
  safe_zone_radius?: number;
  baseline_hr?: number;
}

export interface PatientResponse {
  status: string;
  message: string;
  patient_id?: string;
  patient?: any;
}

export interface AlertRecord {
  id: string;
  patient_id: string;
  type: string;
  severity: string;
  sensor_snapshot: any;
  gps_lat?: number;
  gps_lng?: number;
  status: string;
  timestamp: string;
  dispatched_at?: string;
  cancelled_at?: string;
  acknowledged_at?: string;
  escalated_at?: string;
  acknowledged_by?: string;
  response_time?: number;
  patient_name?: string;
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  database_ready: boolean;
  notification_ready: boolean;
  worker_running: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = Config.API_BASE_URL;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers(),
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {}
        
        throw new ApiError(
          `API ${response.status}: ${response.statusText}`,
          response.status,
          errorBody,
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        `Network error: ${(error as Error).message}`,
        0,
        '',
      );
    }
  }

  // Health
  async checkHealth(): Promise<HealthStatus> {
    return this.request('/health');
  }

  // Predictions
  async predict(data: SensorPayload): Promise<PredictionResponse> {
    const token = getCachedPushToken();
    return this.request('/predict', {
      method: 'POST',
      body: JSON.stringify({ ...data, device_token: data.device_token || token || undefined }),
    });
  }

  // Voice SOS
  async voiceSOS(data: SensorPayload): Promise<{ status: string; message: string; alert_id: string }> {
    const token = getCachedPushToken();
    return this.request('/voice-sos', {
      method: 'POST',
      body: JSON.stringify({ ...data, voice_triggered: true, device_token: data.device_token || token || undefined }),
    });
  }

  // Patient Management
  async registerPatient(patient: PatientPayload): Promise<PatientResponse> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(patient),
    });
  }

  async loginPatient(credentials: { email: string; password: string }): Promise<PatientResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async listPatients(): Promise<{ patients: any[] }> {
    return this.request('/patients');
  }

  // Alert Management
  async getAlertHistory(patientId: string, limit = 20): Promise<{ patient_id: string; count: number; alerts: AlertRecord[] }> {
    return this.request(`/alerts/${patientId}?limit=${limit}`);
  }

  async cancelAlert(alertId: string): Promise<{ status: string; message: string }> {
    return this.request(`/alerts/${alertId}/cancel`, {
      method: 'POST',
    });
  }

  async acknowledgeAlert(alertId: string, caregiverName = 'Patient'): Promise<{ status: string; message: string }> {
    return this.request(`/alerts/${alertId}/acknowledge?caregiver_name=${encodeURIComponent(caregiverName)}`, {
      method: 'POST',
    });
  }
}

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const api = new ApiClient();
