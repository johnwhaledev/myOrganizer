export const Colors = {
  // Backgrounds — JW Night Terminal
  background: '#0D1518',
  surface:    '#121C20',
  card:       '#162028',
  border:     '#1E293B',

  // Text
  textPrimary:   '#F1F5F9',  // headings, titles
  textSecondary: '#D1D5DB',  // body, descriptions, subtitles
  textMuted:     '#4B5563',  // labels, captions, meta

  // Accent
  accent:     '#2ECC71',
  accentDark: '#27AE60',

  // Semantic
  danger:  '#ef4444',
  warning: '#f59e0b',
  success: '#2ECC71',

  // Data only — never for UI chrome
  data: '#00B4D8',

  // Category colors
  MUS:           '#8b5cf6',
  SPO:           '#f59e0b',
  FAM:           '#ec4899',
  TEC:           '#3b82f6',
  FLAG:          '#ef4444',
  UNCATEGORIZED: '#4B5563',
} as const;

export type ColorKey = keyof typeof Colors;
