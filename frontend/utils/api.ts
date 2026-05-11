/**
 * Local-first API layer.
 *
 * Persists scans, operations and aggregated stats in AsyncStorage so the app
 * works 100% offline with zero backend. The exported functions mirror the
 * shape of the original HTTP API so the rest of the code (home screen,
 * organizers, settings) doesn't need to change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SCANS_KEY = '@myOrganizer:scans';
const OPS_KEY = '@myOrganizer:operations';
const MAX_SCANS = 50;
const MAX_OPS = 200;

export interface ScanSession {
  id: string;
  timestamp: string;
  total_files: number;
  total_size: number;
  duplicates_count: number;
  recoverable_space: number;
  files_to_organize: number;
  protected_subfolders: number;
  scan_path: string;
  module: string;
}

export interface Operation {
  id: string;
  timestamp: string;
  operation_type: string;
  original_name: string;
  new_name?: string;
  file_size: number;
  category?: string;
}

export interface Stats {
  total_scans: number;
  total_operations: number;
  total_space_freed: number;
  rename_count: number;
  delete_count: number;
}

function uuid(): string {
  // Simple RFC4122-ish v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to persist ${key}`, e);
  }
}

// ---------- Reads ----------

export async function getStats(): Promise<Stats> {
  const [scans, ops] = await Promise.all([
    loadJson<ScanSession[]>(SCANS_KEY, []),
    loadJson<Operation[]>(OPS_KEY, []),
  ]);
  const deleted = ops.filter(o => o.operation_type === 'delete');
  const renamed = ops.filter(o => o.operation_type === 'rename');
  return {
    total_scans: scans.length,
    total_operations: ops.length,
    total_space_freed: deleted.reduce((s, o) => s + (o.file_size || 0), 0),
    rename_count: renamed.length,
    delete_count: deleted.length,
  };
}

export async function getOperations(): Promise<Operation[]> {
  const list = await loadJson<Operation[]>(OPS_KEY, []);
  // Newest first
  return [...list].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export async function getScans(): Promise<ScanSession[]> {
  const list = await loadJson<ScanSession[]>(SCANS_KEY, []);
  return [...list].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

// ---------- Writes ----------

export async function createScan(data: Partial<ScanSession>): Promise<ScanSession> {
  const record: ScanSession = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    total_files: data.total_files ?? 0,
    total_size: data.total_size ?? 0,
    duplicates_count: data.duplicates_count ?? 0,
    recoverable_space: data.recoverable_space ?? 0,
    files_to_organize: data.files_to_organize ?? 0,
    protected_subfolders: data.protected_subfolders ?? 0,
    scan_path: data.scan_path ?? '',
    module: data.module ?? '',
  };
  const list = await loadJson<ScanSession[]>(SCANS_KEY, []);
  list.push(record);
  // Keep only the latest MAX_SCANS
  const trimmed = list.slice(-MAX_SCANS);
  await saveJson(SCANS_KEY, trimmed);
  return record;
}

export async function createOperation(data: Partial<Operation>): Promise<Operation> {
  const record: Operation = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    operation_type: data.operation_type ?? 'unknown',
    original_name: data.original_name ?? '',
    new_name: data.new_name,
    file_size: data.file_size ?? 0,
    category: data.category,
  };
  const list = await loadJson<Operation[]>(OPS_KEY, []);
  list.push(record);
  const trimmed = list.slice(-MAX_OPS);
  await saveJson(OPS_KEY, trimmed);
  return record;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.multiRemove([SCANS_KEY, OPS_KEY]);
}
