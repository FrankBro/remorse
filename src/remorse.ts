import { Chess, Move, type Color, type PieceSymbol, type Square } from 'chess.js';

export interface Token {
  /** Placed during the current move; cannot be cleansed in the same turn. */
  fresh: boolean;
  /** Placed by a capturing bishop: removed at the end of its owner's next turn. */
  selfCleanse: boolean;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export type Status =
  | { over: false }
  | { over: true; reason: 'checkmate'; winner: Color }
  | { over: true; reason: 'stalemate' | 'draw' };

const FILES = 'abcdefgh';

function orthogonalNeighbours(sq: Square): Square[] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  const out: Square[] = [];
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nf = f + df;
    const nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push((FILES[nf] + nr) as Square);
  }
  return out;
}

/**
 * Chess with the Remorse twist, layered on chess.js:
 * - a piece that captures gets a guilt token and cannot capture while it has one;
 * - at the end of its owner's turn, a guilty piece loses its token if a friendly bishop
 *   is orthogonally adjacent (a token placed that same turn is not cleansed that turn);
 * - a bishop's own capture token disappears at the end of its owner's next turn.
 */
export class RemorseGame {
  private chess: Chess;
  private tokens = new Map<Square, Token>();

  /** `guilty` pre-places tokens (for loading positions and tests). */
  constructor(fen?: string, guilty: Square[] = []) {
    this.chess = fen ? new Chess(fen) : new Chess();
    for (const sq of guilty) this.tokens.set(sq, { fresh: false, selfCleanse: false });
  }

  turn(): Color {
    return this.chess.turn();
  }

  fen(): string {
    return this.chess.fen();
  }

  board() {
    return this.chess.board();
  }

  isGuilty(sq: Square): boolean {
    return this.tokens.has(sq);
  }

  guiltSquares(): Square[] {
    return [...this.tokens.keys()];
  }

  /** A guilty piece cannot capture, so it does not give check. */
  private kingAttacked(color: Color): boolean {
    const king = this.chess.board().flat().find((p) => p && p.type === 'k' && p.color === color);
    if (!king) return false;
    const them: Color = color === 'w' ? 'b' : 'w';
    return this.chess.attackers(king.square, them).some((sq) => !this.tokens.has(sq));
  }

  inCheck(): boolean {
    return this.kingAttacked(this.chess.turn());
  }

  /**
   * Internal chess.js moves that are legal under Remorse rules: pseudo-legal moves that leave the
   * mover's king safe from non-guilty attackers, minus captures by guilty pieces.
   * Uses chess.js private move generation because the public API only offers standard legality.
   */
  private remorseMoves(square?: Square): any[] {
    const c = this.chess as any;
    const us = this.chess.turn();
    const out: any[] = [];
    for (const im of c._moves({ legal: false, ...(square ? { square } : {}) })) {
      const from = im.from !== undefined ? this.sq(im.from) : undefined;
      const isCap = !!im.captured || !!(im.flags & 16); // 16 = en passant
      if (isCap && from && this.tokens.has(from)) continue;
      c._makeMove(im);
      const ok = !this.kingAttacked(us);
      c._undoMove();
      if (ok) out.push(im);
    }
    return out;
  }

  private sq(x88: number): Square {
    return (FILES[x88 & 7] + (8 - (x88 >> 4))) as Square;
  }

  /** Legal moves with the guilt rule applied. */
  legalMoves(square?: Square): Move[] {
    const c = this.chess as any;
    return this.remorseMoves(square).map((im) => new Move(c, im));
  }

  private isCapture(m: Move): boolean {
    return m.isCapture() || m.isEnPassant();
  }

  /** Plays a move. Returns the move, or null if it is illegal (including guilt-blocked captures). */
  move(input: MoveInput): Move | null {
    const legal = this.legalMoves(input.from).find(
      (m) => m.to === input.to && (m.promotion ?? undefined) === (input.promotion ?? (m.promotion ? 'q' : undefined)),
    );
    if (!legal) return null;
    const mover = legal.color;
    const capture = this.isCapture(legal);

    const guilty = this.tokens.get(legal.from);
    this.tokens.delete(legal.from);

    const c = this.chess as any;
    const internal = this.remorseMoves(legal.from).find(
      (im) => this.sq(im.to) === legal.to && im.promotion === legal.promotion,
    );
    const result = new Move(c, internal);
    c._makeMove(internal);
    c._incPositionCount();

    // The captured piece's own token (if any) disappears with it.
    if (capture) {
      const victim = (result.isEnPassant() ? `${legal.to[0]}${legal.from[1]}` : legal.to) as Square;
      this.tokens.delete(victim);
    }
    // Castling: the rook's token moves with it.
    if (result.isKingsideCastle() || result.isQueensideCastle()) {
      const rank = legal.from[1];
      const [rf, rt] = result.isKingsideCastle() ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
      const t = this.tokens.get(rf as Square);
      if (t) {
        this.tokens.delete(rf as Square);
        this.tokens.set(rt as Square, t);
      }
    }
    if (guilty) this.tokens.set(legal.to, guilty);

    // End of the mover's turn: cleanse older tokens belonging to the mover.
    for (const [sq, token] of [...this.tokens]) {
      if (token.fresh) continue;
      const piece = this.chess.get(sq);
      if (!piece || piece.color !== mover) continue;
      const bishopNearby = orthogonalNeighbours(sq).some((n) => {
        const p = this.chess.get(n);
        return p && p.type === 'b' && p.color === mover;
      });
      if (bishopNearby || token.selfCleanse) this.tokens.delete(sq);
    }
    for (const t of this.tokens.values()) t.fresh = false;

    if (capture) {
      const landed = this.chess.get(legal.to);
      this.tokens.set(legal.to, { fresh: true, selfCleanse: landed?.type === 'b' });
    }
    return result;
  }

  status(): Status {
    if (this.legalMoves().length === 0) {
      return this.inCheck()
        ? { over: true, reason: 'checkmate', winner: this.chess.turn() === 'w' ? 'b' : 'w' }
        : { over: true, reason: 'stalemate' };
    }
    if (this.chess.isInsufficientMaterial() || this.chess.isThreefoldRepetition() || this.chess.isDrawByFiftyMoves()) {
      return { over: true, reason: 'draw' };
    }
    return { over: false };
  }
}
