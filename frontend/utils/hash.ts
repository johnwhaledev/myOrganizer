import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

// Files larger than this will use a fast-hash strategy (size only) to avoid OOM.
// 25 MB is a reasonable ceiling for full-content MD5 on mobile.
export const MAX_FULL_HASH_BYTES = 25 * 1024 * 1024;

/**
 * Read any file URI (file:// or content://) as base64. Needed because SAF URIs
 * cannot be read with the standard FileSystem.readAsStringAsync.
 */
async function readBase64(uri: string): Promise<string> {
  if (uri.startsWith('content://')) {
    return FileSystem.StorageAccessFramework.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/**
 * Compute MD5 of a file by reading its content as base64 and running it through
 * expo-crypto. Works for both regular and SAF URIs.
 * For very large files, falls back to a size-based marker (caller must treat
 * 'SKIP_*' hashes as non-duplicates of each other).
 */
export async function hashFile(uri: string, size: number): Promise<string> {
  if (size > MAX_FULL_HASH_BYTES) {
    // Too large to safely base64-read on mobile. Use a distinct marker per file so
    // they won't collide into false-positive duplicate groups.
    return `SKIP_LARGE_${size}_${uri.slice(-16)}`;
  }
  try {
    const data = await readBase64(uri);
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, data);
    // Combine with size to further reduce accidental collisions.
    return `${size}-${digest}`;
  } catch {
    // Unreadable file — treat as unique
    return `ERR_${size}_${uri.slice(-16)}`;
  }
}
