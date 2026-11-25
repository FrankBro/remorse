import Peer, { type DataConnection } from 'peerjs';

export type Msg =
  | { t: 'move'; from: string; to: string; promotion?: string }
  | { t: 'resign' }
  | { t: 'new' };

export interface Room {
  conn: DataConnection | null;
  send(m: Msg): void;
}

/** Host creates a room and waits; guest joins by the host's peer id. Peer-to-peer, no server of ours. */
export let onNetError: (msg: string) => void = () => {};
export function setNetErrorHandler(f: (msg: string) => void) { onNetError = f; }

/** PeerJS emits transient 'network' errors (signaling socket hiccups) that don't affect an established P2P link. */
function report(room: Room, type: string) {
  if (room.conn?.open && (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed')) return;
  onNetError(`Connection error: ${type}`);
}

export function host(onId: (id: string) => void, onOpen: () => void, onMsg: (m: Msg) => void, onClose: () => void): Room {
  const peer = new Peer();
  const room: Room = { conn: null, send: (m) => room.conn?.send(m) };
  peer.on('error', (e) => report(room, e.type));
  peer.on('open', onId);
  peer.on('connection', (c) => {
    if (room.conn) return c.close();
    room.conn = c;
    c.on('open', onOpen);
    c.on('data', (d) => onMsg(d as Msg));
    c.on('close', onClose);
  });
  return room;
}

export function join(id: string, onOpen: () => void, onMsg: (m: Msg) => void, onClose: () => void): Room {
  const peer = new Peer();
  const room: Room = { conn: null, send: (m) => room.conn?.send(m) };
  peer.on('error', (e) => report(room, e.type));
  peer.on('open', () => {
    const c = peer.connect(id, { reliable: true });
    room.conn = c;
    c.on('open', onOpen);
    c.on('data', (d) => onMsg(d as Msg));
    c.on('close', onClose);
  });
  return room;
}
