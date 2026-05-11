import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Fonts';
import { clearHistory } from '../../utils/api';
import {
  getSavedOutputFolder, pickOutputFolder, clearOutputFolder, type OutputFolderInfo,
} from '../../utils/outputFolder';
import { MAX_FULL_HASH_BYTES } from '../../utils/hash';

const APP_VERSION = '1.1.0';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
    </View>
  );
}

export default function SettingsScreen() {
  const [clearing, setClearing] = useState(false);
  const [output, setOutput] = useState<OutputFolderInfo | null>(null);

  const refresh = useCallback(async () => {
    setOutput(await getSavedOutputFolder());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleChangeOutput = async () => {
    const picked = await pickOutputFolder();
    if (picked) setOutput(picked);
  };

  const handleClearOutput = () => {
    Alert.alert(
      'Reset Output Folder',
      'You’ll be asked to pick a new folder the next time you save files.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive', onPress: async () => {
            await clearOutputFolder();
            setOutput(null);
          }
        },
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Delete all scan history and operation logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive', onPress: async () => {
            setClearing(true);
            try {
              await clearHistory();
              Alert.alert('Done', 'History cleared.');
            } catch {
              Alert.alert('Error', 'Could not clear history.');
            } finally {
              setClearing(false);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="settings-screen">

      <View style={styles.appCard} testID="app-card">
        <View style={styles.appIconWrap}>
          <Ionicons name="folder-open" size={30} color={Colors.accent} />
        </View>
        <View>
          <Text style={styles.appName}>
            <Text style={{ color: Colors.accent }}>my</Text>Organizer
          </Text>
          <Text style={styles.appVersion}>v{APP_VERSION} · Offline Document Organizer</Text>
        </View>
      </View>

      <Section title="Output Folder">
        <View style={[styles.row, styles.rowLast, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Destination</Text>
            <Text style={styles.outputPath} numberOfLines={3}>
              {output ? output.displayPath : 'Not set — will ask on first save'}
            </Text>
            <Text style={styles.outputHint}>
              {output
                ? 'Reachable from your file manager.'
                : 'Pick a public folder (e.g. Download) so files are visible in your file manager.'}
            </Text>
          </View>
        </View>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleChangeOutput} testID="change-output-btn" activeOpacity={0.8}>
            <Ionicons name="folder-open-outline" size={15} color={Colors.accent} />
            <Text style={[styles.actionBtnTxt, { color: Colors.accent }]}>{output ? 'Change Folder' : 'Pick Folder'}</Text>
          </TouchableOpacity>
          {output && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleClearOutput} testID="clear-output-btn" activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={15} color={Colors.danger} />
              <Text style={[styles.actionBtnTxt, { color: Colors.danger }]}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </Section>

      <Section title="Smart Organizer">
        <Row label="Rename Format" value="[ID]_[YYYYMMDD]_[NAME]" />
        <Row label="Rename Toggle" value="On organizer idle screen" />
        <Row label="Flagged Folder" value="[TO_REVIEW]/" last />
      </Section>

      <Section title="Space Saver">
        <Row label="Hash" value="MD5 on file content" />
        <Row label="Grouping" value="Size → content MD5" />
        <Row label="Size Cap" value={`Skip files > ${Math.round(MAX_FULL_HASH_BYTES/1024/1024)} MB`} last />
      </Section>

      <Section title="Data">
        <TouchableOpacity
          style={[styles.fileBtn, styles.rowLast]}
          onPress={handleClearHistory}
          testID="clear-history-btn"
          activeOpacity={0.7}
        >
          {clearing
            ? <ActivityIndicator size="small" color={Colors.danger} />
            : <Ionicons name="trash-outline" size={17} color={Colors.danger} />
          }
          <Text style={[styles.rowLabel, { color: Colors.danger, flex: 1 }]}>Clear Scan History</Text>
        </TouchableOpacity>
      </Section>

      <View style={styles.privacyCard}>
        <Ionicons name="shield-checkmark" size={24} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.privacyTitle}>100% Offline & Private</Text>
          <Text style={styles.privacyText}>
            All file processing happens locally on your device.
            No data is sent to external servers. No API costs. No tracking.
          </Text>
        </View>
      </View>

      <Section title="About">
        <Row label="Version" value={APP_VERSION} />
        <Row label="Engine" value="Regex + Keyword Matching" last />
      </Section>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  appCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 20,
  },
  appIconWrap: {
    width: 54, height: 54, backgroundColor: `${Colors.accent}1a`,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  appName: { fontSize: 20, fontFamily: Fonts.mono.bold, color: Colors.textPrimary },
  appVersion: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted, marginTop: 2 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11, fontFamily: Fonts.mono.bold, color: Colors.textMuted,
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  sectionCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.sans.regular, color: Colors.textPrimary },
  rowValue: { fontSize: 12, fontFamily: Fonts.mono.regular, color: Colors.textMuted, maxWidth: 180 },
  outputPath: { fontSize: 12, fontFamily: Fonts.mono.regular, color: Colors.accent, marginTop: 4 },
  outputHint: { fontSize: 11, fontFamily: Fonts.sans.regular, color: Colors.textMuted, marginTop: 6, lineHeight: 15 },
  btnRow: {
    flexDirection: 'row', gap: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  actionBtnTxt: { fontSize: 12, fontFamily: Fonts.mono.bold },
  fileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  privacyCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: `${Colors.accent}0f`, borderRadius: 10, borderWidth: 1,
    borderColor: `${Colors.accent}25`, padding: 14, marginBottom: 20,
  },
  privacyTitle: { fontSize: 14, fontFamily: Fonts.sans.medium, color: Colors.textPrimary, marginBottom: 4 },
  privacyText: { fontSize: 13, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, lineHeight: 20 },
});
