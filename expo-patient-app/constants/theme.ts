/**
 * SEHAS Design System — Premium Dark Medical Theme
 */

export const Colors = {
  // Core backgrounds
  background: '#0A0E1A',
  surface: '#141829',
  surfaceElevated: '#1C2137',
  surfaceBorder: '#252A40',

  // Brand
  primary: '#00D4AA',
  primaryMuted: '#00D4AA22',
  primaryDark: '#00A88A',
  accent: '#667EEA',
  accentMuted: '#667EEA22',

  // Semantic
  danger: '#FF4757',
  dangerMuted: '#FF475722',
  dangerDark: '#CC3945',
  warning: '#FFA502',
  warningMuted: '#FFA50222',
  success: '#2ED573',
  successMuted: '#2ED57322',
  info: '#54A0FF',
  infoMuted: '#54A0FF22',

  // Text
  textPrimary: '#EAEEFF',
  textSecondary: '#6B7394',
  textMuted: '#3D4565',
  textInverse: '#0A0E1A',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.6)',
  glassBg: 'rgba(20, 24, 41, 0.85)',
  glassStroke: 'rgba(255, 255, 255, 0.06)',
};

export const Gradients = {
  primary: ['#00D4AA', '#00A88A'] as const,
  danger: ['#FF6B81', '#FF4757'] as const,
  accent: ['#667EEA', '#764BA2'] as const,
  dark: ['#141829', '#0A0E1A'] as const,
  card: ['rgba(28, 33, 55, 0.95)', 'rgba(20, 24, 41, 0.95)'] as const,
  sosBg: ['#FF4757', '#CC3945'] as const,
};

export const Typography = {
  // Font family loaded via expo-font (Inter)
  fontFamily: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extraBold: 'Inter_800ExtraBold',
  },
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
    '4xl': 48,
    hero: 64,
  },
  lineHeights: {
    tight: 1.1,
    normal: 1.4,
    relaxed: 1.6,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  }),
};

export const RiskColors = {
  NORMAL: Colors.success,
  MEDIUM: Colors.warning,
  CRITICAL: Colors.danger,
};

export const StatusColors: Record<string, string> = {
  pending: Colors.warning,
  dispatched: Colors.info,
  acknowledged: Colors.success,
  cancelled: Colors.textMuted,
  escalated: Colors.danger,
};
