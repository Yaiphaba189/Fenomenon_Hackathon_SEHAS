/**
 * VitalCard — Displays a single vital metric with animated value
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../constants/theme';

interface VitalCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  subtitle?: string;
  compact?: boolean;
}

export function VitalCard({
  title,
  value,
  unit,
  icon,
  color = Colors.primary,
  subtitle,
  compact = false,
}: VitalCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.05,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value]);

  return (
    <Animated.View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <View style={styles.header}>
        <Feather name={icon} size={16} color={Colors.textSecondary} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color }]}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={[styles.indicator, { backgroundColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.glassStroke,
    flex: 1,
    minWidth: 150,
    ...Shadows.md,
  },
  cardCompact: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  value: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes['2xl'],
    color: Colors.textPrimary,
  },
  unit: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  indicator: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
