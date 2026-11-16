import type { Color, PieceSymbol, Square } from 'chess.js';
import { RemorseGame } from './remorse';
import { host, join, setNetErrorHandler, type Msg, type Room } from './net';

const PIECE_URLS = import.meta.glob('./pieces/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const pieceUrl = (color: string, type: string) => PIECE_URLS[`./pieces/${color}${type.toUpperCase()}.svg`];
const FILES = 'abcdefgh';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $('board');
const statusEl = $('status');

let game = new RemorseGame();
let me: Color | null = null; // null until connected
let room: Room | null = null;
let selected: Square | null = null;
let last: [Square, Square] | null = null;
let message = '';
let over = false;

function render() {
  const flip = me === 'b';
  const rows = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const board = game.board();
  const targets = new Set(selected ? game.legalMoves(selected).map((m) => m.to) : []);
  boardEl.innerHTML = '';
  for (const r of rows) {
    for (const c of cols) {
      const sq = (FILES[c] + (8 - r)) as Square;
      const piece = board[r][c];
      const el = document.createElement('div');
      el.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      el.dataset.square = sq;
      if (sq === selected) el.classList.add('selected');
      if (targets.has(sq)) el.classList.add('target');
      if (last && (last[0] === sq || last[1] === sq)) el.classList.add('last');
      if (piece) {
        const p = document.createElement('span');
        p.className = 'piece ' + piece.color;
        p.style.backgroundImage = `url("${pieceUrl(piece.color, piece.type)}")`;
        el.appendChild(p);
      }
      if (game.isGuilty(sq)) {
        el.classList.add('guilty');
        el.title = 'Guilty: cannot capture';
        const t = document.createElement('span');
        t.className = 'token';
        t.textContent = '⛓';
        el.appendChild(t);
      }
      if (c === cols[0]) {
        const n = document.createElement('i');
        n.className = 'coord rank';
        n.textContent = String(8 - r);
        el.appendChild(n);
      }
      if (r === rows[7]) {
        const n = document.createElement('i');
        n.className = 'coord file';
        n.textContent = FILES[c];
        el.appendChild(n);
      }
      el.onclick = () => onSquare(sq);
      boardEl.appendChild(el);
    }
  }
  const st = game.status();
  if (message) statusEl.textContent = message;
  else if (!me) statusEl.textContent = 'Create a room, or open a friend\'s link.';
  else if (st.over) statusEl.textContent = st.reason === 'checkmate' ? `Checkmate. ${st.winner === me ? 'You win!' : 'You lose.'}` : `Game over: ${st.reason}.`;
  else statusEl.textContent = `${game.turn() === me ? 'Your turn' : "Opponent's turn"} (you are ${me === 'w' ? 'White' : 'Black'})${game.inCheck() ? ' — check!' : ''}`;
  over = st.over || message.startsWith('Resigned') || message.includes('resigned');
  $('resign').hidden = !me || over;
  $('again').hidden = !me || !over;
}

function onSquare(sq: Square) {
  if (!me || over || game.turn() !== me) return;
  if (selected) {
    const moves = game.legalMoves(selected).filter((m) => m.to === sq);
    if (moves.length) {
      play({ from: selected, to: sq, promotion: moves[0].promotion ? 'q' : undefined });
      return;
    }
  }
  const piece = game.board().flat().find((p) => p && p.square === sq);
  selected = piece && piece.color === me && game.legalMoves(sq).length ? sq : null;
  render();
}

function play(m: { from: Square; to: Square; promotion?: string }, remote = false) {
  const res = game.move({ from: m.from, to: m.to, promotion: m.promotion as PieceSymbol | undefined });
  if (!res) return;
  last = [m.from, m.to];
  selected = null;
  if (!remote) room?.send({ t: 'move', ...m });
  render();
}

function reset() {
  game = new RemorseGame();
  selected = null;
  last = null;
  message = '';
  render();
}

function onMsg(m: Msg) {
  if (m.t === 'move') play({ from: m.from as Square, to: m.to as Square, promotion: m.promotion }, true);
  else if (m.t === 'resign') { message = 'Opponent resigned. You win!'; render(); }
  else if (m.t === 'new') reset();
}

function connected(color: Color) {
  me = color;
  reset();
}
const onClose = () => { message = 'Opponent disconnected.'; render(); };

$('create').onclick = () => {
  statusEl.textContent = 'Creating room…';
  room = host(
    (id) => {
      const url = `${location.origin}${location.pathname}?room=${id}`;
      ($('link') as HTMLInputElement).value = url;
      $('invite').hidden = false;
      statusEl.textContent = 'Waiting for your friend to open the link…';
    },
    () => { $('invite').hidden = true; connected('w'); },
    onMsg,
    onClose,
  );
  $('create').hidden = true;
};
$('copy').onclick = () => navigator.clipboard?.writeText(($('link') as HTMLInputElement).value);
$('resign').onclick = () => { room?.send({ t: 'resign' }); message = 'You resigned.'; render(); };
$('again').onclick = () => { room?.send({ t: 'new' }); reset(); };

setNetErrorHandler((msg) => { message = msg; render(); });

const roomId = new URLSearchParams(location.search).get('room');
if (roomId) {
  $('create').hidden = true;
  message = 'Joining room…';
  room = join(roomId, () => connected('b'), onMsg, onClose);
}
render();
