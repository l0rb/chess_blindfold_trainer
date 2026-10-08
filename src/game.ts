import { Chess } from 'chess.js';
import type { Key, Piece, Pieces, Role } from 'chessground/types';

const ROLES: Record<string, Role> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export interface Puzzle {
  /** SAN moves the user has to play through in their head. */
  moves: string[];
  /** Piece placement after those moves. */
  target: Pieces;
  fen: string;
}

/** Replay the first `fullMoves` moves (2 plies each) of a game. */
export function buildPuzzle(allMoves: string[], fullMoves: number): Puzzle {
  const moves = allMoves.slice(0, fullMoves * 2);
  const chess = new Chess();
  for (const san of moves) chess.move(san);

  const target: Pieces = new Map();
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const piece: Piece = { role: ROLES[sq.type], color: sq.color === 'w' ? 'white' : 'black' };
      target.set(sq.square as Key, piece);
    }
  }
  return { moves, target, fen: chess.fen() };
}

/** Group SAN moves into numbered pairs: [[1, 'e4', 'e5'], [2, 'Nf3', undefined]]. */
export function movePairs(moves: string[]): [number, string, string | undefined][] {
  const pairs: [number, string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([i / 2 + 1, moves[i], moves[i + 1]]);
  return pairs;
}
