/**
 * SEHAS Offline Queue Service
 * Gracefully handles environments where expo-sqlite is unavailable (Expo Go)
 * Falls back to in-memory queue when SQLite is not available
 */

import NetInfo from '@react-native-community/netinfo';
import { api, SensorPayload } from './api';
import { Config } from '../constants/config';

interface QueuedItem {
  id: number;
  endpoint: string;
  payload: SensorPayload;
  idempotencyKey: string;
  createdAt: number;
  retryCount: number;
}

class OfflineQueueService {
  private queue: QueuedItem[] = [];
  private nextId = 1;
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for network changes
    try {
      this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable) {
          this.syncQueue();
        }
      });
    } catch (e) {
      console.warn('NetInfo not available:', e);
    }
  }

  async enqueue(endpoint: string, payload: SensorPayload): Promise<string> {
    if (!this.initialized) await this.initialize();

    const idempotencyKey = `${endpoint}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.queue.push({
      id: this.nextId++,
      endpoint,
      payload,
      idempotencyKey,
      createdAt: Date.now(),
      retryCount: 0,
    });

    // Trim to max size
    if (this.queue.length > Config.MAX_OFFLINE_QUEUE_SIZE) {
      this.queue = this.queue.slice(-Config.MAX_OFFLINE_QUEUE_SIZE);
    }

    return idempotencyKey;
  }

  async getQueueSize(): Promise<number> {
    return this.queue.length;
  }

  async syncQueue() {
    if (this.isSyncing || this.queue.length === 0) return;

    let isOnline = true;
    try {
      const netState = await NetInfo.fetch();
      isOnline = !!netState.isConnected;
    } catch {
      // If NetInfo isn't available, try anyway
    }

    if (!isOnline) return;

    this.isSyncing = true;
    try {
      const batch = this.queue.slice(0, 20);

      for (const item of batch) {
        try {
          if (item.endpoint === '/predict') {
            await api.predict(item.payload);
          } else if (item.endpoint === '/voice-sos') {
            await api.voiceSOS(item.payload);
          }
          // Success — remove from queue
          this.queue = this.queue.filter((q) => q.id !== item.id);
        } catch (error: any) {
          if (error.status && error.status >= 400 && error.status < 500) {
            // Client error — remove, it won't succeed on retry
            this.queue = this.queue.filter((q) => q.id !== item.id);
          } else {
            // Network/server error — increment retry
            const idx = this.queue.findIndex((q) => q.id === item.id);
            if (idx >= 0) this.queue[idx].retryCount++;
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  startAutoSync() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      this.syncQueue();
    }, Config.OFFLINE_RETRY_INTERVAL_MS);
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async clearQueue() {
    this.queue = [];
  }

  destroy() {
    this.stopAutoSync();
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }
}

export const offlineQueue = new OfflineQueueService();
