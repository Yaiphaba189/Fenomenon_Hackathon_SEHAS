/**
 * SEHAS Tabs Layout — Bottom tab navigation
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';

function TabIcon({ icon, label, focused }: { icon: keyof typeof Feather.glyphMap; label: string; focused: boolean }) {
  return (
    <View style={[tabStyles.container, focused && tabStyles.focused]}>
      <Feather 
        name={icon} 
        size={22} 
        color={focused ? Colors.primary : Colors.textMuted} 
        style={focused ? tabStyles.iconFocused : tabStyles.icon} 
      />
      <Text style={[tabStyles.label, focused && tabStyles.labelFocused]}>{label}</Text>
      {focused && <View style={tabStyles.indicator} />}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xs,
    width: 70,
  },
  focused: {},
  icon: {
    opacity: 0.6,
  },
  iconFocused: {
    opacity: 1,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  labelFocused: {
    color: Colors.primary,
  },
  indicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 3,
  },
});

export default function TabsLayout() {
  const isMonitoring = useAppStore((s) => s.isMonitoring);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.glassStroke,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 4,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="activity" label="Dashboard" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="heart-rate"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="heart" label="Heart Rate" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="bell" label="Alerts" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="settings" label="Settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
