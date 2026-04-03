/**
 * SEHAS Heart Rate Service
 * Stores the actual manually inputted or hardware-linked heart rate.
 */

export interface HeartRateReading {
  bpm: number;
  confidence: number;
  timestamp: number;
  waveformValues: number[];
}

export class HeartRateService {
  private currentReading: HeartRateReading | null = null;
  private subscribers: Set<(reading: HeartRateReading) => void> = new Set();

  setRealReading(bpm: number, confidence: number = 1.0) {
    const reading: HeartRateReading = {
      bpm,
      confidence,
      timestamp: Date.now(),
      waveformValues: [],
    };
    this.currentReading = reading;
    this.subscribers.forEach((cb) => cb(reading));
  }

  subscribe(callback: (reading: HeartRateReading) => void) {
    this.subscribers.add(callback);
    if (this.currentReading) {
      callback(this.currentReading);
    }
  }

  unsubscribe(callback: (reading: HeartRateReading) => void) {
    this.subscribers.delete(callback);
  }
}

export const heartRateService = new HeartRateService();
