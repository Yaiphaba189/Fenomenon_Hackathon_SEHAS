/**
 * SEHAS Heart Rate Monitor — Real SCG (Seismocardiogram) via Accelerometer
 * Since Expo Go blocks proper PPG camera pixel extraction, this uses an 
 * industry-standard alternative for hackathons: measuring the mechanical
 * micro-vibrations of the heart valves against the chest wall at 60Hz.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Animated, Dimensions
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { heartRateService, HeartRateReading } from '../../services/heartRate';
import { useAppStore } from '../../store/useAppStore';

const SCAN_DURATION_SECONDS = 15;
const ACCEL_UPDATE_MS = 16; // ~60 Hz

export default function HeartRateScreen() {
  const { heartRate, setHeartRate } = useAppStore();
  const [isScanning, setIsScanning] = useState(false);
  const [manualBpm, setManualBpm] = useState('');
  
  // Progress & Timer state
  const [timeLeft, setTimeLeft] = useState(SCAN_DURATION_SECONDS);
  const [progressWidth] = useState(new Animated.Value(0));
  const [waveAnim] = useState(new Animated.Value(1)); // For pulsing UI

  // Data Buffers for SCG (Seismocardiogram) calculation
  const bufferRef = useRef<{ timestamp: number; magnitude: number }[]>([]);
  const subscriptionRef = useRef<any>(null);

  // Sync with global HR service
  useEffect(() => {
    const cb = (reading: HeartRateReading) => setHeartRate(reading);
    heartRateService.subscribe(cb);
    return () => heartRateService.unsubscribe(cb);
  }, []);

  // SCG Calculation Algorithm
  const calculateBpmFromSCG = () => {
    const buffer = bufferRef.current;
    if (buffer.length < 150) return; // Need at least ~2.5 seconds of 60Hz data

    // 1. Calculate Magnitudes and simple moving average (Low pass filter)
    const smoothed = [];
    const window = 3;
    for (let i = 0; i < buffer.length; i++) {
        let sum = 0; let count = 0;
        for(let j = Math.max(0, i-window); j <= Math.min(buffer.length-1, i+window); j++){
            sum += buffer[j].magnitude;
            count++;
        }
        smoothed.push(sum / count);
    }

    // 2. High pass filter (remove gravity 1G offset)
    const overallMean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
    const highPassed = smoothed.map(val => val - overallMean);

    // 3. Peak Detection (Aortic Valve Opening signatures)
    let peaks = [];
    for (let i = 2; i < highPassed.length - 2; i++) {
        // Is local maximum?
        if (highPassed[i] > highPassed[i-1] && highPassed[i] > highPassed[i+1]) {
            // Adaptive threshold: heartbeats usually cause > 0.015 G variance on chest
            let localMean = 0; let c = 0;
            for(let j = Math.max(0, i-15); j <= Math.min(highPassed.length-1, i+15); j++){
                localMean += Math.abs(highPassed[j]); 
                c++;
            }
            localMean = localMean / c;
            
            if (highPassed[i] > localMean + 0.01) {
                peaks.push(buffer[i].timestamp);
                i += 15; // Skip ~250ms (Cap at ~240 BPM to prevent double counting sounds)
            }
        }
    }

    // 4. BPM Calculation
    if (peaks.length >= 3) {
      let intervals = [];
      for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i-1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);

      if (bpm >= 45 && bpm <= 190) {
         return bpm;
      }
    }
    return null;
  };

  const handleSensorData = (data: { x: number; y: number; z: number }) => {
    // Magnitude of total acceleration vector
    const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
    bufferRef.current.push({ timestamp: Date.now(), magnitude });

    // Keep memory bounded to ~10 seconds history
    if (bufferRef.current.length > (1000 / ACCEL_UPDATE_MS) * 10) {
      bufferRef.current.shift();
    }
  };

  const startSCG = async () => {
    setIsScanning(true);
    setTimeLeft(SCAN_DURATION_SECONDS);
    bufferRef.current = [];
    progressWidth.setValue(0);
    
    // UI Animations
    Animated.timing(progressWidth, {
      toValue: 100,
      duration: SCAN_DURATION_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

    // Make the heart pulse visually rapidly during scan
    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(waveAnim, { toValue: 1, duration: 400, useNativeDriver: true })
      ])
    ).start();

    // 60 Hz high-frequency polling
    Accelerometer.setUpdateInterval(ACCEL_UPDATE_MS);
    subscriptionRef.current = Accelerometer.addListener(handleSensorData);
  };

  const stopSCG = () => {
    if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
    }
    setIsScanning(false);
    progressWidth.stopAnimation();
    waveAnim.stopAnimation();
    setTimeLeft(SCAN_DURATION_SECONDS);
    
    // Finalize Calculation
    const calculatedBpm = calculateBpmFromSCG();
    if (calculatedBpm) {
        heartRateService.setRealReading(calculatedBpm, 0.95);
    } else {
        // Did not extract clear peaks. Fallback to warning UI.
        alert("Scan Failed: Could not detect clear heartbeat. Ensure phone is tightly pressed against your chest and you remain silent and still.");
    }
  };

  // Timer logic for 15s scan
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isScanning) {
      if (timeLeft > 0) {
        // Calculate partial BPM for UI feedback while scanning
        if (timeLeft % 2 === 0) {
            const partial = calculateBpmFromSCG();
            if (partial) {
                heartRateService.setRealReading(partial, 0.5); // Lower confidence during scan
            }
        }
        timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      } else {
        stopSCG();
      }
    }
    return () => clearTimeout(timer);
  }, [isScanning, timeLeft]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
        if (subscriptionRef.current) subscriptionRef.current.remove();
    };
  }, []);

  const handleSetManualBpm = () => {
    const parsed = parseInt(manualBpm, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 250) {
      heartRateService.setRealReading(parsed, 1.0);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Real-Time Heart Rate</Text>
          <Text style={styles.headerSubtitle}>Powered by Chest Seismocardiography</Text>
        </View>

        {/* Current BPM Display */}
        <View style={styles.bpmSection}>
          <Animated.View style={[
             styles.bpmCircle, 
             { borderColor: isScanning ? Colors.primary : Colors.surfaceBorder },
             { transform: [{ scale: waveAnim }] }
          ]}>
            <View style={[styles.bpmInner, { backgroundColor: isScanning ? Colors.primary + '22' : Colors.surface }]}>
              <Text style={{ fontSize: 28, marginBottom: Spacing.xs }}>❤️</Text>
              <Text style={[styles.bpmValue, { color: heartRate ? Colors.primary : Colors.textMuted }]}>
                {heartRate?.bpm ?? '--'}
              </Text>
              <Text style={styles.bpmUnit}>BPM</Text>
            </View>
          </Animated.View>
        </View>

        {/* SCG Scanner Section */}
        <View style={styles.scannerCard}>
          {/* Safety & Instruction Banner */}
          <View style={styles.instructionBanner}>
            <Text style={styles.instructionBannerTitle}>Seismocardiogram (SCG) Instructions</Text>
            <Text style={styles.instructionBannerText}>1. Press "Start Scan".</Text>
            <Text style={styles.instructionBannerText}>2. Place phone completely flat against your bare chest (over your heart).</Text>
            <Text style={styles.instructionBannerText}>3. Hold your breath gently and stay perfectly still for 15 seconds.</Text>
          </View>

          {isScanning && (
             <View style={styles.scanProgressArea}>
                 <Text style={styles.scanTimerText}>{timeLeft} seconds remaining...</Text>
                 <Text style={styles.scanSubText}>Extracting micro-vibrations...</Text>
                 <View style={styles.progressBarBg}>
                   <Animated.View style={[styles.progressBarFill, {
                     width: progressWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] })
                   }]} />
                 </View>
             </View>
          )}

          <TouchableOpacity 
            style={[styles.toggleScanButton, isScanning ? styles.toggleScanButtonActive : null]}
            onPress={isScanning ? stopSCG : startSCG}
          >
            <Text style={[styles.toggleScanText, isScanning && {color: Colors.white}]}>
              {isScanning ? "Stop Scan Early" : "Start 15s SCG Scan"}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Manual HR Entry */}
        <View style={styles.manualEntryCard}>
          <Text style={styles.manualEntryTitle}>External Sync (Smartwatch)</Text>
          <Text style={styles.manualEntryDesc}>Alternatively, input your real BPM directly from a medical device or Apple Watch.</Text>
          
          <View style={styles.inputRow}>
            <TextInput
              style={styles.bpmInput}
              placeholder="e.g. 75"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={manualBpm}
              onChangeText={setManualBpm}
            />
            <TouchableOpacity onPress={handleSetManualBpm}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDark]}
                style={styles.saveButton}
              >
                <Text style={styles.saveButtonText}>Set BPM</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  contentContainer: { paddingHorizontal: Spacing.xl, paddingTop: 60, paddingBottom: 100 },
  header: { marginBottom: Spacing.xl },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.xl, color: Colors.textPrimary },
  headerSubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  
  bpmSection: { alignItems: 'center', marginBottom: Spacing.xl },
  bpmCircle: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  bpmInner: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center' },
  bpmValue: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.sizes['4xl'] },
  bpmUnit: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: -4 },
  
  scannerCard: { alignItems: 'center', backgroundColor: Colors.surface, padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.xl, borderWidth: 1, borderColor: Colors.glassStroke },
  
  instructionBanner: { backgroundColor: Colors.accent + '11', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.accent + '33', marginBottom: Spacing.lg, width: '100%' },
  instructionBannerTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.sm, color: Colors.accent, marginBottom: Spacing.xs },
  instructionBannerText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.xs, color: Colors.textSecondary, marginBottom: 4, lineHeight: 18 },
  
  scanProgressArea: { width: '100%', alignItems: 'center', marginBottom: Spacing.lg },
  scanTimerText: { color: Colors.primary, fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.lg, marginBottom: 2 },
  scanSubText: { color: Colors.textSecondary, fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, marginBottom: Spacing.md },
  progressBarBg: { width: '100%', height: 8, backgroundColor: Colors.surfaceElevated, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  
  toggleScanButton: { width: '100%', paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', ...Shadows.sm },
  toggleScanButtonActive: { backgroundColor: Colors.danger, borderColor: Colors.dangerDark },
  toggleScanText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.base, color: Colors.primary },
  
  manualEntryCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.glassStroke },
  manualEntryTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.base, color: Colors.textPrimary, marginBottom: Spacing.xs },
  manualEntryDesc: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  inputRow: { flexDirection: 'row', gap: Spacing.md },
  bpmInput: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.lg, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.surfaceBorder },
  saveButton: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, justifyContent: 'center' },
  saveButtonText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.sm, color: Colors.textInverse },
});
