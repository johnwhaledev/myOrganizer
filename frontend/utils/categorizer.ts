import { CATEGORIES, type Category } from './knowledgeBase';

export interface CategorizationResult {
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  suggestedName: string;
  isPdf: boolean;
  isTextless: boolean;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getBaseNameWithoutExt(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

/**
 * Categorize a file using the provided category list (defaults to built-in).
 * Pass the result of `loadEffectiveCategories()` to honor user-defined
 * custom categories and extra keywords.
 */
export function categorizeFile(
  filename: string,
  textContent: string = '',
  categories: Category[] = CATEGORIES,
): CategorizationResult {
  const ext = getFileExtension(filename);
  const isPdf = ext === 'pdf';
  const isTextless = isPdf && textContent.trim().length < 50;

  if (isTextless) {
    return {
      categoryId: 'FLAG',
      categoryName: 'Manual Review',
      confidence: 1.0,
      suggestedName: filename,
      isPdf: true,
      isTextless: true,
    };
  }

  const textToAnalyze = `${filename} ${textContent}`.toLowerCase();
  let bestCategoryId: string | null = null;
  let bestScore = 0;

  for (const cat of categories) {
    let score = 0;

    for (const patternStr of cat.regexPatterns) {
      try {
        const pattern = new RegExp(patternStr, 'gi');
        const matches = textToAnalyze.match(pattern);
        if (matches) score += matches.length * 2;
      } catch { /* skip invalid regex */ }
    }

    for (const keyword of cat.keywords) {
      if (textToAnalyze.includes(keyword.toLowerCase())) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategoryId = cat.id;
    }
  }

  if (bestScore < 2) bestCategoryId = null;

  const dateStr = getTodayStr();
  const baseName = getBaseNameWithoutExt(filename);
  const extension = ext ? `.${ext}` : '';
  const suggestedName = bestCategoryId
    ? `${bestCategoryId}_${dateStr}_${baseName}${extension}`
    : filename;

  const bestCategory = categories.find(c => c.id === bestCategoryId);

  return {
    categoryId: bestCategoryId,
    categoryName: bestCategory?.name || null,
    confidence: Math.min(bestScore / 8, 1),
    suggestedName,
    isPdf,
    isTextless: false,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(dateStr: string | Date): string {
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
