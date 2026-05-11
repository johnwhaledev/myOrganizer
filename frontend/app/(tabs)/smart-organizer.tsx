import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, FlatList, Switch,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Fonts';
import { categorizeFile, formatFileSize } from '../../utils/categorizer';
import { CATEGORIES, type Category, getCategoryColor as getBuiltInCategoryColor } from '../../utils/knowledgeBase';
import { loadEffectiveCategories } from '../../utils/customKeywords';
import { createScan, createOperation } from '../../utils/api';
import { pickFolderAndroid, pickFiles, supportsFolderPick, type PickedFile } from '../../utils/folderPicker';
import {
  getSavedOutputFolder, pickOutputFolder, ensureSubfolder, writeFile, guessMimeType,
  type OutputFolderInfo,
} from '../../utils/outputFolder';
import { extractPdfText } from '../../utils/pdfExtract';

interface AnalyzedFile {
  uri: string;
  name: string;
  size: number;
  categoryId: string | null;
  categoryName: string | null;
  suggestedName: string;
  confidence: number;
  isPdf: boolean;
  isTextless: boolean;
  approved: boolean;
}

type Status = 'idle' | 'analyzing' | 'review' | 'applying' | 'done';

const TEXT_EXTS = new Set(['txt', 'md', 'csv', 'json', 'xml', 'html', 'log', 'js', 'ts', 'py']);

async function readText(uri: string, name: string, sizeBytes: number): Promise<string> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  // PDF: estrazione testo via parser pure-JS.
  // PDF con solo immagini restituiranno < 50 char → flaggati come [TO_REVIEW].
  if (ext === 'pdf') return extractPdfText(uri, sizeBytes);

  if (!TEXT_EXTS.has(ext)) return '';
  try {
    if (uri.startsWith('content://')) {
      const content = await FileSystem.StorageAccessFramework.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return content.slice(0, 2000);
    }
    const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    return content.slice(0, 2000);
  } catch { return ''; }
}

function getCategoryColor(id: string | null, cats: Category[]): string {
  if (!id) return Colors.UNCATEGORIZED;
  if (id === 'FLAG') return Colors.FLAG;
  const found = cats.find(c => c.id === id);
  return found?.color ?? getBuiltInCategoryColor(id);
}

