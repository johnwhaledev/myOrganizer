import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category } from './knowledgeBase';

const CUSTOM_KEYWORDS_KEY = '@myOrganizer:customKeywords';
const CUSTOM_CATEGORIES_KEY = '@myOrganizer:customCategories';

/**
 * Additional keywords user adds to existing (built-in or custom) categories.
 * Map: categoryId -> list of user-added keywords
 */
export type CustomKeywordsMap = Record<string, string[]>;

/**
 * A user-defined category. Shares the same shape as Category but is editable.
 */
export interface CustomCategory {
  id: string;           // 3-4 letter uppercase code
  name: string;
  color: string;
  icon: string;         // Ionicons name
  description: string;
  keywords: string[];
}

// ---------- Custom Keywords (extensions to any category) ----------

export async function loadCustomKeywords(): Promise<CustomKeywordsMap> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_KEYWORDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveCustomKeywords(map: CustomKeywordsMap): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_KEYWORDS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save custom keywords:', e);
  }
}

export async function addCustomKeyword(categoryId: string, keyword: string): Promise<CustomKeywordsMap> {
  const clean = keyword.trim().toLowerCase();
  if (!clean) return loadCustomKeywords();
  const map = await loadCustomKeywords();
  const list = map[categoryId] ?? [];
  if (!list.includes(clean)) list.push(clean);
  map[categoryId] = list;
  await saveCustomKeywords(map);
  return map;
}

export async function removeCustomKeyword(categoryId: string, keyword: string): Promise<CustomKeywordsMap> {
  const map = await loadCustomKeywords();
  if (map[categoryId]) {
    map[categoryId] = map[categoryId].filter(k => k !== keyword);
    if (map[categoryId].length === 0) delete map[categoryId];
    await saveCustomKeywords(map);
  }
  return map;
}

// ---------- Custom Categories ----------

export async function loadCustomCategories(): Promise<CustomCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCustomCategories(list: CustomCategory[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save custom categories:', e);
  }
}

export async function addCustomCategory(cat: CustomCategory): Promise<CustomCategory[]> {
  const list = await loadCustomCategories();
  const idx = list.findIndex(c => c.id === cat.id);
  if (idx >= 0) list[idx] = cat; else list.push(cat);
  await saveCustomCategories(list);
  return list;
}

export async function removeCustomCategory(id: string): Promise<CustomCategory[]> {
  const list = await loadCustomCategories();
  const next = list.filter(c => c.id !== id);
  await saveCustomCategories(next);
  // also strip custom keywords attached to this id
  const kw = await loadCustomKeywords();
  if (kw[id]) {
    delete kw[id];
    await saveCustomKeywords(kw);
  }
  return next;
}

// ---------- Effective Categories (merge built-in + custom) ----------

/**
 * Build the effective category list used by the categorizer.
 * Built-in categories keep their fixed id/name/color/icon/regex, but gain
 * user-added keywords. Custom categories are appended.
 */
export function buildEffectiveCategories(
  builtIn: Category[],
  customKeywords: CustomKeywordsMap,
  customCategories: CustomCategory[],
): Category[] {
  const mergedBuiltIn: Category[] = builtIn.map(c => ({
    ...c,
    keywords: [...c.keywords, ...(customKeywords[c.id] ?? [])],
  }));

  const customAsCategories: Category[] = customCategories.map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    description: c.description,
    // Merge custom-category intrinsic keywords with user-extended ones
    keywords: [...c.keywords, ...(customKeywords[c.id] ?? [])],
    // Auto-generate a simple regex pattern from the keywords (word boundaries)
    regexPatterns: buildAutoRegex([...c.keywords, ...(customKeywords[c.id] ?? [])]),
  }));

  return [...mergedBuiltIn, ...customAsCategories];
}

function buildAutoRegex(keywords: string[]): string[] {
  if (!keywords.length) return [];
  const escaped = keywords
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(k => k.length > 0);
  if (!escaped.length) return [];
  // Split into chunks of 15 to keep regex readable
  const chunks: string[] = [];
  for (let i = 0; i < escaped.length; i += 15) {
    chunks.push(`\\b(${escaped.slice(i, i + 15).join('|')})\\b`);
  }
  return chunks;
}

/** Convenience: load full effective categories in one call. */
export async function loadEffectiveCategories(builtIn: Category[]): Promise<Category[]> {
  const [kw, cats] = await Promise.all([loadCustomKeywords(), loadCustomCategories()]);
  return buildEffectiveCategories(builtIn, kw, cats);
}
