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
let captured: Record<Color, PieceSymbol[]> = { w: [], b: [] }; // pieces taken BY each color
const VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

function renderTaken() {
  const mine = me ?? 'w';
  const theirs: Color = mine === 'w' ? 'b' : 'w';
  const fill = (el: HTMLElement, by: Color) => {
    const victim: Color = by === 'w' ? 'b' : 'w';
    const list = [...captured[by]].sort((a, b) => VALUE[b] - VALUE[a]);
    el.innerHTML = '';
    for (const t of list) {
      const i = document.createElement('span');
      i.className = 'cap';
      i.style.backgroundImage = `url("${pieceUrl(victim, t)}")`;
      el.appendChild(i);
    }
    const adv = captured[by].reduce((n, t) => n + VALUE[t], 0) - captured[victim].reduce((n, t) => n + VALUE[t], 0);
    if (adv > 0) { const a = document.createElement('b'); a.textContent = `+${adv}`; el.appendChild(a); }
  };
  fill($('taken-top'), theirs);
  fill($('taken-bottom'), mine);
}

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
  renderTaken();
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
  if (suppressClick) return;
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

let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* no audio */ }
}
function beep(capture: boolean) {
  if (!audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = capture ? 'square' : 'triangle';
  o.frequency.setValueAtTime(capture ? 220 : 520, t);
  o.frequency.exponentialRampToValueAtTime(capture ? 110 : 300, t + 0.08);
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + 0.13);
}
document.addEventListener('pointerdown', unlockAudio, { capture: true });

// Drag and drop (pointer events: mouse + touch)
let drag: { from: Square; ghost: HTMLElement; moved: boolean; x: number; y: number } | null = null;
const squareAt = (x: number, y: number) =>
  (document.elementFromPoint(x, y)?.closest('.sq') as HTMLElement | null)?.dataset.square as Square | undefined;
function moveGhost(e: PointerEvent) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
  drag.moved = true;
  const size = boardEl.getBoundingClientRect().width / 8;
  Object.assign(drag.ghost.style, { display: 'block', width: size + 'px', height: size + 'px', left: e.clientX - size / 2 + 'px', top: e.clientY - size / 2 + 'px' });
}
boardEl.addEventListener('pointerdown', (e) => {
  if (!me || over || game.turn() !== me || e.button !== 0) return;
  const sq = (e.target as HTMLElement).closest('.sq')?.getAttribute('data-square') as Square | null;
  const piece = sq && game.board().flat().find((p) => p && p.square === sq);
  if (!sq || !piece || piece.color !== me || !game.legalMoves(sq).length) return;
  e.preventDefault();
  selected = sq;
  render();
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.style.backgroundImage = `url("${pieceUrl(piece.color, piece.type)}")`;
  ghost.style.display = 'none';
  document.body.appendChild(ghost);
  boardEl.querySelector(`[data-square="${sq}"]`)?.classList.add('dragging');
  drag = { from: sq, ghost, moved: false, x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', moveGhost);
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const { from, ghost, moved } = drag;
  drag = null;
  ghost.remove();
  if (!moved) { boardEl.querySelector('.dragging')?.classList.remove('dragging'); return; }
  const to = squareAt(e.clientX, e.clientY);
  const mv = to && game.legalMoves(from).find((m) => m.to === to);
  if (mv) play({ from, to: to!, promotion: mv.promotion ? 'q' : undefined });
  else { selected = null; render(); }
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
});
window.addEventListener('pointercancel', () => { drag?.ghost.remove(); drag = null; selected = null; render(); });
let suppressClick = false;

function play(m: { from: Square; to: Square; promotion?: string }, remote = false) {
  const res = game.move({ from: m.from, to: m.to, promotion: m.promotion as PieceSymbol | undefined });
  if (!res) return;
  beep(res.isCapture());
  if (res.captured) captured[res.color].push(res.captured);
  last = [m.from, m.to];
  selected = null;
  if (!remote) room?.send({ t: 'move', ...m });
  render();
}

function reset() {
  game = new RemorseGame();
  captured = { w: [], b: [] };
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
