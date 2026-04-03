/**
 * SEHAS App Configuration
 */

export const Config = {
  // Backend API
  API_BASE_URL: 'http://16.171.46.26:8000', // AWS EC2 Cloud Backend
  API_KEY: 'IlrsksA-eTi2AcRj4BrirqLLz0iIxpm9MF0YYzZGh0XUjehMaOUE87hcqFFq8k-0',

  // Sensor settings
  SENSOR_POLL_INTERVAL_MS: 100, // 10Hz → good balance of accuracy & battery
  GPS_UPDATE_INTERVAL_MS: 5000, // 5s
  SEQUENCE_WINDOW_SIZE: 20, // LSTM input window
  PREDICT_INTERVAL_MS: 3000, // Send predictions every 3s

  // Heart Rate PPG
  PPG_CAPTURE_DURATION_MS: 15000, // 15s capture window
  PPG_SAMPLE_RATE: 30, // ~30 fps camera

  // Alert settings
  ALERT_SAFETY_WINDOW_SECONDS: 10,
  ALERT_ESCALATION_SECONDS: 120,

  // Geofencing
  DEFAULT_SAFE_ZONE_RADIUS: 500, // meters
  GEOFENCE_WARNING_DISTANCE: 0.8, // 80% of radius triggers warning

  // Offline queue
  MAX_OFFLINE_QUEUE_SIZE: 500,
  OFFLINE_RETRY_INTERVAL_MS: 10000, // 10s

  // Demo mode
  DEMO_MODE: false, // Use real sensors

  // App info
  APP_NAME: 'SEHAS',
  APP_VERSION: '1.0.0',
  APP_TAGLINE: 'Zero hardware, zero delay, infinite peace of mind.',
};
