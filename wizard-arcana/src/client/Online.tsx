import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { GameView, Opts } from '../shared/engine';
import { Game } from './Game';
import { Feedback, MatchOptions, Panel } from './components';
import { playGameUpdate } from './sound';
import { readStorage, writeStorage } from './storage';

interface Room {
  code: string;
  me: number;
  host: number;
  opts: Opts;
  seats: { name: string; connected: boolean }[];
  game: GameView | null;
}
interface Reply { error?: string; code?: string; token?: string }

function saveSeat(code: string | null, token: string | null) {
  writeStorage('session', 'wa:code', code);
  writeStorage('session', 'wa:token', token);
}

export function Online({ back }: { back: () => void }) {
  const socket = useRef<Socket | null>(null);
  const busy = useRef(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [replaced, setReplaced] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState(() => readStorage('local', 'wa:name') ?? '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.slice(0, 6).toUpperCase() ?? '');
  const [error, setError] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');

  useEffect(() => {
    const link = io();
    socket.current = link;
    let previous: GameView | null = null;
    link.on('connect', () => {
      setConnected(true);
      setError('');
      const code = readStorage('session', 'wa:code');
      const token = readStorage('session', 'wa:token');
      if (!code || !token) { setResuming(false); return; }
      setResuming(true);
      link.timeout(7000).emit('resume', { code, token }, (timeout: Error | null, reply: Reply) => {
        if (timeout) setError('Couldn’t restore the seat. Reconnect to try again.');
        else if (reply?.error) {
          saveSeat(null, null);
          setRoom(null);
          setError(reply.error);
        }
        if (timeout && link.connected) {
          link.disconnect();
          link.connect();
          return;
        }
        setResuming(false);
      });
    });
    link.on('disconnect', () => setConnected(false));
    link.on('room', (update: Room) => {
      if (update.game) playGameUpdate(previous, update.game);
      previous = update.game;
      setRoom(update);
      setResuming(false);
    });
    link.on('replaced', () => {
      saveSeat(null, null);
      setRoom(null);
      setReplaced(true);
      link.disconnect();
    });
    return () => { link.removeAllListeners(); link.disconnect(); };
  }, []);

  function request(event: string, payload: object, onSuccess?: (reply: Reply) => void) {
    const link = socket.current;
    if (!link?.connected || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    link.timeout(6000).emit(event, payload, (timeout: Error | null, reply: Reply) => {
      busy.current = false;
      setPending(false);
      if (timeout) setError('The room didn’t respond. Check your connection and try again.');
      else if (reply?.error) setError(reply.error);
      else onSuccess?.(reply);
    });
  }

  function enter(event: 'create' | 'join') {
    writeStorage('local', 'wa:name', name.trim());
    request(event, { name, code: code.trim() }, ({ code, token }) => {
      if (code && token) saveSeat(code, token);
    });
  }

  const ready = connected && !resuming && !pending;
  function returnHomeWithoutSeat() {
    saveSeat(null, null);
    if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
    back();
  }
  const banner = !connected && !replaced && <Feedback>{room ? 'Reconnecting… your seat is reserved.' : 'Connecting to multiplayer…'}</Feedback>;
  if (replaced) return <Panel eyebrow="Online multiplayer" title="Seat opened elsewhere">
    <p className="muted">The other tab now controls this seat.</p>
    <button className="primary" onClick={back}>Return home</button>
  </Panel>;

  if (!room) return <Panel eyebrow="Online multiplayer" title="Play with friends"
    description="Create a private room or enter a six-character invite code.">
    <form className="setup-form" onSubmit={(event) => { event.preventDefault(); if (ready && code.length === 6) enter('join'); }}>
      <label>Your name<input value={name} maxLength={16} autoComplete="nickname" placeholder="Wizard"
        onChange={(event) => setName(event.target.value)} /></label>
      <button className="primary" type="button" disabled={!ready} onClick={() => enter('create')}>Create room <span aria-hidden="true">↗</span></button>
      <label>Room code<input value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="ABC123"
        onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
      <button type="submit" disabled={!ready || code.length !== 6}>Join room</button>
    </form>
    {banner}<Feedback>{error}</Feedback>
  </Panel>;

  const host = room.me === room.host;
  const allReady = room.seats.length >= 3 && room.seats.every((seat) => seat.connected);
  const start = () => request('start', {});
  if (room.game) return <>
    {banner}
    {room.game.phase === 'done' && <Feedback>{error || (!host ? 'The host can start a rematch.' : !allReady ? 'Everyone must be connected for a rematch.' : '')}</Feedback>}
    <Game game={room.game} names={room.seats.map((seat) => seat.name)}
      blocked={!ready} onAction={(type, value) => request('act', { type, value })} error={error}
      onReplay={host && ready && allReady ? start : undefined} />
    {room.game.phase === 'done' && <div className="local-actions">
      <button className="plain" onClick={returnHomeWithoutSeat}>Leave table</button>
    </div>}
  </>;

  const invite = new URL(location.href);
  invite.search = '';
  invite.hash = '';
  invite.searchParams.set('room', room.code);
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite.href);
      setInviteStatus('Invite link copied.');
    } catch { setInviteStatus('Select and copy the invite link below.'); }
  }

  return <Panel eyebrow="Online lobby" title="Your room" description="Share the code or invite link to bring friends to the table.">
    <div className="invite">
      <strong className="room-code">{room.code}</strong>
      <button type="button" onClick={copyInvite}>Copy invite link</button>
      <input aria-label="Invite link" value={invite.href} readOnly onFocus={(event) => event.target.select()} />
      <Feedback>{inviteStatus}</Feedback>
    </div>
    <ul className="lobby-seats">{room.seats.map((seat, i) => <li key={i}>
      <strong>{seat.name} {i === room.me && <small>(you)</small>}</strong>
      <span>{i === room.host ? 'Host · ' : ''}{seat.connected ? 'Connected' : 'Disconnected'}</span>
    </li>)}</ul>
    {host ? <MatchOptions options={room.opts} disabled={!ready} onChange={(options) => request('opts', options)} />
      : <p className="muted">{room.opts.format === 'quick' ? 'Quick' : 'Classic'} match{room.opts.plusMinus ? ' with plus/minus bidding' : ''}. Waiting for the host to start.</p>}
    {host && <button className="primary" disabled={!ready || !allReady} onClick={start}>Start match</button>}
    {host && !allReady && <p className="muted">At least three players must be seated, and everyone must be connected.</p>}
    {banner}<Feedback>{error}</Feedback>
    <button className="plain" disabled={!ready} onClick={() => request('leave', {}, returnHomeWithoutSeat)}>Leave room</button>
  </Panel>;
}
