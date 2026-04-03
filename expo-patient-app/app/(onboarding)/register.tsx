/**
 * SEHAS Patient Registration Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const setPatient = useAppStore((s) => s.setPatient);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [safeZoneRadius, setSafeZoneRadius] = useState('500');
  const [baselineHr, setBaselineHr] = useState('72');
  const [contacts, setContacts] = useState<EmergencyContact[]>([
    { name: '', phone: '', relationship: '' },
  ]);
  const [loading, setLoading] = useState(false);

  const updateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const addContact = () => {
    if (contacts.length < 5) {
      setContacts([...contacts, { name: '', phone: '', relationship: '' }]);
    }
  };

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  const handleRegister = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Required', 'Please enter a valid email.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      Alert.alert('Required', 'Password must be at least 6 characters.');
      return;
    }
    if (!age || parseInt(age) < 0 || parseInt(age) > 130) {
      Alert.alert('Required', 'Please enter a valid age.');
      return;
    }
    const validContacts = contacts.filter((c) => c.name.trim() && c.phone.trim() && c.relationship.trim());
    if (validContacts.length === 0) {
      Alert.alert('Required', 'Please add at least one emergency contact.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.registerPatient({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password,
        age: parseInt(age),
        medical_history: medicalHistory.trim() || undefined,
        emergency_contacts: validContacts,
        safe_zone_radius: parseInt(safeZoneRadius) || 500,
        baseline_hr: parseFloat(baselineHr) || 72,
      });

      setPatient({
        id: response.patient_id || '00000000-0000-0000-0000-000000000000'.replace(/0/g, () => (Math.random()*16|0).toString(16)),
        name: name.trim(),
        age: parseInt(age),
        medicalHistory: medicalHistory.trim(),
        emergencyContacts: validContacts,
        safeZoneRadius: parseInt(safeZoneRadius) || 500,
        baselineHr: parseFloat(baselineHr) || 72,
      });

      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      console.error('Registration error:', error);
      
      const status = error.status || 0;
      const message = error.message || 'An unexpected error occurred';
      
      if (status === 401) {
        Alert.alert('Authentication Failed', 'The server rejected the API Key. Please verify your SEHAS_API_KEY configuration.');
      } else if (status === 400) {
        Alert.alert('Registration Failed', 'This email is already registered. Please login instead.');
      } else if (status >= 500) {
        Alert.alert('Server Error', 'The server encountered an error processing your registration. Please try again later.');
      } else {
        // Genuine network error or status 0 (likely blocked by Android cleartext policy)
        const localId = 'local-' + '00000000-0000-0000-0000-000000000000'.replace(/0/g, () => (Math.random()*16|0).toString(16));
        setPatient({
          id: localId,
          name: name.trim(),
          age: parseInt(age),
          medicalHistory: medicalHistory.trim(),
          emergencyContacts: validContacts,
          safeZoneRadius: parseInt(safeZoneRadius) || 500,
          baselineHr: parseFloat(baselineHr) || 72,
        });
        Alert.alert(
          'Offline Mode',
          `Could not reach the server (${message}). You have been registered locally. Data will sync when online.`,
          [{ text: 'OK', onPress: () => router.replace('/(tabs)/dashboard') }],
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Patient Profile</Text>
          <Text style={styles.headerSubtitle}>
            Set up your health monitoring profile
          </Text>
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <InputField
            label="Full Name"
            value={name}
            onChangeText={setName}
            placeholder="John Doe"
          />
          <InputField
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="john@example.com"
            keyboardType="email-address"
          />
          <InputField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            isPassword
          />
          <View style={styles.row}>
            <View style={styles.halfField}>
              <InputField
                label="Age"
                value={age}
                onChangeText={setAge}
                placeholder="65"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.halfField}>
              <InputField
                label="Baseline HR"
                value={baselineHr}
                onChangeText={setBaselineHr}
                placeholder="72"
                keyboardType="numeric"
                suffix="BPM"
              />
            </View>
          </View>
          <InputField
            label="Medical History"
            value={medicalHistory}
            onChangeText={setMedicalHistory}
            placeholder="Hypertension, Diabetes, etc."
            multiline
          />
          <InputField
            label="Safe Zone Radius"
            value={safeZoneRadius}
            onChangeText={setSafeZoneRadius}
            placeholder="500"
            keyboardType="numeric"
            suffix="meters"
          />
        </View>

        {/* Emergency Contacts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          {contacts.map((contact, index) => (
            <View key={index} style={styles.contactCard}>
              <View style={styles.contactHeader}>
                <Text style={styles.contactLabel}>Contact {index + 1}</Text>
                {contacts.length > 1 && (
                  <TouchableOpacity onPress={() => removeContact(index)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
              <InputField
                label="Name"
                value={contact.name}
                onChangeText={(v) => updateContact(index, 'name', v)}
                placeholder="Jane Doe"
              />
              <InputField
                label="Phone"
                value={contact.phone}
                onChangeText={(v) => updateContact(index, 'phone', v)}
                placeholder="+91 9876543210"
                keyboardType="phone-pad"
              />
              <InputField
                label="Relationship"
                value={contact.relationship}
                onChangeText={(v) => updateContact(index, 'relationship', v)}
                placeholder="Spouse, Son, Doctor..."
              />
            </View>
          ))}
          {contacts.length < 5 && (
            <TouchableOpacity style={styles.addButton} onPress={addContact}>
              <Text style={styles.addButtonText}>+ Add Contact</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={loading ? [Colors.textMuted, Colors.textMuted] : [Colors.primary, Colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButton}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.submitText}>Create Profile & Start Monitoring</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Skip for demo */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => router.push('/(onboarding)/login' as any)}
        >
          <Text style={styles.skipText}>Already registered? Log in instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  suffix,
  isPassword = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: any;
  multiline?: boolean;
  suffix?: string;
  isPassword?: boolean;
}) {
  return (
    <View style={inputStyles.container}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={inputStyles.inputRow}>
        <TextInput
          style={[inputStyles.input, multiline && inputStyles.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
          secureTextEntry={isPassword}
        />
        {suffix && <Text style={inputStyles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suffix: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['4xl'] + 20,
    paddingBottom: Spacing['4xl'],
  },
  header: {
    marginBottom: Spacing['2xl'],
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes['2xl'],
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.sizes.md,
    color: Colors.primary,
    marginBottom: Spacing.base,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  halfField: {
    flex: 1,
  },
  contactCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassStroke,
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  contactLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  removeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.sm,
    color: Colors.danger,
  },
  addButton: {
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  addButtonText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.sizes.sm,
    color: Colors.primary,
  },
  submitButton: {
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    ...Shadows.lg,
  },
  submitText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes.md,
    color: Colors.textInverse,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing.base,
    marginTop: Spacing.md,
  },
  skipText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
