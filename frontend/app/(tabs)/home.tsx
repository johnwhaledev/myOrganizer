import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Fonts';
import { getStats, getOperations, Stats, Operation } from '../../utils/api';
import { formatFileSize, formatDate } from '../../utils/categorizer';

const MODULES = [
  {
    id: 'space-saver',
    title: 'Space Saver',
    subtitle: 'Find & remove exact duplicate files',
    icon: 'copy-outline',
    color: Colors.warning,
    route: '/(tabs)/space-saver',
  },
  {
    id: 'smart-organizer',
    title: 'Smart Organizer',
    subtitle: 'Categorize & rename documents',
    icon: 'albums-outline',
    color: Colors.accent,
    route: '/(tabs)/smart-organizer',
  },
];

function getOpIcon(type: string) {
  return type === 'delete' ? 'trash-outline' : type === 'rename' ? 'create-outline' : 'warning-outline';
}
function getOpColor(type: string) {
  return type === 'delete' ? Colors.danger : type === 'rename' ? Colors.accent : Colors.warning;
}

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [ops, setOps] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([getStats(), getOperations()]);
      setStats(s);
      setOps(o.slice(0, 6));
    } catch {
      // storage not ready yet
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={Colors.accent}
          colors={[Colors.accent]}
        />
      }
      testID="home-screen"
    >
      {/* Stats Grid */}
      {loading ? (
        <ActivityIndicator color={Colors.accent} size="large" style={{ marginVertical: 32 }} />
      ) : (
        <View style={styles.statsGrid} testID="stats-grid">
          <StatCard icon="scan-outline"          label="Total Scans"  value={String(stats?.total_scans ?? 0)}                    color={Colors.accent} />
          <StatCard icon="cloud-download-outline" label="Space Freed"  value={formatFileSize(stats?.total_space_freed ?? 0)}       color={Colors.warning} />
          <StatCard icon="create-outline"         label="Renamed"      value={String(stats?.rename_count ?? 0)}                    color={Colors.TEC} />
          <StatCard icon="trash-outline"          label="Deleted"      value={String(stats?.delete_count ?? 0)}                    color={Colors.danger} />
        </View>
      )}

      {/* Modules */}
      <Text style={styles.sectionTitle}>Modules</Text>
      {MODULES.map((mod) => (
        <TouchableOpacity
          key={mod.id}
          style={styles.moduleCard}
          onPress={() => router.push(mod.route as any)}
          testID={`module-${mod.id}`}
          activeOpacity={0.8}
        >
          <View style={[styles.moduleIcon, { backgroundColor: `${mod.color}1a` }]}>
            <Ionicons name={mod.icon as any} size={26} color={mod.color} />
          </View>
          <View style={styles.moduleInfo}>
            <Text style={styles.moduleTitle}>{mod.title}</Text>
            <Text style={styles.moduleSub}>{mod.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}

      {/* Recent Activity */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      {ops.length === 0 ? (
        <View style={styles.empty} testID="empty-activity">
          <Ionicons name="time-outline" size={40} color={Colors.border} />
          <Text style={styles.emptyText}>No recent activity</Text>
          <Text style={styles.emptyHint}>Run a scan to get started</Text>
        </View>
      ) : (
        ops.map((op) => (
          <View key={op.id} style={styles.activityRow} testID={`op-${op.id}`}>
            <View style={[styles.opIcon, { backgroundColor: `${getOpColor(op.operation_type)}1a` }]}>
              <Ionicons name={getOpIcon(op.operation_type) as any} size={15} color={getOpColor(op.operation_type)} />
            </View>
            <View style={styles.opInfo}>
              <Text style={styles.opName} numberOfLines={1}>{op.original_name}</Text>
              {op.new_name && <Text style={styles.opNew} numberOfLines={1}>→ {op.new_name}</Text>}
              <Text style={styles.opTime}>{formatDate(op.timestamp)}</Text>
            </View>
            {op.file_size > 0 && (
              <Text style={styles.opSize}>{formatFileSize(op.file_size)}</Text>
            )}
          </View>
        ))
      )}

      {/* Privacy badge */}
      <View style={styles.privacyBadge}>
        <Ionicons name="shield-checkmark-outline" size={14} color={Colors.accent} />
        <Text style={styles.privacyText}>100% offline · No data sent to servers</Text>
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard} testID={`stat-${label}`}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, minWidth: '46%',
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 14, gap: 6,
  },
  statValue: { fontSize: 22, fontFamily: Fonts.mono.bold, color: Colors.textPrimary },
  statLabel: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted },
  sectionTitle: {
    fontSize: 12, fontFamily: Fonts.mono.bold, color: Colors.textMuted,
    marginBottom: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  moduleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 10, gap: 14,
  },
  moduleIcon: { width: 50, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moduleInfo: { flex: 1 },
  moduleTitle: { fontSize: 16, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  moduleSub: { fontSize: 13, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyText: { fontSize: 15, fontFamily: Fonts.sans.regular, color: Colors.textSecondary },
  emptyHint: { fontSize: 13, fontFamily: Fonts.sans.regular, color: Colors.textMuted },
  activityRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 8, gap: 10,
  },
  opIcon: { width: 34, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  opInfo: { flex: 1 },
  opName: { fontSize: 13, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  opNew: { fontSize: 12, fontFamily: Fonts.mono.regular, color: Colors.accent, marginTop: 1 },
  opTime: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted, marginTop: 2 },
  opSize: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted },
  privacyBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 16, paddingVertical: 10,
    backgroundColor: `${Colors.accent}0f`, borderRadius: 4,
    borderWidth: 1, borderColor: `${Colors.accent}25`,
  },
  privacyText: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textSecondary },
});
