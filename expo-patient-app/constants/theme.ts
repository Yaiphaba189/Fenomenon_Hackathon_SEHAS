/**
 * SEHAS Design System — Premium Dark Medical Theme
 */

export const Colors = {
  // Core backgrounds
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  surfaceBorder: '#E2E8F0',

  // Brand
  primary: '#00C896', // Modern crisp green
  primaryMuted: '#00C89622',
  primaryDark: '#00A078',
  accent: '#10B981', // Emerald green
  accentMuted: '#10B98122',

  // Semantic
  danger: '#EF4444',
  dangerMuted: '#EF444422',
  dangerDark: '#B91C1C',
  warning: '#F59E0B',
  warningMuted: '#F59E0B22',
  success: '#10B981',
  successMuted: '#10B98122',
  info: '#3B82F6',
  infoMuted: '#3B82F622',

  // Text
  textPrimary: '#0F172A', // Dark slate for contrast
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.4)',
  glassBg: 'rgba(255, 255, 255, 0.90)',
  glassStroke: 'rgba(0, 0, 0, 0.08)',
};

export const Gradients = {
  primary: ['#00C896', '#00A078'] as const,
  danger: ['#F87171', '#EF4444'] as const,
  accent: ['#34D399', '#10B981'] as const,
  dark: ['#F8FAFC', '#FFFFFF'] as const,
  card: ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.95)'] as const,
  sosBg: ['#EF4444', '#DC2626'] as const,
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
