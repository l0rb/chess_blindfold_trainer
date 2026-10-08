import { FALLBACK_PLAYERS } from './fallbackPlayers';

const API = 'https://lichess.org';
const PERFS = ['blitz', 'rapid', 'classical'] as const;
const TOP_CACHE_KEY = 'cbt.topPlayers';
const MAX_ATTEMPTS = 4;
// Look back up to ~2 years for variety.
const LOOKBACK_MS = 2 * 365 * 24 * 3600 * 1000;

interface LichessPlayer {
  user?: { name: string; title?: string };
  rating?: number;
  aiLevel?: number;
}

interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  createdAt: number;
  moves?: string;
  initialFen?: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  opening?: { eco: string; name: string; ply: number };
}

export interface GameInfo {
  id: string;
  url: string;
  white: string;
  black: string;
  speed: string;
  date: Date;
  opening?: string;
  /** All SAN moves of the game. */
  moves: string[];
}

export class LichessError extends Error {}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new LichessError('Could not reach lichess.org. Check your connection and try again.');
  }
  if (res.status === 429) {
    throw new LichessError('Lichess rate limit reached. Please wait a minute and try again.');
  }
  if (!res.ok) throw new LichessError(`Lichess request failed (HTTP ${res.status}).`);
  return res;
}

async function topPlayers(): Promise<string[]> {
  try {
    const cached = sessionStorage.getItem(TOP_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    /* storage unavailable */
  }
  try {
    const res = await fetchOk(`${API}/api/player/top/50/${randomItem(PERFS)}`);
    const data: { users: { username: string }[] } = await res.json();
    const names = data.users.map(u => u.username);
    if (!names.length) return FALLBACK_PLAYERS;
    try {
      sessionStorage.setItem(TOP_CACHE_KEY, JSON.stringify(names));
    } catch {
      /* ignore */
    }
    return names;
  } catch (e) {
    if (e instanceof LichessError && e.message.includes('rate limit')) throw e;
    return FALLBACK_PLAYERS;
  }
}

function playerLabel(p: LichessPlayer): string {
  if (p.aiLevel) return `Stockfish level ${p.aiLevel}`;
  if (!p.user) return 'Anonymous';
  const title = p.user.title ? `${p.user.title} ` : '';
  const rating = p.rating ? ` (${p.rating})` : '';
  return `${title}${p.user.name}${rating}`;
}

async function gamesOf(user: string): Promise<LichessGame[]> {
  const until = Date.now() - Math.floor(Math.random() * LOOKBACK_MS);
  const params = new URLSearchParams({
    max: '20',
    until: String(until),
    rated: 'true',
    perfType: PERFS.join(','),
    moves: 'true',
    opening: 'true',
    clocks: 'false',
    evals: 'false',
  });
  const res = await fetchOk(`${API}/api/games/user/${encodeURIComponent(user)}?${params}`, {
    headers: { Accept: 'application/x-ndjson' },
  });
  const text = await res.text();
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as LichessGame);
}

/** Fetch a random standard game with at least `minPlies` half-moves. */
export async function fetchRandomGame(minPlies: number): Promise<GameInfo> {
  const players = await topPlayers();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const user = randomItem(players);
    let games: LichessGame[];
    try {
      games = await gamesOf(user);
    } catch (e) {
      // A closed/renamed account just means we try someone else.
      if (e instanceof LichessError && !e.message.includes('HTTP 404')) throw e;
      continue;
    }
    const candidates = games.filter(
      g => g.variant === 'standard' && !g.initialFen && (g.moves?.split(' ').length ?? 0) >= minPlies,
    );
    if (!candidates.length) continue;
    const g = randomItem(candidates);
    return {
      id: g.id,
      url: `https://lichess.org/${g.id}`,
      white: playerLabel(g.players.white),
      black: playerLabel(g.players.black),
      speed: g.speed,
      date: new Date(g.createdAt),
      opening: g.opening ? `${g.opening.eco} ${g.opening.name}` : undefined,
      moves: g.moves!.split(' '),
    };
  }
  throw new LichessError('Could not find a suitable game. Please try again.');
}
