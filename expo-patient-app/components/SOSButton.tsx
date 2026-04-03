/**
 * SOSButton — Large emergency trigger with pulse animation
 */

import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, View } from 'react-native';
import { Colors, Typography, Shadows } from '../constants/theme';

interface SOSButtonProps {
  onPress: () => void;
  isActive?: boolean;
  size?: number;
}

export function SOSButton({ onPress, isActive = false, size = 100 }: SOSButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            width: size + 40,
            height: size + 40,
            borderRadius: (size + 40) / 2,
            opacity: glowAnim,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      {/* Middle glow ring */}
      <Animated.View
        style={[
          styles.midRing,
          {
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            opacity: glowAnim,
          },
        ]}
      />
      {/* Button */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          isActive && styles.buttonActive,
          Shadows.glow(Colors.danger),
        ]}
      >
        <Text style={styles.sosText}>SOS</Text>
        <Text style={styles.sosSubtext}>EMERGENCY</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    backgroundColor: Colors.dangerMuted,
    borderWidth: 1,
    borderColor: Colors.danger + '33',
  },
  midRing: {
    position: 'absolute',
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger + '22',
  },
  button: {
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.danger + 'AA',
  },
  buttonActive: {
    backgroundColor: Colors.dangerDark,
  },
  sosText: {
    fontFamily: Typography.fontFamily.extraBold,
    fontSize: Typography.sizes.xl,
    color: Colors.white,
    letterSpacing: 3,
  },
  sosSubtext: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.sizes.xs,
    color: Colors.white + 'CC',
    letterSpacing: 1,
    marginTop: 2,
  },
});
