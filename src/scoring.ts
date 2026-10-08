import type { Key, Pieces } from 'chessground/types';

export type SquareResult = 'correct' | 'wrong' | 'missing' | 'extra';

export interface Score {
  /** Fraction of relevant squares that are correct (0..1). */
  accuracy: number;
  perfect: boolean;
  points: number;
  correct: number;
  total: number;
  squares: Map<Key, SquareResult>;
}

/**
 * Compare the user's placement with the target. Only squares occupied in
 * either position count, so an empty board scores 0 and every stray or
 * missing piece costs accuracy.
 */
export function scorePosition(target: Pieces, user: Pieces, fullMoves: number): Score {
  const keys = new Set<Key>([...target.keys(), ...user.keys()]);
  const squares = new Map<Key, SquareResult>();
  let correct = 0;
  for (const key of keys) {
    const t = target.get(key);
    const u = user.get(key);
    if (t && u) {
      if (t.role === u.role && t.color === u.color) {
        squares.set(key, 'correct');
        correct++;
      } else squares.set(key, 'wrong');
    } else squares.set(key, t ? 'missing' : 'extra');
  }
  const total = keys.size;
  const accuracy = total ? correct / total : 0;
  const perfect = total > 0 && correct === total;
  const points = Math.round(accuracy * 10 * fullMoves) * (perfect ? 2 : 1);
  return { accuracy, perfect, points, correct, total, squares };
}