export default function SmartOrganizerScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ applied: number; flagged: number; location: string } | null>(null);
  const [effectiveCats, setEffectiveCats] = useState<Category[]>(CATEGORIES);
  const [source, setSource] = useState<'folder' | 'files' | null>(null);
  const [renameEnabled, setRenameEnabled] = useState(true);
  const [output, setOutput] = useState<OutputFolderInfo | null>(null);

  const refresh = useCallback(async () => {
    const [cats, out] = await Promise.all([
      loadEffectiveCategories(CATEGORIES),
      getSavedOutputFolder(),
    ]);
    setEffectiveCats(cats);
    setOutput(out);
    return cats;
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const changeOutputFolder = useCallback(async () => {
    const out = await pickOutputFolder();
    if (out) setOutput(out);
  }, []);

  const analyze = useCallback(async (picked: PickedFile[], cats: Category[]) => {
    const analyzed: AnalyzedFile[] = [];
    for (let i = 0; i < picked.length; i++) {
      const a = picked[i];
      setProgress(Math.round(((i + 1) / picked.length) * 100));
      const text = await readText(a.uri, a.name, a.size);
      const res = categorizeFile(a.name, text, cats);
      analyzed.push({
        uri: a.uri, name: a.name, size: a.size,
        categoryId: res.categoryId, categoryName: res.categoryName,
        suggestedName: res.suggestedName, confidence: res.confidence,
        isPdf: res.isPdf, isTextless: res.isTextless,
        approved: !res.isTextless,
      });
    }
    return analyzed;
  }, []);

  const runPick = useCallback(async (mode: 'folder' | 'files') => {
    try {
      const cats = await refresh();
      const res = mode === 'folder' ? await pickFolderAndroid() : await pickFiles();
      if (!res) return; // utente ha annullato
      if (res.files.length === 0) {
        Alert.alert('Nessun file trovato', 'La cartella selezionata è vuota o non contiene file leggibili.');
        return;
      }

      setSource(res.source);
      setStatus('analyzing');
      setProgress(0);

      const analyzed = await analyze(res.files, cats);
      setFiles(analyzed);

      await createScan({
        total_files: analyzed.length,
        files_to_organize: analyzed.filter(f => f.categoryId && f.categoryId !== 'FLAG').length,
        module: 'smart_organizer',
      }).catch(() => {});
      setStatus('review');
    } catch (e) {
      console.warn('pickAndAnalyze failed', e);
      Alert.alert('Error', 'Failed to analyze files. Please try again.');
      setStatus('idle');
    }
  }, [analyze, refresh]);

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

  const toggle = useCallback((uri: string) => {
    setFiles(prev => prev.map(f => f.uri === uri ? { ...f, approved: !f.approved } : f));
  }, []);
  const approveAll = useCallback(() => setFiles(prev => prev.map(f => ({ ...f, approved: !f.isTextless }))), []);
  const rejectAll  = useCallback(() => setFiles(prev => prev.map(f => ({ ...f, approved: false }))), []);

  const applyRenames = useCallback(async () => {
    const toApply = files.filter(f => f.approved && !f.isTextless);
    const toFlag  = files.filter(f => f.isTextless);
    if (!toApply.length && !toFlag.length) return;

    let out = output;
    if (!out) {
      const picked = await pickOutputFolder();
      if (!picked) {
        Alert.alert('Output folder required', 'Please pick a destination folder accessible by your file manager.');
        return;
      }
      out = picked;
      setOutput(picked);
    }

    setStatus('applying');
    try {
      let applied = 0, flagged = 0;

      for (const f of toApply) {
        try {
          const cat = f.categoryId ?? 'UNCAT';
          const sub = renameEnabled ? 'organized' : `organized/${cat}`;
          const loc = await ensureSubfolder(out, sub);
          const outName = renameEnabled ? f.suggestedName : f.name;
          await writeFile(loc, outName, f.uri, guessMimeType(outName));
          applied++;
          await createOperation({
            operation_type: 'rename',
            original_name: f.name,
            new_name: `${sub}/${outName}`,
            file_size: f.size,
            category: f.categoryId ?? undefined,
          }).catch(() => {});
        } catch (e) { console.warn('apply failed', f.name, e); }
      }

      for (const f of toFlag) {
        try {
          const loc = await ensureSubfolder(out, '[TO_REVIEW]');
          await writeFile(loc, f.name, f.uri, guessMimeType(f.name));
          flagged++;
          await createOperation({
            operation_type: 'flag',
            original_name: f.name,
            new_name: `[TO_REVIEW]/${f.name}`,
            file_size: f.size,
          }).catch(() => {});
        } catch (e) { console.warn('flag failed', f.name, e); }
      }

      setResult({ applied, flagged, location: out.displayPath });
      setStatus('done');
    } catch (e) {
      console.warn('applyRenames failed', e);
      Alert.alert('Error', 'Failed to save organized files.');
      setStatus('review');
    }
  }, [files, output, renameEnabled]);

  const reset = useCallback(() => {
    setStatus('idle'); setFiles([]); setProgress(0); setResult(null); setSource(null);
  }, []);

  if (status === 'idle') return (
    <View style={styles.centered} testID="org-idle">
      <View style={styles.bigIcon}>
        <Ionicons name="albums-outline" size={52} color={Colors.accent} />
      </View>
      <Text style={styles.bigTitle}>Smart Organizer</Text>
      <Text style={styles.desc}>Analyze files offline using regex + keyword matching.</Text>

      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>Rename files</Text>
            <Text style={styles.optionHint}>
              {renameEnabled
                ? 'Files renamed to [CAT]_YYYYMMDD_name.ext'
                : 'Keep original names, sort into /CATEGORY subfolders'}
            </Text>
          </View>
          <Switch
            value={renameEnabled}
            onValueChange={setRenameEnabled}
            trackColor={{ false: Colors.border, true: `${Colors.accent}80` }}
            thumbColor={renameEnabled ? Colors.accent : Colors.textMuted}
            testID="rename-toggle"
          />
        </View>

        <View style={[styles.optionRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>Output folder</Text>
            <Text style={styles.optionHint} numberOfLines={2}>
              {output ? output.displayPath : "Not set — you'll be asked when saving"}
            </Text>
          </View>
          <TouchableOpacity style={styles.outlineBtn} onPress={changeOutputFolder} testID="change-output-btn">
            <Ionicons name="folder-open-outline" size={14} color={Colors.accent} />
            <Text style={styles.outlineBtnTxt}>{output ? 'Change' : 'Pick'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={startPicker} testID="pick-btn" activeOpacity={0.8}>
        <Ionicons name={supportsFolderPick ? 'folder-open-outline' : 'document-attach-outline'} size={20} color={Colors.background} />
        <Text style={styles.btnText}>{supportsFolderPick ? 'Choose Source' : 'Pick Files to Organize'}</Text>
      </TouchableOpacity>
      {!supportsFolderPick && (
        <Text style={styles.ios_note}>
          iOS sandbox does not allow folder access. Pick the files you want to organize.
        </Text>
      )}
    </View>
  );

  if (status === 'analyzing') return (
    <View style={styles.centered} testID="org-analyzing">
      <ActivityIndicator size="large" color={Colors.accent} />
      <Text style={styles.bigTitle}>Analyzing...</Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>
      <Text style={styles.desc}>{progress}% — categorizing</Text>
    </View>
  );

  if (status === 'applying') return (
    <View style={styles.centered} testID="org-applying">
      <ActivityIndicator size="large" color={Colors.accent} />
      <Text style={styles.bigTitle}>Saving files...</Text>
      <Text style={styles.desc}>Copying to the chosen output folder</Text>
    </View>
  );

  if (status === 'done' && result) return (
    <View style={styles.centered} testID="org-done">
      <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
      <Text style={styles.bigTitle}>Done!</Text>
      <View style={styles.resultCard}>
        <ResultRow
          icon={renameEnabled ? 'create-outline' : 'albums-outline'}
          label={renameEnabled ? 'Files Renamed' : 'Files Organized'}
          value={String(result.applied)}
          color={Colors.accent}
        />
        <ResultRow icon="warning-outline" label="Flagged for Review" value={String(result.flagged)} color={Colors.warning} />
      </View>
      <View style={styles.pathBox}>
        <Ionicons name="folder-open-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.pathText} numberOfLines={2}>Saved to {result.location}</Text>
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={reset} testID="again-btn" activeOpacity={0.8}>
        <Ionicons name="refresh-outline" size={20} color={Colors.background} />
        <Text style={styles.btnText}>Organize More</Text>
      </TouchableOpacity>
    </View>
  );

  // Review
  const approvedCount    = files.filter(f => f.approved).length;
  const categorizedCount = files.filter(f => f.categoryId && f.categoryId !== 'FLAG').length;
  const flaggedCount     = files.filter(f => f.isTextless).length;

  return (
    <View style={styles.container} testID="org-review">
      {source === 'folder' && (
        <View style={styles.sourceBanner}>
          <Ionicons name="folder-open-outline" size={14} color={Colors.accent} />
          <Text style={styles.sourceBannerTxt}>
            Folder scan — {renameEnabled ? 'rename ON' : 'rename OFF (sort only)'}
          </Text>
        </View>
      )}
      <View style={styles.summaryBar}>
        <SumItem label="Total"       value={String(files.length)} />
        <SumItem label="Categorized" value={String(categorizedCount)} color={Colors.accent} />
        <SumItem label="Flagged"     value={String(flaggedCount)}     color={Colors.warning} />
        <SumItem label="Approved"    value={String(approvedCount)}    color={Colors.success} />
      </View>

      <FlatList
        data={files}
        keyExtractor={f => f.uri}
        contentContainerStyle={{ padding: 14 }}
        ListHeaderComponent={
          <View style={styles.batchRow}>
            <TouchableOpacity style={[styles.batchBtn, { backgroundColor: `${Colors.accent}1a` }]} onPress={approveAll} testID="approve-all-btn">
              <Ionicons name="checkmark-done" size={15} color={Colors.accent} />
              <Text style={[styles.batchBtnTxt, { color: Colors.accent }]}>Approve All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.batchBtn, { backgroundColor: Colors.border }]} onPress={rejectAll} testID="reject-all-btn">
              <Ionicons name="close" size={15} color={Colors.textMuted} />
              <Text style={[styles.batchBtnTxt, { color: Colors.textMuted }]}>Reject All</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <FileCard
            file={item}
            onToggle={() => toggle(item.uri)}
            catColor={getCategoryColor(item.isTextless ? 'FLAG' : item.categoryId, effectiveCats)}
            renameEnabled={renameEnabled}
          />
        )}
      />

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.ghostBtn, { flex: 1 }]} onPress={reset} testID="cancel-btn">
          <Text style={styles.ghostTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 2, marginTop: 0 }, approvedCount === 0 && { opacity: 0.4 }]}
          onPress={applyRenames}
          disabled={approvedCount === 0}
          testID="apply-btn"
          activeOpacity={0.8}
        >
          <Ionicons name="save-outline" size={17} color={Colors.background} />
          <Text style={styles.btnText}>Apply ({approvedCount})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FileCard({ file, onToggle, catColor, renameEnabled }: {
  file: AnalyzedFile; onToggle: () => void; catColor: string; renameEnabled: boolean;
}) {
  const catLabel = file.isTextless ? '⚠ FLAG' : (file.categoryId ?? 'UNCAT');
  const destDisplay = file.isTextless
    ? `[TO_REVIEW]/${file.name}`
    : renameEnabled
      ? file.suggestedName
      : `${file.categoryId ?? 'UNCAT'}/${file.name}`;

  return (
    <View style={styles.fileCard} testID={`file-${file.name}`}>
      <View style={styles.cardTop}>
        <View style={[styles.catBadge, { backgroundColor: `${catColor}1a`, borderColor: `${catColor}40` }]}>
          <Text style={[styles.catTxt, { color: catColor }]}>{catLabel}</Text>
        </View>
        {!file.isTextless && (
          <TouchableOpacity
            style={[styles.approveBtn, file.approved && styles.approveBtnOn]}
            onPress={onToggle}
            testID={`approve-${file.name}`}
          >
            <Ionicons
              name={file.approved ? 'checkmark' : 'close'}
              size={14}
              color={file.approved ? Colors.background : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.origName} numberOfLines={1}>{file.name}</Text>
      <Text style={[styles.newName, file.isTextless && { color: Colors.warning }]} numberOfLines={1}>
        → {destDisplay}
      </Text>
      <Text style={styles.meta}>
        {formatFileSize(file.size)}
        {file.confidence > 0 && ` · ${Math.round(file.confidence * 100)}% match`}
      </Text>
    </View>
  );
}

function SumItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.sumVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.sumLbl}>{label}</Text>
    </View>
  );
}

