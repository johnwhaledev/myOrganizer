import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  lastModified?: number;
}

export interface PickResult {
  files: PickedFile[];
  source: 'folder' | 'files';
  folderUri?: string;
}

/**
 * Extracts a filename from any URI (SAF content:// URIs or regular file URIs).
 */
function uriToFilename(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    // SAF URIs often look like: content://.../document/primary%3AFolder%2Ffile.ext
    // Grab everything after the last '/' or ':'.
    const slash = decoded.lastIndexOf('/');
    const colon = decoded.lastIndexOf(':');
    const cut = Math.max(slash, colon);
    return cut >= 0 ? decoded.substring(cut + 1) : decoded;
  } catch {
    return uri.split('/').pop() ?? uri;
  }
}

/**
 * Pick a folder (Android SAF) and return the list of files inside (non-recursive).
 * Returns null if the user cancels or the platform doesn't support it.
 */
export async function pickFolderAndroid(): Promise<PickResult | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const { StorageAccessFramework } = FileSystem;
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return null;

    const folderUri = perm.directoryUri;
    const entries = await StorageAccessFramework.readDirectoryAsync(folderUri);

    const files: PickedFile[] = [];
    for (const entryUri of entries) {
      try {
        const info: any = await FileSystem.getInfoAsync(entryUri, { size: true });
        // Skip nested directories (non-recursive by design)
        if (info?.isDirectory) continue;
        files.push({
          uri: entryUri,
          name: uriToFilename(entryUri),
          size: typeof info?.size === 'number' ? info.size : 0,
          lastModified: info?.modificationTime ? info.modificationTime * 1000 : undefined,
        });
      } catch {
        // Some entries may not be readable; skip them.
      }
    }
    return { files, source: 'folder', folderUri };
  } catch (e) {
    console.warn('pickFolderAndroid failed', e);
    return null;
  }
}

/**
 * Pick multiple files via the document picker (cross-platform).
 */
export async function pickFiles(): Promise<PickResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const files: PickedFile[] = picked.assets.map(a => ({
    uri: a.uri,
    name: a.name,
    size: a.size ?? 0,
    lastModified: a.lastModified,
  }));
  return { files, source: 'files' };
}

export const supportsFolderPick = Platform.OS === 'android';
