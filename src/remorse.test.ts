import { describe, expect, it } from 'vitest';
import { RemorseGame } from './remorse';

describe('AC1 guilt placement', () => {
  it('places a token on the capturing piece and it follows the piece', () => {
    const g = new RemorseGame('4k3/8/8/3p4/8/8/8/R3K3 w - - 0 1');
    g.move({ from: 'a1', to: 'a5' });
    g.move({ from: 'e8', to: 'e7' });
    expect(g.guiltSquares()).toEqual([]);
    g.move({ from: 'a5', to: 'd5' });
    expect(g.guiltSquares()).toEqual(['d5']);
    g.move({ from: 'e7', to: 'e6' });
    g.move({ from: 'd5', to: 'd1' });
    expect(g.guiltSquares()).toEqual(['d1']);
  });
  it('removes the token of a captured piece', () => {
    const g = new RemorseGame('4k3/8/8/8/3r4/8/8/3RK3 b - - 0 1', ['d4']);
    expect(g.isGuilty('d4')).toBe(true);
    g.move({ from: 'e8', to: 'e7' });
    g.move({ from: 'd1', to: 'd4' });
    expect(g.guiltSquares()).toEqual(['d4']); // new token belongs to the white rook
  });
});

describe('AC2 capture block', () => {
  it('rejects captures by a guilty piece but allows quiet moves', () => {
    const g = new RemorseGame('4k3/8/8/3p1p2/8/8/8/R3K3 w - - 0 1');
    g.move({ from: 'a1', to: 'a5' });
    g.move({ from: 'e8', to: 'e7' });
    g.move({ from: 'a5', to: 'd5' });
    g.move({ from: 'e7', to: 'e6' }); // black king steps next to the rook's line
    const moves = g.legalMoves('d5');
    expect(moves.some((m) => m.to === 'f5')).toBe(false);
    expect(g.move({ from: 'd5', to: 'f5' })).toBeNull();
    expect(moves.some((m) => m.to === 'd1')).toBe(true);
    expect(g.move({ from: 'd5', to: 'd1' })).not.toBeNull();
  });
  it('lets the other side capture normally', () => {
    const g = new RemorseGame('4k3/8/8/3p4/8/8/8/R3K3 w - - 0 1', ['a1']);
    expect(g.legalMoves('a1').some((m) => m.to === 'a8')).toBe(true);
    // A token on White's rook does not stop Black's pawn capturing.
    const h = new RemorseGame('4k3/8/8/8/8/8/3p4/R3K3 b - - 0 1', ['a1']);
    expect(h.legalMoves('d2').some((m) => m.isCapture())).toBe(true);
  });
});

describe('AC3 cleansing', () => {
  const start = (fen: string) => {
    const g = new RemorseGame(fen);
    g.move({ from: 'a4', to: 'd4' }); // rook takes pawn, guilty
    return g;
  };
  it('an orthogonally adjacent friendly bishop cleanses at the end of the owner\'s turn', () => {
    const g = start('4k3/8/8/8/R2p4/1B6/8/4K3 w - - 0 1');
    g.move({ from: 'e8', to: 'e7' });
    expect(g.isGuilty('d4')).toBe(true);
    g.move({ from: 'b3', to: 'c4' }); // c4 is next to d4
    expect(g.isGuilty('d4')).toBe(false);
  });
  it('a diagonal friendly bishop does not cleanse', () => {
    const g = start('4k3/8/8/8/R2p4/2B5/8/4K3 w - - 0 1');
    g.move({ from: 'e8', to: 'e7' });
    g.move({ from: 'e1', to: 'e2' });
    expect(g.isGuilty('d4')).toBe(true);
  });
  it('an enemy bishop does not cleanse', () => {
    const g = start('4k3/8/6b1/8/R2p4/8/8/4K3 w - - 0 1');
    g.move({ from: 'g6', to: 'e4' });
    g.move({ from: 'e1', to: 'e2' });
    expect(g.isGuilty('d4')).toBe(true);
  });
  it('a bishop adjacent when the capture happens does not cleanse that same turn', () => {
    const g = new RemorseGame('4k3/8/8/8/R2pB3/8/8/4K3 w - - 0 1');
    g.move({ from: 'a4', to: 'd4' });
    expect(g.isGuilty('d4')).toBe(true);
  });
  it('a bishop adjacent at the end of a later turn cleanses', () => {
    const g = new RemorseGame('4k3/8/8/8/R2pB3/8/8/4K3 w - - 0 1');
    g.move({ from: 'a4', to: 'd4' });
    g.move({ from: 'e8', to: 'e7' });
    g.move({ from: 'e1', to: 'e2' });
    expect(g.isGuilty('d4')).toBe(false);
  });
});

describe('AC4 bishop self-cleanse', () => {
  it('a capturing bishop is guilty for one turn then cleared', () => {
    const g = new RemorseGame('k7/8/4p3/5p2/8/1B6/8/4K3 w - - 0 1');
    g.move({ from: 'b3', to: 'e6' });
    expect(g.isGuilty('e6')).toBe(true);
    g.move({ from: 'a8', to: 'a7' });
    expect(g.move({ from: 'e6', to: 'f5' })).toBeNull(); // still guilty on its next turn
    g.move({ from: 'e1', to: 'e2' });
    expect(g.isGuilty('e6')).toBe(false);
    g.move({ from: 'a7', to: 'a8' });
    expect(g.move({ from: 'e6', to: 'f5' })).not.toBeNull();
  });
});

describe('AC5 standard chess still works', () => {
  it('castles, with a guilty rook token travelling', () => {
    const g = new RemorseGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['h1']);
    expect(g.move({ from: 'e1', to: 'g1' })).not.toBeNull();
    expect(g.isGuilty('f1')).toBe(true);
    expect(g.isGuilty('h1')).toBe(false);
  });
  it('promotes, defaulting to a queen', () => {
    const g = new RemorseGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const m = g.move({ from: 'a7', to: 'a8' });
    expect(m?.promotion).toBe('q');
    const h = new RemorseGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(h.move({ from: 'a7', to: 'a8', promotion: 'n' })?.promotion).toBe('n');
  });
  it('en passant counts as a capture and makes the pawn guilty', () => {
    const g = new RemorseGame('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1');
    const m = g.move({ from: 'd4', to: 'e3' });
    expect(m?.isEnPassant()).toBe(true);
    expect(g.isGuilty('e3')).toBe(true);
  });
  it('detects checkmate (fool\'s mate)', () => {
    const g = new RemorseGame();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']] as const) {
      expect(g.move({ from, to })).not.toBeNull();
    }
    expect(g.status()).toEqual({ over: true, reason: 'checkmate', winner: 'b' });
  });
  it('rejects illegal moves', () => {
    const g = new RemorseGame();
    expect(g.move({ from: 'e2', to: 'e5' })).toBeNull();
  });
  it('guilt can cause stalemate that plain chess would not', () => {
    const plain = new RemorseGame('kN6/2R5/2K5/8/8/8/8/8 b - - 0 1');
    expect(plain.status()).toEqual({ over: false });
    const guilty = new RemorseGame('kN6/2R5/2K5/8/8/8/8/8 b - - 0 1', ['a8']);
    expect(guilty.status()).toEqual({ over: true, reason: 'stalemate' });
  });
});