function ResultRow({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={styles.resRow}>
      <Ionicons name={icon as any} size={17} color={color} />
      <Text style={styles.resLabel}>{label}</Text>
      <Text style={[styles.resValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 22, gap: 14,
  },
  bigIcon: {
    width: 88, height: 88, backgroundColor: `${Colors.accent}1a`,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  bigTitle: { fontSize: 22, fontFamily: Fonts.sans.medium, color: Colors.textPrimary, textAlign: 'center' },
  desc: { fontSize: 13, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  ios_note: { fontSize: 12, fontFamily: Fonts.sans.regular, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 12 },
  optionCard: {
    width: '100%', backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 6,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionLabel: { fontSize: 14, fontFamily: Fonts.sans.medium, color: Colors.textPrimary, marginBottom: 2 },
  optionHint: { fontSize: 11, fontFamily: Fonts.sans.regular, color: Colors.textMuted, lineHeight: 15 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: `${Colors.accent}60`, backgroundColor: `${Colors.accent}14`,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4,
  },
  outlineBtnTxt: { fontFamily: Fonts.mono.bold, color: Colors.accent, fontSize: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 4, justifyContent: 'center', marginTop: 4,
  },
  btnText: { color: Colors.background, fontFamily: Fonts.mono.bold, fontSize: 14 },
  ghostBtn: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostTxt: { fontFamily: Fonts.sans.medium, color: Colors.textPrimary, fontSize: 14 },
  progressBar: { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 3 },
  sourceBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${Colors.accent}14`, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: `${Colors.accent}30`,
  },
  sourceBannerTxt: { fontSize: 11, fontFamily: Fonts.mono.bold, color: Colors.accent, letterSpacing: 0.4 },
  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingVertical: 12,
  },
  sumVal: { fontSize: 15, fontFamily: Fonts.mono.bold, color: Colors.textPrimary, textAlign: 'center' },
  sumLbl: { fontSize: 10, fontFamily: Fonts.mono.regular, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  batchRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  batchBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 4,
  },
  batchBtnTxt: { fontSize: 12, fontFamily: Fonts.mono.bold },
  fileCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, borderWidth: 1 },
  catTxt: { fontSize: 11, fontFamily: Fonts.mono.bold },
  approveBtn: {
    width: 28, height: 28, borderRadius: 4,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  approveBtnOn: { backgroundColor: Colors.accent },
  origName: { fontSize: 13, fontFamily: Fonts.sans.medium, color: Colors.textPrimary, marginBottom: 2 },
  newName: { fontSize: 12, fontFamily: Fonts.mono.regular, color: Colors.accent, marginBottom: 4 },
  meta: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted },
  bottomBar: {
    flexDirection: 'row', padding: 14, gap: 10,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  resultCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, width: '100%', gap: 14,
  },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.sans.regular, color: Colors.textSecondary },
  resValue: { fontSize: 16, fontFamily: Fonts.mono.bold },
  pathBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderRadius: 4, padding: 10,
    borderWidth: 1, borderColor: Colors.border, maxWidth: '100%',
  },
  pathText: { fontSize: 12, fontFamily: Fonts.mono.regular, color: Colors.textMuted, flex: 1 },
});
