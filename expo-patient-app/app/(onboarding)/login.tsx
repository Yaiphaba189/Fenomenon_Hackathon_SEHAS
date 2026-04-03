/**
 * SEHAS Patient Login Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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
import { Config } from '../../constants/config';

export default function LoginScreen() {
  const router = useRouter();
  const setPatient = useAppStore((s) => s.setPatient);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // DEBUG: Test raw connection to backend
  const testConnection = async () => {
    const url = `${Config.API_BASE_URL}/health`;
    Alert.alert('Testing...', `Connecting to:\n${url}`);
    try {
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      Alert.alert('✅ SUCCESS', JSON.stringify(data, null, 2));
    } catch (err: any) {
      Alert.alert('❌ FAILED', `Error: ${err.message}\n\nURL: ${url}`);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Required', 'Please enter a valid email.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.loginPatient({
        email: email.trim().toLowerCase(),
        password: password,
      });

      const p = response.patient;
      
      setPatient({
        id: p.id,
        name: p.name,
        age: p.age,
        medicalHistory: p.medical_history || '',
        emergencyContacts: p.emergency_contacts || [],
        safeZoneRadius: p.safe_zone_radius || 500,
        baselineHr: p.baseline_hr || 72,
      });

      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', error.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Welcome Back</Text>
          <Text style={styles.headerSubtitle}>
            Log in to continue health monitoring
          </Text>
        </View>

        {/* Inputs */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="john@example.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleLogin}
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
                <Text style={styles.submitText}>Log In</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Back to register */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => router.push('/(onboarding)/register')}
          >
            <Text style={styles.skipText}>Don't have an account? Register</Text>
          </TouchableOpacity>

          {/* DEBUG: Remove after fixing */}
          <TouchableOpacity
            style={{ marginTop: 20, padding: 14, backgroundColor: '#ff6600', borderRadius: 10, alignItems: 'center' }}
            onPress={testConnection}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>🔧 Test Server Connection</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['4xl'] + 40,
  },
  header: {
    marginBottom: Spacing['2xl'],
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes['3xl'],
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  form: {
    marginTop: Spacing.xl,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
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
  submitButton: {
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
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
