import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Fonts';
import { CATEGORIES, type Category } from '../../utils/knowledgeBase';
import {
  loadCustomKeywords, addCustomKeyword, removeCustomKeyword,
  loadCustomCategories, addCustomCategory, removeCustomCategory,
  type CustomKeywordsMap, type CustomCategory,
} from '../../utils/customKeywords';

const COLOR_PALETTE = [
  '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6', '#2ecc71',
  '#ef4444', '#06b6d4', '#f97316', '#a855f7', '#84cc16',
];

const ICON_PALETTE = [
  'briefcase-outline', 'medkit-outline', 'car-outline', 'airplane-outline',
  'book-outline', 'cash-outline', 'gift-outline', 'paw-outline',
  'restaurant-outline', 'bulb-outline', 'camera-outline', 'game-controller-outline',
];

export default function BrainScreen() {
  const [expanded, setExpanded] = useState<string | null>('TEC');
  const [customKw, setCustomKw] = useState<CustomKeywordsMap>({});
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [inputByCat, setInputByCat] = useState<Record<string, string>>({});
  const [createModal, setCreateModal] = useState(false);

  const refresh = useCallback(async () => {
    const [kw, cats] = await Promise.all([loadCustomKeywords(), loadCustomCategories()]);
    setCustomKw(kw);
    setCustomCats(cats);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAddKeyword = useCallback(async (categoryId: string) => {
    const raw = (inputByCat[categoryId] ?? '').trim();
    if (!raw) return;
    const updated = await addCustomKeyword(categoryId, raw);
    setCustomKw(updated);
    setInputByCat(prev => ({ ...prev, [categoryId]: '' }));
  }, [inputByCat]);

  const handleRemoveKeyword = useCallback(async (categoryId: string, keyword: string) => {
    const updated = await removeCustomKeyword(categoryId, keyword);
    setCustomKw(updated);
  }, []);

  const handleDeleteCustomCat = useCallback((cat: CustomCategory) => {
    Alert.alert(
      'Delete Category',
      `Delete "${cat.name}" (${cat.id})? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            const next = await removeCustomCategory(cat.id);
            setCustomCats(next);
            const kw = await loadCustomKeywords();
            setCustomKw(kw);
          }
        },
      ]
    );
  }, []);

  const handleSaveNewCat = useCallback(async (cat: CustomCategory) => {
    const next = await addCustomCategory(cat);
    setCustomCats(next);
    setCreateModal(false);
  }, []);

  const reservedIds = [
    ...CATEGORIES.map(c => c.id),
    ...customCats.map(c => c.id),
    'FLAG',
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        testID="brain-screen"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.infoCard}>
          <Ionicons name="bulb" size={20} color={Colors.accent} />
          <Text style={styles.infoText}>
            The categorization engine uses {CATEGORIES.length + customCats.length} categories
            ({CATEGORIES.length} built-in{customCats.length > 0 ? ` + ${customCats.length} custom` : ''}).
            Add your own keywords or create new categories. Changes apply immediately to the next scan.
          </Text>
        </View>

        <View style={styles.formatCard}>
          <Text style={styles.formatLabel}>Standard Rename Format</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.code}>[ID]_[YYYYMMDD]_[ORIGINAL_NAME].ext</Text>
          </View>
          <Text style={styles.formatExample}>e.g. MUS_20260215_guitar_chords.txt</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Built-in Categories</Text>
        </View>

        {CATEGORIES.map(cat => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            isCustom={false}
            isOpen={expanded === cat.id}
            onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
            customKeywords={customKw[cat.id] ?? []}
            input={inputByCat[cat.id] ?? ''}
            onInputChange={(t) => setInputByCat(p => ({ ...p, [cat.id]: t }))}
            onAddKeyword={() => handleAddKeyword(cat.id)}
            onRemoveKeyword={(kw) => handleRemoveKeyword(cat.id, kw)}
          />
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Custom Categories</Text>
          <TouchableOpacity style={styles.addCatBtn} onPress={() => setCreateModal(true)} testID="add-cat-btn">
            <Ionicons name="add" size={16} color={Colors.accent} />
            <Text style={styles.addCatBtnTxt}>New</Text>
          </TouchableOpacity>
        </View>

        {customCats.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="sparkles-outline" size={22} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No custom categories yet. Tap "New" to create one.</Text>
          </View>
        )}

        {customCats.map(cat => (
          <CategoryCard
            key={cat.id}
            cat={{ ...cat, regexPatterns: [] } as Category}
            isCustom
            isOpen={expanded === cat.id}
            onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
            customKeywords={customKw[cat.id] ?? []}
            input={inputByCat[cat.id] ?? ''}
            onInputChange={(t) => setInputByCat(p => ({ ...p, [cat.id]: t }))}
            onAddKeyword={() => handleAddKeyword(cat.id)}
            onRemoveKeyword={(kw) => handleRemoveKeyword(cat.id, kw)}
            onDelete={() => handleDeleteCustomCat(cat)}
          />
        ))}

        <View style={styles.pdfNote}>
          <Ionicons name="warning-outline" size={18} color={Colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pdfTitle}>Image-only PDFs (no text layer)</Text>
            <Text style={styles.pdfText}>
              PDFs with no extractable text are flagged and moved to{' '}
              <Text style={{ color: Colors.warning }}>[TO_REVIEW]</Text> for manual review.
            </Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <CreateCategoryModal
        visible={createModal}
        reservedIds={reservedIds}
        onClose={() => setCreateModal(false)}
        onSave={handleSaveNewCat}
      />
    </KeyboardAvoidingView>
  );
}

// ---------- Category Card ----------

function CategoryCard({
  cat, isCustom, isOpen, onToggle,
  customKeywords, input, onInputChange, onAddKeyword, onRemoveKeyword,
  onDelete,
}: {
  cat: Category;
  isCustom: boolean;
  isOpen: boolean;
  onToggle: () => void;
  customKeywords: string[];
  input: string;
  onInputChange: (t: string) => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (kw: string) => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.catCard} testID={`brain-cat-${cat.id}`}>
      <TouchableOpacity style={styles.catHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[styles.catIcon, { backgroundColor: `${cat.color}1a` }]}>
          <Ionicons name={cat.icon as any} size={22} color={cat.color} />
        </View>
        <View style={styles.catHeaderInfo}>
          <View style={styles.catTagRow}>
            <View style={[styles.catTag, { backgroundColor: `${cat.color}1a` }]}>
              <Text style={[styles.catTagTxt, { color: cat.color }]}>{cat.id}</Text>
            </View>
            <Text style={styles.catName}>{cat.name}</Text>
            {isCustom && (
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeTxt}>CUSTOM</Text>
              </View>
            )}
          </View>
          <Text style={styles.catDesc} numberOfLines={isOpen ? undefined : 1}>
            {cat.description}
          </Text>
        </View>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.catBody}>
          {!isCustom && cat.regexPatterns.length > 0 && (
            <>
              <Text style={styles.bodyLabel}>Regex Patterns (built-in)</Text>
              {cat.regexPatterns.map((p, i) => (
                <View key={i} style={styles.codeBlock}>
                  <Text style={styles.code}>{p}</Text>
                </View>
              ))}
            </>
          )}

          {!isCustom && (
            <>
              <Text style={[styles.bodyLabel, { marginTop: 12 }]}>
                Built-in Keywords ({cat.keywords.length})
              </Text>
              <View style={styles.kwWrap}>
                {cat.keywords.map(kw => (
                  <View key={kw} style={[styles.kwTag, { borderColor: `${cat.color}40` }]}>
                    <Text style={[styles.kwTxt, { color: cat.color }]}>{kw}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {isCustom && cat.keywords.length > 0 && (
            <>
              <Text style={styles.bodyLabel}>Default Keywords ({cat.keywords.length})</Text>
              <View style={styles.kwWrap}>
                {cat.keywords.map(kw => (
                  <View key={kw} style={[styles.kwTag, { borderColor: `${cat.color}40` }]}>
                    <Text style={[styles.kwTxt, { color: cat.color }]}>{kw}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.bodyLabel, { marginTop: 14 }]}>
            Your Custom Keywords ({customKeywords.length})
          </Text>
          <View style={styles.kwWrap}>
            {customKeywords.length === 0 && (
              <Text style={styles.emptyKwText}>No custom keywords yet. Add one below.</Text>
            )}
            {customKeywords.map(kw => (
              <TouchableOpacity
                key={kw}
                style={[styles.kwTagRemovable, { borderColor: `${cat.color}60`, backgroundColor: `${cat.color}14` }]}
                onPress={() => onRemoveKeyword(kw)}
                testID={`remove-kw-${cat.id}-${kw}`}
              >
                <Text style={[styles.kwTxt, { color: cat.color, fontFamily: Fonts.mono.bold }]}>{kw}</Text>
                <Ionicons name="close-circle" size={14} color={cat.color} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="add a keyword..."
              placeholderTextColor={Colors.textMuted}
              value={input}
              onChangeText={onInputChange}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={onAddKeyword}
              returnKeyType="done"
              testID={`add-kw-input-${cat.id}`}
            />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: cat.color }, !input.trim() && { opacity: 0.4 }]}
              onPress={onAddKeyword}
              disabled={!input.trim()}
              testID={`add-kw-btn-${cat.id}`}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color={Colors.background} />
            </TouchableOpacity>
          </View>

          {isCustom && onDelete && (
            <TouchableOpacity style={styles.deleteCatBtn} onPress={onDelete} testID={`delete-cat-${cat.id}`}>
              <Ionicons name="trash-outline" size={14} color={Colors.danger} />
              <Text style={styles.deleteCatBtnTxt}>Delete category</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ---------- Create Category Modal ----------

function CreateCategoryModal({ visible, reservedIds, onClose, onSave }: {
  visible: boolean;
  reservedIds: string[];
  onClose: () => void;
  onSave: (cat: CustomCategory) => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_PALETTE[4]);
  const [icon, setIcon] = useState(ICON_PALETTE[0]);
  const [kwInput, setKwInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setId(''); setName(''); setDescription('');
      setColor(COLOR_PALETTE[4]); setIcon(ICON_PALETTE[0]);
      setKwInput(''); setKeywords([]);
    }
  }, [visible]);

  const addKw = () => {
    const k = kwInput.trim().toLowerCase();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKwInput('');
  };
  const removeKw = (k: string) => setKeywords(keywords.filter(x => x !== k));

  const idValid = /^[A-Z]{2,4}$/.test(id) && !reservedIds.includes(id);
  const canSave = idValid && name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id,
      name: name.trim(),
      description: description.trim() || `Custom category (${name.trim()})`,
      color,
      icon,
      keywords,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Custom Category</Text>
              <TouchableOpacity onPress={onClose} testID="close-modal-btn">
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 500 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 16, gap: 14 }}
            >
              <View>
                <Text style={styles.fieldLabel}>Category ID (2–4 letters, e.g. WRK)</Text>
                <TextInput
                  style={[styles.modalInput, !idValid && id.length > 0 && { borderColor: Colors.danger }]}
                  value={id}
                  onChangeText={(t) => setId(t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                  placeholder="WRK"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  testID="new-cat-id"
                  maxLength={4}
                />
                {!idValid && id.length > 0 && (
                  <Text style={styles.errorText}>
                    {reservedIds.includes(id) ? 'This ID is already in use.' : '2–4 uppercase letters only.'}
                  </Text>
                )}
              </View>

              <View>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.modalInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Work"
                  placeholderTextColor={Colors.textMuted}
                  testID="new-cat-name"
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Work documents and projects"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Color</Text>
                <View style={styles.paletteRow}>
                  {COLOR_PALETTE.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.swatchSelected]}
                      onPress={() => setColor(c)}
                    />
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Icon</Text>
                <View style={styles.paletteRow}>
                  {ICON_PALETTE.map(i => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.iconSwatch, icon === i && { borderColor: color, backgroundColor: `${color}1a` }]}
                      onPress={() => setIcon(i)}
                    >
                      <Ionicons name={i as any} size={20} color={icon === i ? color : Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Initial Keywords ({keywords.length})</Text>
                <View style={styles.kwWrap}>
                  {keywords.map(k => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.kwTagRemovable, { borderColor: `${color}60`, backgroundColor: `${color}14` }]}
                      onPress={() => removeKw(k)}
                    >
                      <Text style={[styles.kwTxt, { color, fontFamily: Fonts.mono.bold }]}>{k}</Text>
                      <Ionicons name="close-circle" size={14} color={color} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.addRow, { marginTop: 8 }]}>
                  <TextInput
                    style={styles.input}
                    value={kwInput}
                    onChangeText={setKwInput}
                    placeholder="add keyword..."
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={addKw}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: color }, !kwInput.trim() && { opacity: 0.4 }]}
                    onPress={addKw}
                    disabled={!kwInput.trim()}
                  >
                    <Ionicons name="add" size={18} color={Colors.background} />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: color }, !canSave && { opacity: 0.4 }]}
                onPress={handleSave}
                disabled={!canSave}
                testID="save-cat-btn"
              >
                <Ionicons name="checkmark" size={18} color={Colors.background} />
                <Text style={styles.modalSaveTxt}>Create Category</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: `${Colors.accent}0f`, borderRadius: 10, borderWidth: 1,
    borderColor: `${Colors.accent}25`, padding: 12, marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, lineHeight: 20 },
  formatCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 14, marginBottom: 18,
  },
  formatLabel: {
    fontSize: 11, fontFamily: Fonts.mono.bold, color: Colors.textMuted,
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  formatExample: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted, marginTop: 6 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, marginTop: 6,
  },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  addCatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${Colors.accent}1a`, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 4, borderWidth: 1, borderColor: `${Colors.accent}40`,
  },
  addCatBtnTxt: { fontFamily: Fonts.mono.bold, color: Colors.accent, fontSize: 12 },
  catCard: {
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, marginBottom: 10, overflow: 'hidden',
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  catIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catHeaderInfo: { flex: 1 },
  catTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  catTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  catTagTxt: { fontSize: 11, fontFamily: Fonts.mono.bold },
  catName: { fontSize: 15, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  customBadge: { backgroundColor: Colors.border, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 2 },
  customBadgeTxt: { fontSize: 9, fontFamily: Fonts.mono.bold, color: Colors.textMuted, letterSpacing: 0.5 },
  catDesc: { fontSize: 12, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, lineHeight: 18 },
  catBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 14 },
  bodyLabel: {
    fontSize: 10, fontFamily: Fonts.mono.bold, color: Colors.textMuted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  codeBlock: {
    backgroundColor: Colors.background, borderRadius: 4, padding: 8, marginBottom: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  code: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.accent },
  kwWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kwTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  kwTagRemovable: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2, borderWidth: 1,
  },
  kwTxt: { fontSize: 11, fontFamily: Fonts.mono.regular, color: Colors.textMuted },
  emptyKwText: { fontSize: 12, fontFamily: Fonts.sans.regular, color: Colors.textMuted, fontStyle: 'italic' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: {
    flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: Fonts.mono.regular, color: Colors.textPrimary, fontSize: 13,
  },
  addBtn: { width: 38, height: 38, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  deleteCatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 8, borderRadius: 4,
    borderWidth: 1, borderColor: `${Colors.danger}40`, backgroundColor: `${Colors.danger}0d`,
  },
  deleteCatBtnTxt: { fontFamily: Fonts.mono.bold, color: Colors.danger, fontSize: 12 },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, borderStyle: 'dashed', padding: 14, marginBottom: 10,
  },
  emptyText: { flex: 1, fontSize: 13, fontFamily: Fonts.sans.regular, color: Colors.textSecondary },
  pdfNote: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: `${Colors.warning}0f`, borderRadius: 10, borderWidth: 1,
    borderColor: `${Colors.warning}25`, padding: 12, marginTop: 14,
  },
  pdfTitle: { fontSize: 13, fontFamily: Fonts.sans.medium, color: Colors.textPrimary, marginBottom: 3 },
  pdfText: { fontSize: 12, fontFamily: Fonts.sans.regular, color: Colors.textSecondary, lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontFamily: Fonts.sans.medium, color: Colors.textPrimary },
  fieldLabel: {
    fontSize: 10, fontFamily: Fonts.mono.bold, color: Colors.textMuted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  modalInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: Fonts.mono.regular, color: Colors.textPrimary, fontSize: 14,
  },
  errorText: { fontFamily: Fonts.mono.regular, color: Colors.danger, fontSize: 11, marginTop: 4 },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: Colors.textPrimary },
  iconSwatch: {
    width: 42, height: 42, borderRadius: 4, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface,
  },
  modalFooter: {
    flexDirection: 'row', padding: 14, gap: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
  },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 4,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelTxt: { fontFamily: Fonts.sans.medium, color: Colors.textPrimary, fontSize: 14 },
  modalSaveBtn: {
    flex: 2, flexDirection: 'row', gap: 6,
    paddingVertical: 14, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveTxt: { fontFamily: Fonts.mono.bold, color: Colors.background, fontSize: 14 },
});
