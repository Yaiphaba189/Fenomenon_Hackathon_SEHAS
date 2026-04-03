/**
 * SEHAS Welcome Screen — Premium animated onboarding
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Config } from '../../constants/config';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entrance animation sequence
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous pulse on the heart icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background gradient orbs */}
      <View style={styles.orbContainer}>
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>

      {/* Logo & branding */}
      <Animated.View
        style={[
          styles.logoSection,
          {
            opacity: fadeAnim,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.heartContainer,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Feather name="heart" size={36} color={Colors.primary} />
        </Animated.View>
        <Text style={styles.appName}>{Config.APP_NAME}</Text>
        <Text style={styles.appSubtitle}>Smart Emergency Health Alert System</Text>
      </Animated.View>

      {/* Feature highlights */}
      <Animated.View
        style={[
          styles.features,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <FeatureItem
          icon="smartphone"
          title="Zero Hardware Needed"
          description="Uses your phone's built-in sensors"
        />
        <FeatureItem
          icon="zap"
          title="5-Second Response"
          description="AI-powered instant emergency detection"
        />
        <FeatureItem
          icon="shield"
          title="24/7 Monitoring"
          description="Continuous health tracking & alerts"
        />
        <FeatureItem
          icon="map-pin"
          title="Live Location"
          description="Auto-shares GPS with caregivers"
        />
      </Animated.View>

      {/* CTA */}
      <Animated.View
        style={[
          styles.ctaSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push('/(onboarding)/register')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaText}>Get Started</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.tagline}>{Config.APP_TAGLINE}</Text>
      </Animated.View>
    </View>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Feather name={icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 300,
    opacity: 0.08,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: Colors.primary,
    top: -80,
    right: -80,
  },
  orb2: {
    width: 250,
    height: 250,
    backgroundColor: Colors.accent,
    bottom: 100,
    left: -100,
  },
  orb3: {
    width: 200,
    height: 200,
    backgroundColor: Colors.danger,
    bottom: -50,
    right: -30,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  heartContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
  },
  heartIcon: {
    // Replaced by Feather vector icon
  },
  appName: {
    fontFamily: Typography.fontFamily.extraBold,
    fontSize: Typography.sizes['3xl'],
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  appSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  features: {
    gap: Spacing.base,
    marginBottom: Spacing['3xl'],
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassStroke,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
  },
  featureDesc: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  ctaSection: {
    alignItems: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: BorderRadius.xl,
    ...Shadows.lg,
  },
  ctaText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes.md,
    color: Colors.textInverse,
  },
  ctaArrow: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes.lg,
    color: Colors.textInverse,
  },
  tagline: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: Spacing.base,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
