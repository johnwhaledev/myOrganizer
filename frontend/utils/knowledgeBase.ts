export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  keywords: string[];
  regexPatterns: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'MUS',
    name: 'Music',
    color: '#8b5cf6',
    icon: 'musical-notes-outline',
    description: 'Music theory, instruments, lyrics, compositions, recordings',
    keywords: [
      'music', 'song', 'lyric', 'chord', 'melody', 'beat', 'rhythm',
      'instrument', 'guitar', 'piano', 'bass', 'drum', 'vocal', 'concert',
      'album', 'track', 'tempo', 'note', 'scale', 'harmony', 'composer',
      'orchestra', 'band', 'playlist', 'audio', 'musical', 'singer',
    ],
    regexPatterns: [
      '\\b(music|song|lyric|chord|melody|rhythm|guitar|piano|bass|drum|vocal)\\b',
      '\\b(album|track|tempo|harmony|composer|orchestra|playlist|singer)\\b',
    ],
  },
  {
    id: 'SPO',
    name: 'Sport',
    color: '#f59e0b',
    icon: 'fitness-outline',
    description: 'Training schedules, tactics, tournament results, athlete data',
    keywords: [
      'sport', 'training', 'exercise', 'workout', 'tactic', 'tournament',
      'match', 'team', 'player', 'coach', 'fitness', 'goal', 'score',
      'athlete', 'race', 'championship', 'league', 'season', 'performance',
      'stamina', 'strength', 'cardio', 'running', 'swimming', 'cycling',
    ],
    regexPatterns: [
      '\\b(sport|training|workout|exercise|tournament|match|team|coach|fitness)\\b',
      '\\b(athlete|championship|league|performance|stamina|cardio|running)\\b',
    ],
  },
  {
    id: 'FAM',
    name: 'Family',
    color: '#ec4899',
    icon: 'heart-outline',
    description: 'Child documents, recipes, school materials, family activities',
    keywords: [
      'family', 'child', 'recipe', 'school', 'homework', 'birthday', 'vacation',
      'meal', 'kid', 'parent', 'home', 'garden', 'cooking', 'trip', 'holiday',
      'baby', 'mother', 'father', 'sister', 'brother', 'wedding', 'photo',
      'menu', 'ingredient', 'breakfast', 'dinner', 'lunch',
    ],
    regexPatterns: [
      '\\b(family|child|recipe|school|homework|birthday|vacation|cooking)\\b',
      '\\b(baby|parent|wedding|menu|ingredient|breakfast|dinner|lunch)\\b',
    ],
  },
  {
    id: 'TEC',
    name: 'Tech Specs',
    color: '#3b82f6',
    icon: 'construct-outline',
    description: 'Technical manuals, datasheets, specifications, project docs',
    keywords: [
      'manual', 'datasheet', 'specification', 'technical', 'circuit', 'wiring',
      'installation', 'module', 'configuration', 'api', 'software', 'hardware',
      'protocol', 'interface', 'version', 'release', 'firmware', 'driver',
      'schematic', 'diagram', 'pinout', 'voltage', 'current', 'frequency',
      'component', 'sensor', 'processor', 'memory', 'network', 'database',
    ],
    regexPatterns: [
      '\\b(manual|datasheet|specification|circuit|wiring|installation|config)\\b',
      '\\b(api|software|hardware|protocol|firmware|schematic|diagram|sensor)\\b',
    ],
  },
];

export function getCategoryById(id: string): Category | undefined {
  return CATEGORIES.find(c => c.id === id);
}

export function getCategoryColor(id: string | null): string {
  if (!id) return '#6b7280';
  const map: Record<string, string> = {
    MUS: '#8b5cf6',
    SPO: '#f59e0b',
    FAM: '#ec4899',
    TEC: '#3b82f6',
    FLAG: '#ef4444',
  };
  return map[id] ?? '#6b7280';
}
