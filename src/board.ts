import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Color, Key, MouchEvent, Piece, Pieces, Role, SquareClasses } from 'chessground/types';
import type { SquareResult } from './scoring';

const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

/** What a click on a board square does while a palette tool is active. */
type Tool = { kind: 'piece'; piece: Piece } | { kind: 'erase' };

const RESULT_CLASSES: Record<SquareResult, string> = {
  correct: 'res-correct',
  wrong: 'res-wrong',
  missing: 'res-missing',
  extra: 'res-extra',
};

function eventPos(e: MouchEvent): [number, number] | undefined {
  if (e.clientX !== undefined && e.clientY !== undefined) return [e.clientX, e.clientY];
  const t = e.targetTouches?.[0];
  return t ? [t.clientX, t.clientY] : undefined;
}

/**
 * A free-placement board: pieces are added from spare-piece palettes (drag or
 * click-to-place), moved freely, and removed by dragging them off the board,
 * right-clicking them, or using the eraser.
 */
export class EditorBoard {
  private cg: Api;
  private tool: Tool | undefined;
  private locked = false;
  private paletteButtons: { el: HTMLElement; tool: Tool }[] = [];

  constructor(
    private boardEl: HTMLElement,
    paletteEls: Record<Color, HTMLElement>,
  ) {
    this.cg = Chessground(boardEl, {
      fen: '8/8/8/8/8/8/8/8',
      orientation: 'white',
      coordinates: true,
      autoCastle: false,
      disableContextMenu: true,
      highlight: { lastMove: false, check: false },
      animation: { enabled: true, duration: 150 },
      movable: { free: true, color: 'both', showDests: false },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true, deleteOnDropOff: true },
      drawable: { enabled: false },
    });

    // Capture phase runs before chessground's own handlers on the inner board,
    // so we can take over clicks while a palette tool is active or the board is locked.
    const intercept = (e: Event) => this.onBoardPointer(e as MouchEvent);
    boardEl.addEventListener('mousedown', intercept, { capture: true, passive: false });
    boardEl.addEventListener('touchstart', intercept, { capture: true, passive: false });

    for (const color of ['white', 'black'] as Color[]) this.buildPalette(paletteEls[color], color);
  }

  private buildPalette(container: HTMLElement, color: Color): void {
    container.classList.add('cg-wrap');
    for (const role of ROLES) {
      const piece: Piece = { role, color };
      const btn = document.createElement('div');
      btn.className = 'palette-slot';
      btn.title = `${color} ${role}`;
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', `${color} ${role}`);
      btn.innerHTML = `<piece class="${role} ${color}"></piece>`;
      let touchStart: [number, number] | undefined;
      const start = (e: Event) => {
        if (this.locked) return;
        e.preventDefault();
        touchStart = eventPos(e as MouchEvent);
        // Dragging always works; a click without movement just selects the tool (see 'click').
        this.cg.dragNewPiece(piece, e as MouchEvent, true);
      };
      btn.addEventListener('mousedown', start);
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('click', () => this.toggleTool({ kind: 'piece', piece }));
      // Touch devices fire no click after a prevented touchstart, so detect taps by hand.
      btn.addEventListener('touchend', e => {
        const t = e.changedTouches[0];
        if (!touchStart || !t) return;
        const moved = Math.hypot(t.clientX - touchStart[0], t.clientY - touchStart[1]);
        touchStart = undefined;
        if (moved < 10) this.toggleTool({ kind: 'piece', piece });
      });
      container.appendChild(btn);
      this.paletteButtons.push({ el: btn, tool: { kind: 'piece', piece } });
    }
  }

  /** Register an external element (the eraser button) as a palette tool. */
  addEraser(el: HTMLElement): void {
    const tool: Tool = { kind: 'erase' };
    el.addEventListener('click', () => this.toggleTool(tool));
    this.paletteButtons.push({ el, tool });
  }

  private sameTool(a: Tool | undefined, b: Tool): boolean {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === 'erase' || b.kind === 'erase') return true;
    return a.piece.role === b.piece.role && a.piece.color === b.piece.color;
  }

  private toggleTool(tool: Tool): void {
    if (this.locked) return;
    this.tool = this.sameTool(this.tool, tool) ? undefined : tool;
    this.cg.selectSquare(null);
    this.boardEl.classList.toggle('placing', !!this.tool);
    for (const b of this.paletteButtons) b.el.classList.toggle('active', this.sameTool(this.tool, b.tool));
  }

  private onBoardPointer(e: MouchEvent): void {
    const block = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (this.locked) return block();

    const rightClick = e.button === 2;
    if (!rightClick && !this.tool) return; // let chessground handle moving pieces

    const pos = eventPos(e);
    const key = pos && this.cg.getKeyAtDomPos(pos);
    block();
    if (!key) return;

    const current = this.cg.state.pieces.get(key);
    if (rightClick || this.tool?.kind === 'erase') {
      if (current) this.setPiece(key, undefined);
    } else if (this.tool?.kind === 'piece') {
      const p = this.tool.piece;
      const same = current && current.role === p.role && current.color === p.color;
      this.setPiece(key, same ? undefined : p);
    }
  }

  private setPiece(key: Key, piece: Piece | undefined): void {
    this.cg.setPieces(new Map([[key, piece]]));
  }

  getPieces(): Pieces {
    return new Map(this.cg.state.pieces);
  }

  clear(): void {
    this.cg.set({ fen: '8/8/8/8/8/8/8/8' });
  }

  /** Reset to an empty, editable board for a new puzzle. */
  reset(): void {
    this.locked = false;
    this.boardEl.classList.remove('locked');
    if (this.tool) this.toggleTool(this.tool);
    this.cg.set({ highlight: { custom: new Map() } });
    this.clear();
  }

  /** Lock editing and mark each square with its scoring result. */
  showResult(squares: Map<Key, SquareResult>): void {
    if (this.tool) this.toggleTool(this.tool);
    this.locked = true;
    this.boardEl.classList.add('locked');
    this.cg.selectSquare(null);
    const custom: SquareClasses = new Map();
    for (const [key, res] of squares) custom.set(key, RESULT_CLASSES[res]);
    this.cg.set({ highlight: { custom } });
  }

  /** Display a given placement (used to flip between the user's answer and the solution). */
  showPieces(pieces: Pieces): void {
    const diff = new Map<Key, Piece | undefined>();
    for (const key of this.cg.state.pieces.keys()) diff.set(key, undefined);
    for (const [key, piece] of pieces) diff.set(key, piece);
    this.cg.setPieces(diff);
  }
}
