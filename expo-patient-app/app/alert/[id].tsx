/**
 * SEHAS Alert Detail Modal
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, StatusColors } from '../../constants/theme';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppStore } from '../../store/useAppStore';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const alerts = useAppStore((s) => s.alerts);
  const alert = alerts.find((a) => a.id === id);

  if (!alert) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Alert not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const openMaps = () => {
    if (alert.gps_lat && alert.gps_lng) {
      Linking.openURL(`https://maps.google.com/?q=${alert.gps_lat},${alert.gps_lng}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Handle */}
      <View style={styles.handle} />

      <View style={styles.header}>
        <Text style={styles.title}>Alert Details</Text>
        <StatusBadge status={alert.status} size="md" />
      </View>

      <DetailRow label="Type" value={alert.type.replace(/_/g, ' ').toUpperCase()} />
      <DetailRow label="Severity" value={alert.severity?.toUpperCase() || 'Unknown'} valueColor={alert.severity === 'critical' ? Colors.danger : alert.severity === 'medium' ? Colors.warning : Colors.success} />
      <DetailRow label="Timestamp" value={alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'Unknown'} />
      {alert.dispatched_at && <DetailRow label="Dispatched" value={new Date(alert.dispatched_at).toLocaleString()} />}
      {alert.acknowledged_at && <DetailRow label="Acknowledged" value={new Date(alert.acknowledged_at).toLocaleString()} />}
      {alert.acknowledged_by && <DetailRow label="Acknowledged By" value={alert.acknowledged_by} />}
      {alert.response_time != null && <DetailRow label="Response Time" value={`${alert.response_time} seconds`} />}

      {alert.gps_lat && alert.gps_lng && (
        <TouchableOpacity style={styles.mapsButton} onPress={openMaps}>
          <Text style={styles.mapsButtonText}>📍 Open in Google Maps</Text>
          <Text style={styles.mapsCoords}>{alert.gps_lat.toFixed(6)}, {alert.gps_lng.toFixed(6)}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeButtonText}>Close</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.xl, paddingTop: Spacing.md },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.xl, color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  detailLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textSecondary },
  detailValue: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.sm, color: Colors.textPrimary, maxWidth: '60%', textAlign: 'right' },
  mapsButton: { backgroundColor: Colors.accentMuted, borderRadius: BorderRadius.md, padding: Spacing.base, marginTop: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.accent + '44' },
  mapsButtonText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.base, color: Colors.accent },
  mapsCoords: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  closeButton: { marginTop: Spacing.xl, paddingVertical: Spacing.base, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center' },
  closeButtonText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.base, color: Colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.lg, color: Colors.textPrimary },
  backLink: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.base, color: Colors.primary },
});
