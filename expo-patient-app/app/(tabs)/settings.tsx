/**
 * SEHAS Settings Screen — Profile & Configuration
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { Config } from '../../constants/config';

export default function SettingsScreen() {
  const router = useRouter();
  const { patient, setPatient, clearPatient, demoMode, setDemoMode, isMonitoring, setMonitoring } = useAppStore();
  const [apiUrl, setApiUrl] = useState(Config.API_BASE_URL);
  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState(patient?.name || '');
  const [age, setAge] = useState(String(patient?.age || ''));
  const [medicalHistory, setMedicalHistory] = useState(patient?.medicalHistory || '');
  const [safeZoneRadius, setSafeZoneRadius] = useState(String(patient?.safeZoneRadius || 500));

  const handleSaveProfile = () => {
    if (!patient) return;
    setPatient({
      ...patient,
      name: name.trim() || patient.name,
      age: parseInt(age) || patient.age,
      medicalHistory: medicalHistory.trim(),
      safeZoneRadius: parseInt(safeZoneRadius) || 500,
    });
    setEditingProfile(false);
    Alert.alert('Saved', 'Profile updated successfully.');
  };

  const handleLogout = () => {
    Alert.alert('Reset Profile', 'This will clear your profile and return to onboarding.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          setMonitoring(false);
          clearPatient();
          router.replace('/(onboarding)/welcome');
        },
      },
    ]);
  };

  const handleApiUrlChange = () => {
    const { api } = require('../../services/api');
    api.setBaseUrl(apiUrl);
    Alert.alert('Updated', `API URL set to:\n${apiUrl}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.headerTitle}>Settings</Text>
      <Text style={styles.headerSubtitle}>Configure your monitoring preferences</Text>

      {/* Patient Profile */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👤 Patient Profile</Text>
          <TouchableOpacity onPress={() => setEditingProfile(!editingProfile)}>
            <Text style={styles.editButton}>{editingProfile ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {editingProfile ? (
            <>
              <SettingInput label="Name" value={name} onChangeText={setName} />
              <SettingInput label="Age" value={age} onChangeText={setAge} keyboardType="numeric" />
              <SettingInput label="Medical History" value={medicalHistory} onChangeText={setMedicalHistory} multiline />
              <SettingInput label="Safe Zone (m)" value={safeZoneRadius} onChangeText={setSafeZoneRadius} keyboardType="numeric" />
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <SettingRow label="Name" value={patient?.name || '--'} />
              <SettingRow label="Age" value={String(patient?.age || '--')} />
              <SettingRow label="Patient ID" value={patient?.id?.slice(0, 12) + '...' || '--'} />
              <SettingRow label="Medical History" value={patient?.medicalHistory || 'None'} />
              <SettingRow label="Baseline HR" value={`${patient?.baselineHr || 72} BPM`} />
              <SettingRow label="Safe Zone" value={`${patient?.safeZoneRadius || 500}m`} />
            </>
          )}
        </View>
      </View>

      {/* Emergency Contacts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📞 Emergency Contacts</Text>
        <View style={styles.card}>
          {patient?.emergencyContacts?.length ? (
            patient.emergencyContacts.map((c, i) => (
              <View key={i} style={[styles.contactRow, i > 0 && styles.contactBorder]}>
                <View>
                  <Text style={styles.contactName}>{c.name}</Text>
                  <Text style={styles.contactInfo}>{c.relationship} • {c.phone}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No contacts configured</Text>
          )}
        </View>
      </View>

      {/* Monitoring Config */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ Monitoring</Text>
        <View style={styles.card}>
          <SettingToggle label="Demo Mode" subtitle="Use simulated sensor data" value={demoMode} onToggle={setDemoMode} />
          <SettingToggle label="Active Monitoring" subtitle="Real-time sensor collection" value={isMonitoring} onToggle={setMonitoring} />
        </View>
      </View>

      {/* Backend Config */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 Backend Connection</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>API Base URL</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://192.168.1.100:8000"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.urlSave} onPress={handleApiUrlChange}>
              <Text style={styles.urlSaveText}>Set</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.apiKeyHint}>API Key: {Config.API_KEY.slice(0, 8)}...{Config.API_KEY.slice(-4)}</Text>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ About</Text>
        <View style={styles.card}>
          <SettingRow label="App" value={Config.APP_NAME} />
          <SettingRow label="Version" value={Config.APP_VERSION} />
          <SettingRow label="Predict Interval" value={`${Config.PREDICT_INTERVAL_MS / 1000}s`} />
          <SettingRow label="Safety Window" value={`${Config.ALERT_SAFETY_WINDOW_SECONDS}s`} />
        </View>
      </View>

      {/* Reset */}
      <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
        <Text style={styles.dangerButtonText}>Reset Profile & Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SettingInput({ label, value, onChangeText, keyboardType, multiline }: any) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={rowStyles.label}>{label}</Text>
      <TextInput
        style={[rowStyles.input, multiline && { minHeight: 60, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={Colors.textMuted}
      />
    </View>
  );
}

function SettingToggle({ label, subtitle, value, onToggle }: { label: string; subtitle: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={rowStyles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.toggleLabel}>{label}</Text>
        <Text style={rowStyles.toggleSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + '66' }}
        thumbColor={value ? Colors.primary : Colors.textMuted}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  label: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textSecondary },
  value: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textPrimary, maxWidth: '55%', textAlign: 'right' },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.surfaceBorder, marginTop: Spacing.xs },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  toggleLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.base, color: Colors.textPrimary },
  toggleSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, color: Colors.textMuted, marginTop: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.xl, paddingTop: 60, paddingBottom: 40 },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.xl, color: Colors.textPrimary },
  headerSubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.xl },
  section: { marginBottom: Spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.md, color: Colors.textPrimary, marginBottom: Spacing.md },
  editButton: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.sm, color: Colors.primary },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.glassStroke },
  contactRow: { paddingVertical: Spacing.sm },
  contactBorder: { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  contactName: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.base, color: Colors.textPrimary },
  contactInfo: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: 2 },
  emptyText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textMuted },
  inputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
  urlRow: { flexDirection: 'row', gap: Spacing.sm },
  urlInput: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.surfaceBorder },
  urlSave: { backgroundColor: Colors.primary, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.base, justifyContent: 'center' },
  urlSaveText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.sm, color: Colors.textInverse },
  apiKeyHint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, color: Colors.textMuted, marginTop: Spacing.sm },
  saveButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  saveButtonText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.sm, color: Colors.textInverse },
  dangerButton: { borderWidth: 1, borderColor: Colors.danger + '44', borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', backgroundColor: Colors.dangerMuted, marginTop: Spacing.md },
  dangerButtonText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.base, color: Colors.danger },
});
