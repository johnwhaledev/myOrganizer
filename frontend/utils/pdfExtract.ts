import * as FileSystem from 'expo-file-system/legacy';

// Dimensione massima PDF da leggere. Oltre questa soglia si usa solo il nome file.
const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

// Sequenza minima di caratteri ASCII per essere considerata "testo".
const MIN_SEQ = 4;

// Testo massimo restituito (bastano ~2000 char per la categorizzazione).
const MAX_TEXT = 2000;

// Parole chiave della struttura PDF: non sono contenuto utile.
const PDF_SYNTAX = new Set([
  'stream', 'endstream', 'endobj', 'xref', 'trailer', 'startxref',
  'BT', 'ET', 'Tf', 'Td', 'Tm', 'Tj', 'TJ', 'Font', 'Type',
  'Page', 'Pages', 'Catalog', 'Filter', 'Length', 'Width', 'Height',
  'Resources', 'Contents', 'MediaBox', 'ProcSet', 'PDF', 'Text',
]);

/**
 * Estrae le sequenze di testo ASCII leggibile da una stringa binaria.
 * Approccio "strings" (Unix) — funziona su stream PDF non compressi e metadati.
 * I PDF con solo immagini restituiranno pochissimo testo.
 */
function extractStrings(binary: string): string {
  const parts: string[] = [];
  let current = '';

  for (let i = 0; i < binary.length; i++) {
    const code = binary.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7E) {
      current += binary[i];
    } else {
      if (current.length >= MIN_SEQ && !PDF_SYNTAX.has(current.trim())) {
        parts.push(current.trim());
      }
      current = '';
    }
  }

  // Controlla l'ultima sequenza in corso
  if (current.length >= MIN_SEQ && !PDF_SYNTAX.has(current.trim())) {
    parts.push(current.trim());
  }

  return parts.join(' ').slice(0, MAX_TEXT);
}

/**
 * Legge un file PDF (file:// o content://) ed estrae il testo leggibile
 * senza librerie native aggiuntive.
 *
 * Funziona per PDF con layer testuale non compresso.
 * PDF solo-immagine (scansioni) restituiranno una stringa molto breve o vuota:
 * il categorizzatore li flagga correttamente come [TO_REVIEW].
 *
 * @param uri        URI del file (file:// o content://)
 * @param sizeBytes  Dimensione in byte già nota (evita una getInfoAsync extra)
 */
export async function extractPdfText(uri: string, sizeBytes: number): Promise<string> {
  // File troppo grandi: rinuncia, il categorizzatore userà solo il nome file.
  if (sizeBytes > MAX_PDF_BYTES) return '';

  try {
    let base64: string;

    if (uri.startsWith('content://')) {
      base64 = await FileSystem.StorageAccessFramework.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    // atob() disponibile in React Native con engine Hermes (Expo SDK ≥ 48).
    const binary = atob(base64);
    return extractStrings(binary);
  } catch {
    // File illeggibile — restituisce stringa vuota, il categorizzatore flagga.
    return '';
  }
}
