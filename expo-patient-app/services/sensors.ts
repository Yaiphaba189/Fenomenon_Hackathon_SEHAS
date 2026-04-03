/**
 * SEHAS Sensor Service — Accelerometer & Gyroscope
 * Reads phone sensors and computes features for the LSTM model
 */

import { Accelerometer, Gyroscope } from 'expo-sensors';
import { Config } from '../constants/config';

export interface SensorReading {
  accMean: number;
  accStd: number;
  gyroPitch: number;
  gyroRoll: number;
  timestamp: number;
}

export interface RawAccelData {
  x: number;
  y: number;
  z: number;
}

export interface RawGyroData {
  x: number;
  y: number;
  z: number;
}

class SensorService {
  private accelWindow: number[] = [];
  private lastAccel: RawAccelData = { x: 0, y: 0, z: 0 };
  private lastGyro: RawGyroData = { x: 0, y: 0, z: 0 };
  private accelSubscription: any = null;
  private gyroSubscription: any = null;
  private onReadingCallback: ((reading: SensorReading) => void) | null = null;
  private readingTimer: ReturnType<typeof setInterval> | null = null;

  // Complementary filter state
  private pitch = 0;
  private roll = 0;
  private alpha = 0.98;
  private lastTimestamp = Date.now();

  async startListening(onReading: (reading: SensorReading) => void) {
    this.onReadingCallback = onReading;
    this.accelWindow = [];
    this.pitch = 0;
    this.roll = 0;

    // Set update intervals
    Accelerometer.setUpdateInterval(Config.SENSOR_POLL_INTERVAL_MS);
    Gyroscope.setUpdateInterval(Config.SENSOR_POLL_INTERVAL_MS);

    // Subscribe to accelerometer
    this.accelSubscription = Accelerometer.addListener((data: RawAccelData) => {
      this.lastAccel = data;
      const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
      this.accelWindow.push(magnitude);
      if (this.accelWindow.length > Config.SEQUENCE_WINDOW_SIZE * 5) {
        this.accelWindow = this.accelWindow.slice(-Config.SEQUENCE_WINDOW_SIZE * 5);
      }
    });

    // Subscribe to gyroscope
    this.gyroSubscription = Gyroscope.addListener((data: RawGyroData) => {
      this.lastGyro = data;
      const now = Date.now();
      const dt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      // Complementary filter for pitch/roll
      const accelPitch = Math.atan2(this.lastAccel.y, Math.sqrt(this.lastAccel.x ** 2 + this.lastAccel.z ** 2)) * (180 / Math.PI);
      const accelRoll = Math.atan2(-this.lastAccel.x, this.lastAccel.z) * (180 / Math.PI);

      this.pitch = this.alpha * (this.pitch + data.x * dt * (180 / Math.PI)) + (1 - this.alpha) * accelPitch;
      this.roll = this.alpha * (this.roll + data.y * dt * (180 / Math.PI)) + (1 - this.alpha) * accelRoll;
    });

    // Periodic feature computation
    this.readingTimer = setInterval(() => {
      if (this.accelWindow.length > 0 && this.onReadingCallback) {
        const reading = this.computeFeatures();
        this.onReadingCallback(reading);
      }
    }, 500); // Emit readings every 500ms
  }

  stopListening() {
    if (this.accelSubscription) {
      this.accelSubscription.remove();
      this.accelSubscription = null;
    }
    if (this.gyroSubscription) {
      this.gyroSubscription.remove();
      this.gyroSubscription = null;
    }
    if (this.readingTimer) {
      clearInterval(this.readingTimer);
      this.readingTimer = null;
    }
    this.onReadingCallback = null;
  }

  private computeFeatures(): SensorReading {
    const window = this.accelWindow.slice(-50); // Last ~5s at 10Hz
    const n = window.length;

    const mean = window.reduce((a, b) => a + b, 0) / n;
    const variance = window.reduce((sum, val) => sum + (val - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    return {
      accMean: parseFloat(mean.toFixed(4)),
      accStd: parseFloat(std.toFixed(4)),
      gyroPitch: parseFloat(this.pitch.toFixed(2)),
      gyroRoll: parseFloat(this.roll.toFixed(2)),
      timestamp: Date.now(),
    };
  }

  async isAvailable(): Promise<{ accelerometer: boolean; gyroscope: boolean }> {
    const [accel, gyro] = await Promise.all([
      Accelerometer.isAvailableAsync(),
      Gyroscope.isAvailableAsync(),
    ]);
    return { accelerometer: accel, gyroscope: gyro };
  }

  /**
   * Generate demo/simulated sensor data for testing without hardware
   */
  static generateDemoReading(scenario: 'normal' | 'elevated' | 'fall' | 'critical' = 'normal'): SensorReading {
    const now = Date.now();
    switch (scenario) {
      case 'elevated':
        return { accMean: 1.3 + Math.random() * 0.2, accStd: 0.35 + Math.random() * 0.1, gyroPitch: 5, gyroRoll: 3, timestamp: now };
      case 'fall':
        return { accMean: 0.6 + Math.random() * 0.1, accStd: 0.8 + Math.random() * 0.2, gyroPitch: 2, gyroRoll: -1, timestamp: now };
      case 'critical':
        return { accMean: 0.5, accStd: 0.95, gyroPitch: 0, gyroRoll: 0, timestamp: now };
      default:
        return { accMean: 1.0 + Math.random() * 0.1, accStd: 0.05 + Math.random() * 0.08, gyroPitch: 15 + Math.random() * 5, gyroRoll: 10 + Math.random() * 5, timestamp: now };
    }
  }
}

export const sensorService = new SensorService();
