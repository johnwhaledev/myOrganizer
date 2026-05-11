import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, FlatList,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Fonts';
import { formatFileSize } from '../../utils/categorizer';
import { createScan, createOperation } from '../../utils/api';
import { pickFolderAndroid, pickFiles, supportsFolderPick, type PickedFile } from '../../utils/folderPicker';
import { hashFile, MAX_FULL_HASH_BYTES } from '../../utils/hash';

interface FileInfo {
  uri: string;
  name: string;
  size: number;
  hash: string;
  lastModified?: number;
}

interface DupGroup {
  hash: string;
  files: FileInfo[];
}

type Status = 'idle' | 'scanning' | 'review' | 'deleting' | 'done';

export default function SpaceSaverScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [totalScanned, setTotalScanned] = useState(0);
  const [skippedLarge, setSkippedLarge] = useState(0);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  const [freedSpace, setFreedSpace] = useState(0);
  const [source, setSource] = useState<'folder' | 'files' | null>(null);

  const scan = useCallback(async (picked: PickedFile[]) => {
    // Pass 1: group by size. Only sizes with 2+ files are worth hashing.
    setProgressLabel('Grouping by size...');
    const bySize = new Map<number, PickedFile[]>();
    for (const f of picked) {
      if (!bySize.has(f.size)) bySize.set(f.size, []);
      bySize.get(f.size)!.push(f);
    }

    const candidates: PickedFile[] = [];
    for (const [size, list] of bySize) {
      if (size > 0 && list.length > 1) candidates.push(...list);
    }

    // Pass 2: MD5 hash candidates only. Non-candidates get a unique tag.
    setProgressLabel('Hashing candidates...');
    const fileInfos: FileInfo[] = [];
    let skippedLargeLocal = 0;
    const totalToHash = candidates.length || 1;
    let i = 0;
    for (const f of picked) {
      let hash: string;
      if (candidates.includes(f)) {
        if (f.size > MAX_FULL_HASH_BYTES) {
          skippedLargeLocal++;
          hash = `SKIP_LARGE_${f.size}_${f.uri.slice(-10)}_${f.name}`;
        } else {
          hash = await hashFile(f.uri, f.size);
        }
        i++;
        setProgress(Math.round((i / totalToHash) * 100));
      } else {
        hash = `UNIQUE_SIZE_${f.size}_${f.uri}`;
      }
      fileInfos.push({
        uri: f.uri, name: f.name, size: f.size, hash, lastModified: f.lastModified,
      });
    }

    // Build duplicate groups
    const map = new Map<string, FileInfo[]>();
    for (const f of fileInfos) {
      if (f.hash.startsWith('UNIQUE_SIZE_') || f.hash.startsWith('SKIP_LARGE_') || f.hash.startsWith('ERR_')) continue;
      if (!map.has(f.hash)) map.set(f.hash, []);
      map.get(f.hash)!.push(f);
    }

    const dupGroups: DupGroup[] = [];
    for (const [hash, files] of map) {
      if (files.length > 1) {
        files.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
        dupGroups.push({ hash, files });
      }
    }

    return { fileInfos, dupGroups, skippedLarge: skippedLargeLocal };
  }, []);

  const runPick = useCallback(async (mode: 'folder' | 'files') => {
    try {
      const res = mode === 'folder' ? await pickFolderAndroid() : await pickFiles();
      if (!res) return; // utente ha annullato
      if (res.files.length === 0) {
        Alert.alert('Nessun file trovato', 'La cartella selezionata è vuota o non contiene file leggibili.');
        setStatus('idle');
        return;
      }

      setSource(res.source);
      setStatus('scanning');
      setProgress(0);
      setProgressLabel('');

      const { fileInfos, dupGroups, skippedLarge: skl } = await scan(res.files);

      const preSelected = new Set<string>();
      for (const g of dupGroups) g.files.slice(1).forEach(f => preSelected.add(f.uri));

      setTotalScanned(fileInfos.length);
      setSkippedLarge(skl);
      setGroups(dupGroups);
      setSelected(preSelected);
      setExpandedGroup(dupGroups[0]?.hash ?? null);

      await createScan({
        total_files: fileInfos.length,
        total_size: fileInfos.reduce((s, f) => s + f.size, 0),
        duplicates_count: dupGroups.reduce((s, g) => s + g.files.length - 1, 0),
        module: 'space_saver',
      }).catch(() => {});

      setStatus('review');
    } catch (e) {
      console.warn('scan failed', e);
      Alert.alert('Error', 'Failed to pick or process files.');
      setStatus('idle');
    }
  }, [scan]);

  const startPicker = useCallback(() => {
    if (!supportsFolderPick) { runPick('files'); return; }
    Alert.alert(
      'Choose Source',
      'Scan every file inside a folder, or pick individual files.',
      [
        { text: 'Pick Folder', onPress: () => runPick('folder') },
        { text: 'Pick Files',  onPress: () => runPick('files') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [runPick]);

  const toggleFile = useCallback((uri: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(uri) ? next.delete(uri) : next.add(uri);
      return next;
    });
  }, []);

  const selectedSize = [...selected].reduce((sum, uri) => {
    const f = groups.flatMap(g => g.files).find(f => f.uri === uri);
    return sum + (f?.size ?? 0);
  }, 0);

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    Alert.alert(
      'Confirm Delete',
      `Delete ${selected.size} file(s)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setStatus('deleting');
            let freed = 0, deleted = 0;
            for (const uri of selected) {
              const f = groups.flatMap(g => g.files).find(f => f.uri === uri);
              if (!f) continue;
              try {
                if (uri.startsWith('content://')) {
                  await FileSystem.StorageAccessFramework.deleteAsync(uri);
                } else {
                  await FileSystem.deleteAsync(uri, { idempotent: true });
                }
                freed += f.size; deleted++;
                await createOperation({ operation_type: 'delete', original_name: f.name, file_size: f.size }).catch(() => {});
              } catch { /* file may already be gone */ }
            }
            setDeletedCount(deleted);
            setFreedSpace(freed);
            setStatus('done');
          }
        },
      ]
    );
  }, [selected, groups]);

  const reset = useCallback(() => {
    setStatus('idle');
    setGroups([]);
    setSelected(new Set());
    setProgress(0);
    setProgressLabel('');
    setTotalScanned(0);
    setSkippedLarge(0);
    setDeletedCount(0);
    setFreedSpace(0);
    setExpandedGroup(null);
    setSource(null);
  }, []);

  if (status === 'idle') return (
    <View style={styles.centered} testID="saver-idle">
      <View style={styles.bigIcon}>
        <Ionicons name="copy-outline" size={52} color={Colors.warning} />
      </View>
      <Text style={styles.bigTitle}>Space Saver</Text>
      <Text style={styles.desc}>
        {supportsFolderPick ? 'Scan a whole folder or pick files.' : 'Select multiple files to scan.'}{'\n'}
        True content MD5 matching — detects duplicates regardless of name.{'\n'}
        Files &gt; {Math.round(MAX_FULL_HASH_BYTES / 1024 / 1024)} MB are skipped to protect memory.
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={startPicker} testID="pick-files-btn" activeOpacity={0.8}>
        <Ionicons name={supportsFolderPick ? 'folder-open-outline' : 'document-attach-outline'} size={20} color={Colors.background} />
        <Text style={styles.btnText}>{supportsFolderPick ? 'Choose Source' : 'Pick Files to Scan'}</Text>
      </TouchableOpacity>
      {!supportsFolderPick && (
        <Text style={styles.ios_note}>
          iOS sandbox does not allow folder access. Pick the files you want to scan.
        </Text>
      )}
    </View>
  );

  if (status === 'scanning') return (
    <View style={styles.centered} testID="saver-scanning">
      <ActivityIndicator size="large" color={Colors.accent} />
      <Text style={styles.bigTitle}>Scanning...</Text>
      <Text style={styles.desc}>{progressLabel}</Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>
      <Text style={styles.desc}>{progress}% complete</Text>
    </View>
  );

  if (status === 'deleting') return (
    <View style={styles.centered} testID="saver-deleting">
      <ActivityIndicator size="large" color={Colors.danger} />
      <Text style={styles.bigTitle}>Deleting files...</Text>
    </View>
  );

  if (status === 'done') return (
    <View style={styles.centered} testID="saver-done">
      <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
      <Text style={styles.bigTitle}>Done!</Text>
      <View style={styles.resultCard}>
        <ResultRow icon="trash-outline"          label="Files Deleted"  value={String(deletedCount)}          color={Colors.danger} />
        <ResultRow icon="cloud-download-outline" label="Space Freed"    value={formatFileSize(freedSpace)}    color={Colors.warning} />
        <ResultRow icon="scan-outline"           label="Total Scanned"  value={String(totalScanned)}          color={Colors.accent} />
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={reset} testID="scan-again-btn" activeOpacity={0.8}>
        <Ionicons name="refresh-outline" size={20} color={Colors.background} />
        <Text style={styles.btnText}>Scan Again</Text>
      </TouchableOpacity>
    </View>
  );

  // Review
  return (
    <View style={styles.container} testID="saver-review">
      {source === 'folder' && (
        <View style={styles.sourceBanner}>
          <Ionicons name="folder-open-outline" size={14} color={Colors.accent} />
          <Text style={styles.sourceBannerTxt}>Folder scan (Android SAF)</Text>
        </View>
      )}
      <View style={styles.summaryBar}>
        <SummaryItem label="Scanned"    value={`${totalScanned} files`} />
        <SummaryItem label="Dup Groups" value={String(groups.length)} />
        <SummaryItem label="Can Save"   value={formatFileSize(selectedSize)} color={Colors.warning} />
      </View>

      {skippedLarge > 0 && (
        <View style={styles.warnBanner}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.warning} />
          <Text style={styles.warnBannerTxt}>
            {skippedLarge} file(s) too large (&gt;{Math.round(MAX_FULL_HASH_BYTES/1024/1024)} MB) — skipped from hash comparison.
          </Text>
        </View>
      )}

      {groups.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={56} color={Colors.success} />
          <Text style={styles.bigTitle}>No Duplicates!</Text>
          <Text style={styles.desc}>All {totalScanned} files are unique.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={reset} testID="back-btn">
            <Text style={styles.btnText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={groups}
            keyExtractor={g => g.hash}
            contentContainerStyle={{ padding: 14 }}
            renderItem={({ item: g, index }) => (
              <GroupCard
                group={g}
                num={index + 1}
                selected={selected}
                expanded={expandedGroup === g.hash}
                onToggleExpand={() => setExpandedGroup(p => p === g.hash ? null : g.hash)}
                onToggleFile={toggleFile}
              />
            )}
          />
          <View style={styles.bottomBar}>
            <TouchableOpacity style={[styles.ghostBtn, { flex: 1 }]} onPress={reset} testID="cancel-btn">
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerBtn, { flex: 2 }, selected.size === 0 && { opacity: 0.4 }]}
              onPress={deleteSelected}
              disabled={selected.size === 0}
              testID="delete-btn"
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={17} color={Colors.background} />
              <Text style={styles.btnText}>Delete {selected.size}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function GroupCard({ group, num, selected, expanded, onToggleExpand, onToggleFile }: {
  group: DupGroup; num: number; selected: Set<string>;
  expanded: boolean; onToggleExpand: () => void;
  onToggleFile: (uri: string) => void;
}) {
  const savedSize = group.files.slice(1).reduce((s, f) => s + f.size, 0);
  return (
    <View style={styles.groupCard} testID={`group-${num}`}>
      <TouchableOpacity style={styles.groupHeader} onPress={onToggleExpand} activeOpacity={0.8}>
        <View style={styles.groupBadge}>
          <Text style={styles.groupBadgeText}>{group.files.length}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupTitle}>Duplicate Group #{num}</Text>
          <Text style={styles.groupSub}>Can save {formatFileSize(savedSize)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>
      {expanded && group.files.map((file, idx) => {
        const isKeep = idx === 0;
        const isChecked = selected.has(file.uri);
        return (
          <TouchableOpacity
            key={file.uri}
            style={[styles.fileRow, isChecked && styles.fileRowSelected]}
            onPress={() => !isKeep && onToggleFile(file.uri)}
            activeOpacity={isKeep ? 1 : 0.7}
            testID={`file-${num}-${idx}`}
          >
            <View style={styles.checkWrap}>
              {isKeep ? (
                <View style={styles.keepTag}><Text style={styles.keepText}>KEEP</Text></View>
              ) : (
                <View style={[styles.checkbox, isChecked && styles.checkboxOn]}>
                  {isChecked && <Ionicons name="checkmark" size={12} color={Colors.background} />}
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
              <Text style={styles.fileMeta}>
                {formatFileSize(file.size)}{file.lastModified ? ` · ${new Date(file.lastModified).toLocaleDateString()}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.sumValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

function ResultRow({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={styles.resultRow}>
      <Ionicons name={icon as any} size={17} color={color} />
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={[styles.resultValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16,
  },
  bigIcon: {
    width: 96, height: 96, backgroundColor: `${Colors.warning}1a`,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  bigTitle: { fontSize: 24, fontFamily: Fonts.sans.medium, color: Colors.textPrimary, textAlign: 'center' },
  desc: { fontSize: 14, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  ios_note: { fontSize: 12, fontFamily: Fonts.sans.regular, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 4, justifyContent: 'center', marginTop: 8,
  },
  btnText: { color: Colors.background, fontFamily: Fonts.mono.bold, fontSize: 14 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.danger, paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 4, justifyContent: 'center',
  },
  ghostBtn: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: { fontFamily: Fonts.sans.medium, color: Colors.textPrimary, fontSize: 14 },
  progressBar: { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 3 },
  sourceBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${Colors.accent}14`, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: `${Colors.accent}30`,
  },
  sourceBannerTxt: { fontSize: 11, fontFamily: Fonts.mono.bold, color: Colors.accent, letterSpacing: 0.4 },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${Colors.warning}14`, paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: `${Colors.warning}30`,
  },
  warnBannerTxt: { flex: 1, fontSize: 11, fontFamily: Fonts.sans.regular, color: Colors.warning },
  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingVertical: 12,
  },
  sumValue: { fontSize: 15, fontFamily: Fonts.mono.bold, color: Colors.textPrimary, textAlign: 'center' },
  sumLabel: { fontSize: 10, fontFamily: Fonts.mono.regular, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  groupCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, marginBottom: 12, overflow: 'hidden',
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  groupBadge: {
    width: 34, height: 34, backgroundColor: `${Colors.warning}1a`,
    borderRadius: 2, alignItems: 'center', justifyContent: 'center',
  },
  groupBadgeText: { fontSize: 14, fontFamily: Fonts.mono.bold, color: Colors.warning },
  groupTitle: { fontSize: 14, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  groupSub: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted, marginTop: 1 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 14,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 12,
  },
  fileRowSelected: { backgroundColor: `${Colors.danger}0d` },
  checkWrap: { width: 46, alignItems: 'center' },
  checkbox: {
    width: 22, height: 22, borderRadius: 2, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  keepTag: { backgroundColor: `${Colors.accent}1a`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  keepText: { fontSize: 10, fontFamily: Fonts.mono.bold, color: Colors.accent },
  fileName: { fontSize: 13, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  fileMeta: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted, marginTop: 2 },
  bottomBar: {
    flexDirection: 'row', padding: 14, gap: 10,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  resultCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, width: '100%', gap: 14,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.sans.regular, color: Colors.textSecondary },
  resultValue: { fontSize: 16, fontFamily: Fonts.mono.bold },
});
