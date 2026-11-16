import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

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

  inCheck(): boolean {
    return this.chess.inCheck();
  }

  /** Legal moves with the guilt rule applied. */
  legalMoves(square?: Square): Move[] {
    const moves = this.chess.moves({ verbose: true, ...(square ? { square } : {}) }) as Move[];
    return moves.filter((m) => !(this.isCapture(m) && this.tokens.has(m.from)));
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

    const result = this.chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion });

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
      return this.chess.inCheck()
        ? { over: true, reason: 'checkmate', winner: this.chess.turn() === 'w' ? 'b' : 'w' }
        : { over: true, reason: 'stalemate' };
    }
    if (this.chess.isInsufficientMaterial() || this.chess.isThreefoldRepetition() || this.chess.isDrawByFiftyMoves()) {
      return { over: true, reason: 'draw' };
    }
    return { over: false };
  }
}
