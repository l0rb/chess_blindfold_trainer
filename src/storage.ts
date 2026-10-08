const SETTINGS_KEY = 'cbt.settings';
const STATS_KEY = 'cbt.stats';

export interface Settings {
  fullMoves: number;
}

export interface Stats {
  points: number;
  streak: number;
  bestStreak: number;
  played: number;
  perfect: number;
}

export const MIN_MOVES = 1;
export const MAX_MOVES = 30;

const DEFAULT_SETTINGS: Settings = { fullMoves: 10 };
const EMPTY_STATS: Stats = { points: 0, streak: 0, bestStreak: 0, played: 0, perfect: 0 };

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function save(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: stats just won't persist */
  }
}

export function clampMoves(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.fullMoves;
  return Math.min(MAX_MOVES, Math.max(MIN_MOVES, Math.round(n)));
}

export const loadSettings = (): Settings => {
  const s = load(SETTINGS_KEY, DEFAULT_SETTINGS);
  return { fullMoves: clampMoves(s.fullMoves) };
};
export const saveSettings = (s: Settings): void => save(SETTINGS_KEY, s);

export const loadStats = (): Stats => load(STATS_KEY, EMPTY_STATS);

export function recordResult(points: number, perfect: boolean): Stats {
  const s = loadStats();
  s.played++;
  s.points += points;
  if (perfect) {
    s.perfect++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else s.streak = 0;
  save(STATS_KEY, s);
  return s;
}

export function resetStats(): Stats {
  save(STATS_KEY, EMPTY_STATS);
  return { ...EMPTY_STATS };
}
