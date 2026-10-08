import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';

import { EditorBoard } from './board';
import { buildPuzzle, movePairs, type Puzzle } from './game';
import { fetchRandomGame, LichessError, type GameInfo } from './lichess';
import { scorePosition } from './scoring';
import {
  clampMoves,
  loadSettings,
  loadStats,
  recordResult,
  resetStats,
  saveSettings,
  type Stats,
} from './storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const landing = $('landing');
const trainer = $('trainer');
const range = $<HTMLInputElement>('moves-range');
const number = $<HTMLInputElement>('moves-number');
const status = $('status');
const moveList = $('move-list');
const result = $('result');
const submitBtn = $<HTMLButtonElement>('submit-btn');
const nextBtn = $<HTMLButtonElement>('next-btn');
const viewMine = $('view-mine');
const viewSolution = $('view-solution');

const board = new EditorBoard($('board'), { white: $('palette-white'), black: $('palette-black') });
board.addEraser($('eraser-btn'));

let settings = loadSettings();
let current: { game: GameInfo; puzzle: Puzzle } | undefined;
let answer: ReturnType<EditorBoard['getPieces']> | undefined;
let loadToken = 0;

// ---------- stats ----------

function renderStats(s: Stats = loadStats()): void {
  $('stat-points').textContent = String(s.points);
  $('stat-streak').textContent = String(s.streak);
  $('land-points').textContent = String(s.points);
  $('land-streak').textContent = String(s.streak);
  $('land-best').textContent = String(s.bestStreak);
  $('land-played').textContent = String(s.played);
  $('land-perfect').textContent = String(s.perfect);
}

$('reset-stats').addEventListener('click', () => {
  if (confirm('Reset all points and streaks?')) renderStats(resetStats());
});

// ---------- settings ----------

function describeMoves(n: number): string {
  if (n <= 4) return 'Warm-up: a handful of opening moves.';
  if (n <= 10) return 'Solid practice: through the opening.';
  if (n <= 20) return 'Hard: deep into the middlegame.';
  return 'Expert: long sequences with lots of captures.';
}

function setMoves(n: number): void {
  settings = { fullMoves: clampMoves(n) };
  range.value = number.value = String(settings.fullMoves);
  $('moves-hint').textContent = `${settings.fullMoves} move${settings.fullMoves === 1 ? '' : 's'} per side · ${describeMoves(settings.fullMoves)}`;
  saveSettings(settings);
}

range.addEventListener('input', () => setMoves(Number(range.value)));
number.addEventListener('change', () => setMoves(Number(number.value)));

// ---------- views ----------

function show(view: 'landing' | 'trainer'): void {
  landing.hidden = view !== 'landing';
  trainer.hidden = view !== 'trainer';
  if (view === 'landing') renderStats();
  window.scrollTo({ top: 0 });
}

$('start-btn').addEventListener('click', () => {
  show('trainer');
  void newGame();
});
$('back-btn').addEventListener('click', () => {
  loadToken++; // ignore any in-flight fetch
  show('landing');
});
$('home-link').addEventListener('click', () => $('back-btn').click());

// ---------- game flow ----------

function setStatus(message: string | undefined, kind: 'loading' | 'error' = 'loading'): void {
  status.hidden = !message;
  status.className = `status ${kind}`;
  status.innerHTML = '';
  if (!message) return;
  status.append(message);
  if (kind === 'error') {
    const retry = document.createElement('button');
    retry.className = 'btn small';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => void newGame());
    status.append(retry);
  }
}

function renderMoves(moves: string[]): void {
  moveList.innerHTML = '';
  for (const [num, white, black] of movePairs(moves)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="num">${num}.</span><span class="san"></span><span class="san"></span>`;
    const [w, b] = li.querySelectorAll<HTMLElement>('.san');
    w.textContent = white;
    b.textContent = black ?? '';
    moveList.appendChild(li);
  }
}

async function newGame(): Promise<void> {
  const token = ++loadToken;
  const n = settings.fullMoves;
  current = undefined;
  answer = undefined;
  board.reset();
  moveList.innerHTML = '';
  result.hidden = true;
  submitBtn.hidden = false;
  submitBtn.disabled = true;
  nextBtn.hidden = true;
  $('moves-title').textContent = 'Moves';
  $('moves-chip').textContent = `${n} move${n === 1 ? '' : 's'}`;
  setStatus('Fetching a random game from Lichess…');

  try {
    const game = await fetchRandomGame(n * 2);
    if (token !== loadToken) return;
    current = { game, puzzle: buildPuzzle(game.moves, n) };
    setStatus(undefined);
    renderMoves(current.puzzle.moves);
    submitBtn.disabled = false;
    if (import.meta.env.DEV) console.debug('Solution FEN:', current.puzzle.fen);
  } catch (e) {
    if (token !== loadToken) return;
    setStatus(e instanceof LichessError ? e.message : 'Something went wrong loading the game.', 'error');
    if (!(e instanceof LichessError)) console.error(e);
  }
}

function submit(): void {
  if (!current) return;
  answer = board.getPieces();
  const n = settings.fullMoves;
  const score = scorePosition(current.puzzle.target, answer, n);
  const stats = recordResult(score.points, score.perfect);
  renderStats(stats);

  board.showResult(score.squares);
  setView('mine');

  const pct = Math.round(score.accuracy * 100);
  $('result-pct').textContent = `${pct}%`;
  $('result-ring').style.setProperty('--pct', String(pct));
  $('result-ring').classList.toggle('perfect', score.perfect);
  $('result-title').textContent = score.perfect
    ? 'Perfect!'
    : pct >= 80
      ? 'Very close'
      : pct >= 50
        ? 'Good effort'
        : 'Keep practicing';
  $('result-sub').textContent =
    `${score.correct}/${score.total} squares · +${score.points} pts` +
    (score.perfect ? ` · streak ${stats.streak}` : stats.played > 1 ? ' · streak reset' : '');

  const { game } = current;
  const info = $('game-info');
  info.innerHTML = '';
  const players = document.createElement('p');
  players.innerHTML = '<b></b> vs <b></b>';
  const [w, b] = players.querySelectorAll('b');
  w.textContent = game.white;
  b.textContent = game.black;
  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = [game.opening, `${game.speed} · ${game.date.toLocaleDateString()}`].filter(Boolean).join(' · ');
  const link = document.createElement('a');
  link.href = `${game.url}#${n * 2}`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'View this position on Lichess ↗';
  info.append(players, meta, link);

  result.hidden = false;
  submitBtn.hidden = true;
  nextBtn.hidden = false;
  nextBtn.focus();
}

function setView(which: 'mine' | 'solution'): void {
  if (!current || !answer) return;
  board.showPieces(which === 'mine' ? answer : current.puzzle.target);
  viewMine.classList.toggle('active', which === 'mine');
  viewSolution.classList.toggle('active', which === 'solution');
}

submitBtn.addEventListener('click', submit);
nextBtn.addEventListener('click', () => void newGame());
viewMine.addEventListener('click', () => setView('mine'));
viewSolution.addEventListener('click', () => setView('solution'));
$('clear-btn').addEventListener('click', () => {
  if (!answer) board.clear();
});

// ---------- init ----------

setMoves(settings.fullMoves);
renderStats();
show('landing');
