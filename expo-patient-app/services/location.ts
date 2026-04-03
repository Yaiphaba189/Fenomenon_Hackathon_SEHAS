/**
 * SEHAS Location Service — GPS & Geofencing
 */

import * as Location from 'expo-location';
import { Config } from '../constants/config';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  timestamp: number;
  mapsLink: string;
}

class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;
  private onLocationCallback: ((location: LocationData) => void) | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  async getCurrentLocation(): Promise<LocationData | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return this.formatLocation(location);
    } catch (error) {
      console.error('Location error:', error);
      return null;
    }
  }

  async startWatching(onLocation: (location: LocationData) => void) {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    this.onLocationCallback = onLocation;

    this.watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: Config.GPS_UPDATE_INTERVAL_MS,
        distanceInterval: 5, // meters
      },
      (location) => {
        if (this.onLocationCallback) {
          this.onLocationCallback(this.formatLocation(location));
        }
      },
    );
  }

  stopWatching() {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
    this.onLocationCallback = null;
  }

  private formatLocation(location: Location.LocationObject): LocationData {
    const { latitude, longitude } = location.coords;
    return {
      latitude,
      longitude,
      accuracy: location.coords.accuracy,
      altitude: location.coords.altitude,
      timestamp: location.timestamp,
      mapsLink: `https://maps.google.com/?q=${latitude},${longitude}`,
    };
  }

  /**
   * Haversine distance in meters
   */
  static distanceBetween(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLambda = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Check if location is within safe zone
   */
  static isInSafeZone(
    currentLat: number,
    currentLng: number,
    homeLat: number,
    homeLng: number,
    radiusMeters: number,
  ): { safe: boolean; distance: number; percentOfRadius: number } {
    const distance = LocationService.distanceBetween(currentLat, currentLng, homeLat, homeLng);
    return {
      safe: distance <= radiusMeters,
      distance: Math.round(distance),
      percentOfRadius: distance / radiusMeters,
    };
  }

  /**
   * Demo location for testing
   */
  static getDemoLocation(): LocationData {
    return {
      latitude: 12.9716 + (Math.random() - 0.5) * 0.001,
      longitude: 77.5946 + (Math.random() - 0.5) * 0.001,
      accuracy: 15,
      altitude: 920,
      timestamp: Date.now(),
      mapsLink: 'https://maps.google.com/?q=12.9716,77.5946',
    };
  }
}

export const locationService = new LocationService();
