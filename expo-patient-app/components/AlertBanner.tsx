/**
 * AlertBanner — Active alert notification strip
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../constants/theme';

interface AlertBannerProps {
  message: string;
  severity: 'NORMAL' | 'MEDIUM' | 'CRITICAL';
  alertId?: string;
  onCancel?: (alertId: string) => void;
  countdown?: number;
}

export function AlertBanner({
  message,
  severity,
  alertId,
  onCancel,
  countdown,
}: AlertBannerProps) {
  const flashAnim = useRef(new Animated.Value(0)).current;

  const color =
    severity === 'CRITICAL'
      ? Colors.danger
      : severity === 'MEDIUM'
      ? Colors.warning
      : Colors.success;

  useEffect(() => {
    if (severity === 'CRITICAL') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(flashAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [severity]);

  const bgOpacity = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.35],
  });

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          borderColor: color + '55',
          backgroundColor: color + '15',
        },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: color,
            opacity: severity === 'CRITICAL' ? bgOpacity : 0.1,
            borderRadius: BorderRadius.md,
          },
        ]}
      />
      <View style={styles.content}>
        <Text style={styles.severityIcon}>
          {severity === 'CRITICAL' ? '🚨' : severity === 'MEDIUM' ? '⚠️' : '✅'}
        </Text>
        <View style={styles.textContainer}>
          <Text style={[styles.severity, { color }]}>
            {severity}
            {countdown !== undefined && countdown > 0 && ` (${countdown}s)`}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>
        {alertId && onCancel && severity !== 'NORMAL' && (
          <TouchableOpacity
            onPress={() => onCancel(alertId)}
            style={[styles.cancelButton, { borderColor: color + '55' }]}
          >
            <Text style={[styles.cancelText, { color }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  severityIcon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  severity: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  message: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  cancelText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
