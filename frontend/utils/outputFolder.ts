import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const OUTPUT_FOLDER_KEY = '@myOrganizer:outputFolderUri';

export interface OutputFolderInfo {
  uri: string;               // SAF content:// on Android, file:// on iOS
  isSAF: boolean;            // true if content:// (Android SAF)
  displayPath: string;       // human-friendly shortened path
}

/**
 * Produce a human-friendly path from a SAF URI or file URI.
 * Example content://.../tree/primary%3ADownload%2FmyOrganizer
 *   -> /Download/myOrganizer
 */
export function prettifyUri(uri: string): string {
  try {
    if (uri.startsWith('content://')) {
      const dec = decodeURIComponent(uri);
      // tree/primary:Download/myOrganizer  or  tree/XXXX-XXXX:Folder
      const treeIdx = dec.indexOf('/tree/');
      if (treeIdx >= 0) {
        const rest = dec.substring(treeIdx + 6);
        const colon = rest.indexOf(':');
        if (colon >= 0) {
          const root = rest.substring(0, colon);            // primary or XXXX-XXXX
          const sub = rest.substring(colon + 1).split('/document/')[0];
          const label = root === 'primary' ? 'Internal Storage' : root;
          return `${label}/${sub}`;
        }
      }
      return dec;
    }
    // file:// URI
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
  } catch {
    return uri;
  }
}

export async function getSavedOutputFolder(): Promise<OutputFolderInfo | null> {
  try {
    const uri = await AsyncStorage.getItem(OUTPUT_FOLDER_KEY);
    if (!uri) return null;
    return {
      uri,
      isSAF: uri.startsWith('content://'),
      displayPath: prettifyUri(uri),
    };
  } catch {
    return null;
  }
}

export async function saveOutputFolder(uri: string): Promise<OutputFolderInfo> {
  await AsyncStorage.setItem(OUTPUT_FOLDER_KEY, uri);
  return {
    uri,
    isSAF: uri.startsWith('content://'),
    displayPath: prettifyUri(uri),
  };
}

export async function clearOutputFolder(): Promise<void> {
  await AsyncStorage.removeItem(OUTPUT_FOLDER_KEY);
}

/**
 * Prompt user to pick an output folder (SAF on Android, fallback file:// on iOS).
 * On Android returns a persistent SAF content:// URI with write permissions.
 * On iOS, returns the private app document directory (folder access is restricted).
 */
export async function pickOutputFolder(): Promise<OutputFolderInfo | null> {
  if (Platform.OS === 'android') {
    try {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return null;
      return saveOutputFolder(perm.directoryUri);
    } catch (e) {
      console.warn('pickOutputFolder failed', e);
      return null;
    }
  }
  // iOS fallback: use the app document directory (private but always writable).
  const base = `${FileSystem.documentDirectory}myOrganizer/`;
  await FileSystem.makeDirectoryAsync(base, { intermediates: true });
  return saveOutputFolder(base);
}

/**
 * Ensure a sub-path exists inside the output folder and return a writable location
 * we can save files into. Returns either:
 *  - { type: 'saf', parentUri } for Android SAF — callers must use createFileAsync()
 *  - { type: 'fs', path } for regular file:// paths — callers can use writeAsStringAsync()
 */
export interface WritableLocation {
  type: 'saf' | 'fs';
  parent: string;           // SAF URI of the directory, or file:// path ending with '/'
  label: string;            // friendly label for messages
}

export async function ensureSubfolder(
  base: OutputFolderInfo,
  subfolder: string,
): Promise<WritableLocation> {
  if (base.isSAF) {
    const saf = FileSystem.StorageAccessFramework;
    // SAF doesn't support "mkdir -p" with slashes; split and create each segment.
    const segments = subfolder.split('/').filter(Boolean);
    let parent = base.uri;
    for (const seg of segments) {
      // Look for an existing child with this name; otherwise create it.
      try {
        const existingChildren = await saf.readDirectoryAsync(parent);
        const match = existingChildren.find(u => {
          const dec = decodeURIComponent(u);
          return dec.endsWith('/' + seg) || dec.endsWith('%2F' + seg) || dec.endsWith(':' + seg);
        });
        if (match) {
          parent = match;
          continue;
        }
      } catch { /* ignore */ }
      parent = await saf.makeDirectoryAsync(parent, seg);
    }
    return { type: 'saf', parent, label: `${base.displayPath}/${subfolder}` };
  }
  const path = base.uri.endsWith('/') ? `${base.uri}${subfolder}/` : `${base.uri}/${subfolder}/`;
  await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  return { type: 'fs', parent: path, label: path };
}

/**
 * Read any file (file:// or content://) as base64 bytes.
 */
export async function readAsBase64(uri: string): Promise<string> {
  if (uri.startsWith('content://')) {
    return FileSystem.StorageAccessFramework.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/**
 * Write a file to the given writable location.
 * For SAF, create the file and write base64 data.
 * For FS, directly write base64 data.
 */
export async function writeFile(
  location: WritableLocation,
  filename: string,
  srcUri: string,
  mimeType: string = 'application/octet-stream',
): Promise<string> {
  const data = await readAsBase64(srcUri);
  if (location.type === 'saf') {
    const saf = FileSystem.StorageAccessFramework;
    const fileUri = await saf.createFileAsync(location.parent, filename, mimeType);
    await saf.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.Base64 });
    return fileUri;
  }
  const path = location.parent + filename;
  await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    mp4: 'video/mp4', mov: 'video/quicktime',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
  };
  return map[ext] ?? 'application/octet-stream';
}
