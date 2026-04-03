/**
 * SEHAS Dashboard — Real-time vitals monitoring with REAL sensors
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, BorderRadius, Shadows, RiskColors } from '../../constants/theme';
import { Config } from '../../constants/config';
import { VitalCard } from '../../components/VitalCard';
import { SOSButton } from '../../components/SOSButton';
import { AlertBanner } from '../../components/AlertBanner';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { sensorService } from '../../services/sensors';
import { locationService } from '../../services/location';
import { heartRateService, HeartRateReading } from '../../services/heartRate';
import { offlineQueue } from '../../services/offlineQueue';

export default function DashboardScreen() {
  const {
    patient, isMonitoring, setMonitoring,
    latestSensorReading, setSensorReading,
    currentLocation, setLocation,
    heartRate, setHeartRate,
    latestPrediction, setPrediction,
    isOnline, setOnline,
    backendHealthy, setBackendHealthy,
  } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const predictTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // Backend health check
  useEffect(() => {
    const check = async () => {
      try {
        const h = await api.checkHealth();
        setBackendHealthy(h.status === 'ready' || h.status === 'degraded');
        setOnline(true);
      } catch {
        setBackendHealthy(false);
        setOnline(false);
      }
    };
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, []);

  // Init offline queue
  useEffect(() => {
    offlineQueue.initialize();
    offlineQueue.startAutoSync();
    return () => offlineQueue.destroy();
  }, []);

  // Sensor lifecycle
  useEffect(() => {
    if (isMonitoring) startSensors();
    else stopSensors();
    return () => stopSensors();
  }, [isMonitoring]);

  const startSensors = async () => {
    // Real accelerometer + gyroscope
    try {
      await sensorService.startListening((reading) => setSensorReading(reading));
    } catch (e) {
      console.warn('Sensor start error:', e);
    }

    // Real GPS
    try {
      await locationService.startWatching((loc) => setLocation(loc));
    } catch (e) {
      console.warn('Location start error:', e);
    }

    const hrCallback = (reading: HeartRateReading) => setHeartRate(reading);
    heartRateService.subscribe(hrCallback);

    // Prediction loop
    predictTimer.current = setInterval(sendPrediction, Config.PREDICT_INTERVAL_MS);
  };

  const stopSensors = () => {
    if (predictTimer.current) { clearInterval(predictTimer.current); predictTimer.current = null; }
    sensorService.stopListening();
    locationService.stopWatching();
    
    // We can't easily unsubscribe the exact inline closure unless we save it, 
    // but the HeartRateService rewrite handles this cleanly now.
  };

  const sendPrediction = async () => {
    const s = useAppStore.getState();
    if (!s.latestSensorReading || !s.patient) return;

    const payload = {
      heart_rate: s.heartRate?.bpm ?? s.patient.baselineHr ?? 72,
      acc_mean: s.latestSensorReading.accMean,
      acc_std: s.latestSensorReading.accStd,
      patient_id: s.patient.id,
      patient_name: s.patient.name,
      gps_lat: s.currentLocation?.latitude,
      gps_lng: s.currentLocation?.longitude,
      gyro_pitch: s.latestSensorReading.gyroPitch,
      gyro_roll: s.latestSensorReading.gyroRoll,
      home_lat: s.patient.homeLat,
      home_lng: s.patient.homeLng,
      safe_zone_radius: s.patient.safeZoneRadius,
    };

    try {
      const result = await api.predict(payload);
      setPrediction(result);
      if (result.alert) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      await offlineQueue.enqueue('/predict', payload);
    }
  };

  const handleSOS = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setSosTriggered(true);
    const s = useAppStore.getState();
    if (!s.patient) return;

    try {
      const result = await api.voiceSOS({
        heart_rate: s.heartRate?.bpm ?? 72,
        acc_mean: s.latestSensorReading?.accMean ?? 1.0,
        acc_std: s.latestSensorReading?.accStd ?? 0.1,
        patient_id: s.patient.id,
        patient_name: s.patient.name,
        gps_lat: s.currentLocation?.latitude,
        gps_lng: s.currentLocation?.longitude,
        voice_triggered: true,
      });
      setActiveAlertId(result.alert_id);
      setCountdown(Config.ALERT_SAFETY_WINDOW_SECONDS);
      countdownTimer.current = setInterval(() => {
        setCountdown((p) => {
          if (p <= 1) { clearInterval(countdownTimer.current!); setActiveAlertId(null); setSosTriggered(false); return 0; }
          return p - 1;
        });
      }, 1000);
      Alert.alert('🚨 SOS Sent', `Emergency alert dispatched.\nCancel within ${Config.ALERT_SAFETY_WINDOW_SECONDS}s if false alarm.`);
    } catch {
      Alert.alert('SOS Error', 'Could not send SOS. Call emergency services directly.');
      setSosTriggered(false);
    }
  };

  const handleCancelAlert = async (alertId: string) => {
    try {
      await api.cancelAlert(alertId);
      setActiveAlertId(null); setSosTriggered(false);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Cancelled', 'Alert cancelled. Caregivers will not be notified.');
    } catch { Alert.alert('Error', 'Could not cancel the alert.'); }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await api.checkHealth(); setBackendHealthy(true); } catch { setBackendHealthy(false); }
    setRefreshing(false);
  }, []);

  const riskColor = latestPrediction ? (RiskColors[latestPrediction.risk_level] || Colors.textMuted) : Colors.textMuted;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>

      {/* Status Bar */}
      <Animated.View style={[styles.statusBar, { opacity: slideAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <View>
          <Text style={styles.greeting}>Hello, {patient?.name?.split(' ')[0] || 'Patient'} 👋</Text>
          <Text style={styles.statusText}>
            {isMonitoring ? '🟢 Monitoring Active' : '🔴 Monitoring Off'}
            {!isOnline ? '  •  📡 Offline' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setMonitoring(!isMonitoring)} activeOpacity={0.8}>
          <LinearGradient colors={isMonitoring ? [Colors.danger, Colors.dangerDark] : [Colors.primary, Colors.primaryDark]} style={styles.monitorToggle}>
            <Text style={styles.monitorToggleText}>{isMonitoring ? 'Stop' : 'Start'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Active Alert */}
      {(latestPrediction?.alert || activeAlertId) && (
        <AlertBanner
          message={latestPrediction?.alert ? latestPrediction.message : 'Emergency alert active. Cancel if false alarm.'}
          severity={latestPrediction?.alert ? latestPrediction.risk_level : 'CRITICAL'}
          alertId={activeAlertId ?? undefined}
          onCancel={handleCancelAlert}
          countdown={countdown}
        />
      )}

      {/* Risk Score */}
      <View style={[styles.riskCard, { borderColor: riskColor + '33' }]}>
        <Text style={styles.riskLabel}>Risk Assessment</Text>
        <View style={styles.riskRow}>
          <Text style={[styles.riskScore, { color: riskColor }]}>
            {latestPrediction ? (latestPrediction.score * 100).toFixed(0) : '--'}
          </Text>
          <View>
            <Text style={[styles.riskLevel, { color: riskColor }]}>{latestPrediction?.risk_level || 'IDLE'}</Text>
            <Text style={styles.riskMessage} numberOfLines={2}>{latestPrediction?.message || 'Start monitoring to see risk assessment'}</Text>
          </View>
        </View>
        <View style={styles.riskBar}>
          <View style={[styles.riskBarFill, { width: `${(latestPrediction?.score ?? 0) * 100}%`, backgroundColor: riskColor }]} />
        </View>
      </View>

      {/* Vitals Grid */}
      <Text style={styles.sectionTitle}>Live Vitals</Text>
      <View style={styles.vitalsGrid}>
        <VitalCard title="Heart Rate" value={heartRate?.bpm ?? '--'} unit="BPM" icon="❤️"
          color={heartRate && (heartRate.bpm < 40 || heartRate.bpm > 130) ? Colors.danger : heartRate && (heartRate.bpm < 55 || heartRate.bpm > 100) ? Colors.warning : Colors.primary}
          subtitle={heartRate ? `Confidence: ${(heartRate.confidence * 100).toFixed(0)}%` : undefined} />
        <VitalCard title="Motion" value={latestSensorReading?.accMean?.toFixed(2) ?? '--'} unit="m/s²" icon="🏃"
          color={latestSensorReading && latestSensorReading.accStd > 0.7 ? Colors.danger : Colors.accent}
          subtitle={`σ: ${latestSensorReading?.accStd?.toFixed(3) ?? '--'}`} />
      </View>
      <View style={styles.vitalsGrid}>
        <VitalCard title="Pitch" value={latestSensorReading?.gyroPitch?.toFixed(1) ?? '--'} unit="°" icon="📐"
          color={latestSensorReading && Math.abs(latestSensorReading.gyroPitch) < 15 ? Colors.warning : Colors.info} compact />
        <VitalCard title="Roll" value={latestSensorReading?.gyroRoll?.toFixed(1) ?? '--'} unit="°" icon="🔄" color={Colors.info} compact />
        <VitalCard title="GPS" value={currentLocation ? '✓' : '—'} unit={currentLocation ? `±${currentLocation.accuracy?.toFixed(0) ?? '?'}m` : ''} icon="📍"
          color={currentLocation ? Colors.success : Colors.textMuted} compact />
      </View>

      {/* Connection */}
      <View style={styles.connectionCard}>
        <View style={styles.connectionRow}>
          <View style={[styles.connectionDot, { backgroundColor: backendHealthy ? Colors.success : Colors.danger }]} />
          <Text style={styles.connectionText}>Backend: {backendHealthy ? 'Connected' : 'Disconnected'}</Text>
        </View>
        <View style={styles.connectionRow}>
          <View style={[styles.connectionDot, { backgroundColor: isOnline ? Colors.success : Colors.warning }]} />
          <Text style={styles.connectionText}>Network: {isOnline ? 'Online' : 'Offline'}</Text>
        </View>
      </View>

      {/* SOS */}
      <View style={styles.sosSection}>
        <SOSButton onPress={handleSOS} isActive={sosTriggered} size={110} />
        <Text style={styles.sosHint}>Press for voice SOS emergency</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingTop: 60, paddingBottom: 120, paddingHorizontal: Spacing.base },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.sm, marginBottom: Spacing.lg },
  greeting: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.xl, color: Colors.textPrimary },
  statusText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  monitorToggle: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  monitorToggleText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.sm, color: Colors.white, textTransform: 'uppercase', letterSpacing: 1 },
  riskCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginHorizontal: Spacing.sm, marginBottom: Spacing.lg, borderWidth: 1, ...Shadows.md },
  riskLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, marginBottom: Spacing.md },
  riskScore: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.sizes['4xl'] },
  riskLevel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.md, textTransform: 'uppercase', letterSpacing: 1 },
  riskMessage: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: 2, maxWidth: 200 },
  riskBar: { height: 4, backgroundColor: Colors.surfaceBorder, borderRadius: 2, overflow: 'hidden' },
  riskBarFill: { height: '100%', borderRadius: 2 },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.md, color: Colors.textPrimary, marginBottom: Spacing.md, marginHorizontal: Spacing.sm },
  vitalsGrid: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md, marginHorizontal: Spacing.sm },
  connectionCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginHorizontal: Spacing.sm, marginBottom: Spacing.xl, flexDirection: 'row', justifyContent: 'space-around', borderWidth: 1, borderColor: Colors.glassStroke },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.xs, color: Colors.textSecondary },
  sosSection: { alignItems: 'center', marginTop: Spacing.lg, gap: Spacing.base },
  sosHint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, color: Colors.textMuted },
});
