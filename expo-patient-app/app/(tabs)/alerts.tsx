/**
 * SEHAS Alerts Screen — Alert history & management
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, StatusColors } from '../../constants/theme';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppStore } from '../../store/useAppStore';
import { api, AlertRecord } from '../../services/api';

export default function AlertsScreen() {
  const { patient, alerts, setAlerts } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    if (!patient?.id) return;
    try {
      const response = await api.getAlertHistory(patient.id, 50);
      const cleanAlerts = response.alerts.map((a: any) => ({
        ...a, id: String(a.id), patient_id: String(a.patient_id || ''),
        timestamp: String(a.timestamp || ''),
      }));
      setAlerts(cleanAlerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, [patient?.id]);

  useEffect(() => {
    setLoading(true);
    fetchAlerts().finally(() => setLoading(false));
  }, [fetchAlerts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAlerts();
    setRefreshing(false);
  }, [fetchAlerts]);

  const handleCancel = async (alertId: string) => {
    Alert.alert('Cancel Alert', 'Are you sure this was a false alarm?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelAlert(alertId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            useAppStore.getState().updateAlertStatus(alertId, 'cancelled');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Could not cancel alert');
          }
        },
      },
    ]);
  };

  const getAlertIcon = (type: string): keyof typeof Feather.glyphMap => {
    const icons: Record<string, keyof typeof Feather.glyphMap> = {
      fall: 'activity', cardiac: 'heart', voice_sos: 'mic', voice_distress: 'mic', batch_detection: 'bar-chart-2',
    };
    return icons[type] || 'alert-triangle';
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'critical') return Colors.danger;
    if (severity === 'medium') return Colors.warning;
    return Colors.success;
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return 'Unknown';
    try {
      const diff = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(diff / 3600000);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch { return ts; }
  };

  const renderItem = ({ item }: { item: AlertRecord }) => (
    <View style={[styles.alertCard, { borderLeftColor: getSeverityColor(item.severity) }]}>
      <View style={styles.alertHeader}>
        <View style={styles.alertTitleRow}>
          <Feather name={getAlertIcon(item.type)} size={24} color={getSeverityColor(item.severity)} style={{ marginRight: Spacing.xs }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertType}>{item.type.replace(/_/g, ' ').toUpperCase()}</Text>
            <Text style={styles.alertTime}>{formatTimestamp(item.timestamp)}</Text>
          </View>
        </View>
        <StatusBadge status={item.status} />
      </View>
      <View style={styles.alertDetails}>
        <View style={styles.row}>
          <Text style={styles.detailLabel}>Severity</Text>
          <Text style={[styles.detailValue, { color: getSeverityColor(item.severity) }]}>
            {item.severity?.toUpperCase()}
          </Text>
        </View>
        {item.gps_lat != null && item.gps_lng != null && (
          <View style={styles.row}>
            <Text style={styles.detailLabel}>Location</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="map-pin" size={14} color={Colors.textPrimary} style={{ marginRight: 4 }} />
              <Text style={styles.detailValue}>{item.gps_lat.toFixed(4)}, {item.gps_lng.toFixed(4)}</Text>
            </View>
          </View>
        )}
        {item.acknowledged_by && (
          <View style={styles.row}>
            <Text style={styles.detailLabel}>Acknowledged by</Text>
            <Text style={styles.detailValue}>{item.acknowledged_by}</Text>
          </View>
        )}
        {item.response_time != null && (
          <View style={styles.row}>
            <Text style={styles.detailLabel}>Response Time</Text>
            <Text style={styles.detailValue}>{item.response_time}s</Text>
          </View>
        )}
      </View>
      {item.status === 'pending' && (
        <TouchableOpacity style={styles.cancelButton} onPress={() => handleCancel(item.id)}>
          <Text style={styles.cancelText}>✕  Cancel Alert</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alert History</Text>
        <Text style={styles.headerSubtitle}>
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''} recorded
        </Text>
      </View>
      <View style={styles.statsBar}>
        {['pending', 'dispatched', 'acknowledged', 'escalated', 'cancelled'].map((status) => {
          const count = alerts.filter((a) => a.status === status).length;
          if (count === 0) return null;
          return (
            <View key={status} style={styles.statChip}>
              <View style={[styles.statDot, { backgroundColor: StatusColors[status] }]} />
              <Text style={styles.statCount}>{count}</Text>
              <Text style={styles.statLabel}>{status}</Text>
            </View>
          );
        })}
      </View>
      {loading && alerts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="shield" size={48} color={Colors.textMuted} style={{ marginBottom: Spacing.sm }} />
              <Text style={styles.emptyTitle}>No Alerts Yet</Text>
              <Text style={styles.emptySubtitle}>Start monitoring to detect emergencies</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 60 },
  header: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.base },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.xl, color: Colors.textPrimary },
  headerSubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  statsBar: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.base },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.glassStroke },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statCount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.xs, color: Colors.textPrimary },
  statLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, color: Colors.textMuted, textTransform: 'capitalize' },
  listContent: { paddingHorizontal: Spacing.base, paddingBottom: 120 },
  alertCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.glassStroke, borderLeftWidth: 4 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  alertType: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.sm, color: Colors.textPrimary, letterSpacing: 0.5 },
  alertTime: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.xs, color: Colors.textMuted, marginTop: 2 },
  alertDetails: { backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textMuted },
  detailValue: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.sizes.sm, color: Colors.textPrimary },
  cancelButton: { marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.danger + '44', borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.dangerMuted },
  cancelText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.sizes.sm, color: Colors.danger },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.md },
  emptyTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.sizes.lg, color: Colors.textPrimary },
  emptySubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.sizes.sm, color: Colors.textSecondary, textAlign: 'center', maxWidth: 250 },
});
