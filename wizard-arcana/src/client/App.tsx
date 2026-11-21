import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import * as E from '../shared/engine';

const COL = ['#3b82f6', '#22c55e', '#ef4444', '#eab308'];
const GLYPH = ['◆', '♣', '♥', '★'];

// PLACEHOLDER ART: procedural card faces. Drop illustrated assets in /public/cards and swap here.
function Card({ id, sel, dis, onClick, sm }: any) {
  const k = E.kind(id), s = E.suitOf(id), v = E.val(id);
  const c = k === 'n' ? COL[s!] : k === 'w' ? '#a855f7' : '#94a3b8';
  const label = k === 'n' ? v : k === 'w' ? 'W' : 'J';
  return (
    <button className={`card ${sel ? 'sel' : ''} ${dis ? 'dis' : ''} ${sm ? 'sm' : ''}`} onClick={onClick}
      style={{ ['--c' as any]: c }} aria-label={E.cardName(id)}>
      <span className="cn tl">{label}</span>
      <span className="art">{k === 'n' ? GLYPH[s!] : k === 'w' ? '✦' : '☾'}</span>
      <span className="cn br">{label}</span>
    </button>
  );
}

function Game({ v, names, act, err }: { v: any; names: string[]; act: (t: string, x: number) => void; err?: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const [bid, setBid] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setSel(null); setBid(null); setMsg(''); }, [v.turn, v.phase, v.trickNo, v.round]);
  const mine = v.turn === v.me;

  if (v.phase === 'done') {
    const top = Math.max(...v.scores);
    return (
      <div className="panel">
        <h2>Final Standings</h2>
        {v.scores.map((s: number, i: number) => ({ s, i })).sort((a: any, b: any) => b.s - a.s).map(({ s, i }: any) => (
          <div key={i} className={`row ${s === top ? 'win' : ''}`}>{s === top ? '👑 ' : ''}{names[i]}<b>{s}</b></div>
        ))}
        <h3>History</h3>
        <div className="hist">{v.history.map((h: any) => (
          <div key={h.round} className="hrow"><b>R{h.round}</b> {h.bids.map((b: number, i: number) => `${names[i][0]}:${b}/${h.won[i]} (${h.pts[i]})`).join('  ')}</div>
        ))}</div>
      </div>
    );
  }
  const done = v.bids.filter((b: any) => b !== null);
  const forbidden = v.opts.plusMinus && done.length === v.n - 1 ? v.round - done.reduce((a: number, b: number) => a + b, 0) : -1;
  const shown = v.plays.length ? v.plays : v.lastTrick?.plays || [];
  const status = v.phase === 'trump' ? `${names[v.turn]} chooses trump` : v.phase === 'bid' ? `${names[v.turn]} is predicting` : `${names[v.turn]} to play`;

  const tap = (c: number) => {
    if (v.phase !== 'play' || !mine) return;
    const e = E.playError(v.hand, v.plays, c);
    if (e) return setMsg(e);
    if (sel === c) act('play', c); else setSel(c);
  };
  return (
    <div className="table">
      <div className="top">
        <span>Round {v.round}/{v.rounds} · Trick {Math.min(v.trickNo + 1, v.round)}</span>
        <span className="trump">Trump: {v.trump === null ? 'None' : E.SUITS[v.trump]}{v.trumpCard !== null && <Card id={v.trumpCard} sm />}</span>
      </div>
      <div className="players">{names.map((n, i) => (
        <div key={i} className={`pl ${v.turn === i ? 'act' : ''} ${v.me === i ? 'me' : ''}`}>
          <b>{n}{v.dealer === i ? ' (D)' : ''}</b>
          <span>Bid {v.bids[i] ?? '–'} · Won {v.won[i]}</span><span>{v.scores[i]} pts</span>
        </div>))}
      </div>
      <div className="center">
        {shown.map((x: any) => <div key={x.p} className={`pc ${v.lastTrick && !v.plays.length && v.lastTrick.winner === x.p ? 'winner' : ''}`}><small>{names[x.p]}</small><Card id={x.c} sm /></div>)}
        {!shown.length && <i>Table is empty</i>}
      </div>
      <div className="status">{status}{mine ? ' — that is you!' : ''}</div>
      {(msg || err) && <div className="err">{msg || err}</div>}
      {mine && v.phase === 'trump' && <div className="bids">{E.SUITS.map((s, i) => <button key={i} style={{ background: COL[i] }} onClick={() => act('trump', i)}>{s}</button>)}</div>}
      {mine && v.phase === 'bid' && (<>
        <div className="bids">{Array.from({ length: v.round + 1 }, (_, b) => (
          <button key={b} className={bid === b ? 'on' : ''} disabled={b === forbidden} onClick={() => setBid(b)}>{b}</button>))}</div>
        <button className="gold" disabled={bid === null} onClick={() => act('bid', bid!)}>Confirm prediction{bid !== null ? `: ${bid}` : ''}</button>
      </>)}
      <div className="hand">{v.hand.map((c: number) => (
        <Card key={c} id={c} sel={sel === c} dis={v.phase === 'play' && mine && !!E.playError(v.hand, v.plays, c)} onClick={() => tap(c)} />))}</div>
      {mine && v.phase === 'play' && <button className="gold" disabled={sel === null} onClick={() => sel !== null && act('play', sel)}>Play card</button>}
    </div>
  );
}

const sget = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sset = (k: string, v: string | null) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} };

function Online({ back }: { back: () => void }) {
  const sock = useRef<Socket>();
  const [room, setRoom] = useState<any>(null);
  const [up, setUp] = useState(true);
  const [name, setName] = useState(localStorage.getItem('wa:name') || '');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [err, setErr] = useState('');
  useEffect(() => {
    const s = io(); sock.current = s;
    const resume = () => { // each TAB keeps its own identity in sessionStorage -> tabs never replace each other
      const c = sget('wa:code'), t = sget('wa:token');
      if (c && t) s.emit('resume', { code: c, token: t }, (r: any) => { if (r?.error) { sset('wa:code', null); sset('wa:token', null); setRoom(null); } });
    };
    s.on('connect', () => { setUp(true); resume(); });
    s.on('disconnect', () => setUp(false));
    s.on('room', setRoom); s.on('reindex', resume);
    s.on('replaced', () => { setErr('Opened elsewhere.'); s.close(); });
    return () => { s.close(); };
  }, []);
  const enter = (ev: 'create' | 'join') => {
    localStorage.setItem('wa:name', name);
    sock.current!.emit(ev, { name, code }, (r: any) => { if (r.error) return setErr(r.error); sset('wa:code', r.code); sset('wa:token', r.token); });
  };
  const act = (type: string, value: number) => sock.current!.emit('act', { type, value }, (r: any) => setErr(r?.error || ''));
  const banner = !up && <div className="err">Reconnecting… your seat is safe.</div>;
  if (!room) return (
    <div className="panel">{banner}<h2>Online</h2>
      <input placeholder="Your name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
      <button className="gold" onClick={() => enter('create')}>Create room</button>
      <input placeholder="Room code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <button onClick={() => enter('join')}>Join room</button>{err && <div className="err">{err}</div>}
      <button className="link" onClick={back}>Back</button></div>);
  const names = room.seats.map((s: any) => s.name);
  if (room.game) return <>{banner}<Game v={room.game} names={names} act={act} err={err} /></>;
  const link = `${location.origin}/?room=${room.code}`;
  return (
    <div className="panel">{banner}<h2>Room <span className="code">{room.code}</span></h2>
      <button onClick={() => navigator.share ? navigator.share({ url: link }) : navigator.clipboard.writeText(link)}>Share invite link</button>
      {room.seats.map((s: any, i: number) => <div key={i} className="row">{s.name}{i === room.host ? ' ★host' : ''}<b>{s.connected ? 'online' : 'offline'}</b></div>)}
      {room.me === room.host && <>
        <label><input type="checkbox" checked={room.opts.plusMinus} onChange={(e) => sock.current!.emit('opts', { plusMinus: e.target.checked })} /> Plus/minus one variant</label>
        <button className="gold" disabled={room.seats.length < 3} onClick={() => sock.current!.emit('start', {}, (r: any) => setErr(r?.error || ''))}>Start game</button></>}
      {err && <div className="err">{err}</div>}
    </div>);
}

function Offline({ back }: { back: () => void }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('wa:off') || 'null'); } catch { return null; } })();
  const [g, setG] = useState<{ s: E.State; names: string[] } | null>(saved);
  const [names, setNames] = useState(['', '', '']);
  const [plusMinus, setPM] = useState(false);
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (g) localStorage.setItem('wa:off', JSON.stringify(g)); }, [g]);
  if (!g) return (
    <div className="panel"><h2>Pass &amp; Play</h2>
      <div className="bids">{[3, 4, 5, 6].map((n) => <button key={n} className={names.length === n ? 'on' : ''} onClick={() => setNames(Array.from({ length: n }, (_, i) => names[i] || ''))}>{n}</button>)}</div>
      {names.map((n, i) => <input key={i} placeholder={`Player ${i + 1}`} value={n} maxLength={16} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />)}
      <label><input type="checkbox" checked={plusMinus} onChange={(e) => setPM(e.target.checked)} /> Plus/minus one variant</label>
      <button className="gold" onClick={() => setG({ s: E.newGame(names.length, { plusMinus }), names: names.map((n, i) => n.trim() || `Player ${i + 1}`) })}>Start</button>
      <button className="link" onClick={back}>Back</button></div>);
  const { s, names: nm } = g;
  if (s.phase === 'done') return <><Game v={E.view(s, 0)} names={nm} act={() => {}} /><button onClick={() => { localStorage.removeItem('wa:off'); setG(null); }}>New game</button></>;
  if (!shown) return (
    <div className="panel handoff"><h2>Pass the device to</h2><div className="code">{nm[s.turn]}</div>
      <button className="gold" onClick={() => setShown(true)}>I am {nm[s.turn]} — show my cards</button>
      <button className="link" onClick={() => { localStorage.removeItem('wa:off'); setG(null); }}>Abandon game</button></div>);
  const act = (t: string, x: number) => {
    const c = structuredClone(s); const e = E.act(c, s.turn, t, x);
    if (e) return setErr(e); setErr(''); setG({ s: c, names: nm }); setShown(false);
  };
  return <Game v={E.view(s, s.turn)} names={nm} act={act} err={err} />;
}

export default function App() {
  const [mode, setMode] = useState<'home' | 'online' | 'offline'>(sget('wa:code') || new URLSearchParams(location.search).get('room') ? 'online' : localStorage.getItem('wa:off') ? 'offline' : 'home');
  return (
    <div className="app">
      <h1>Wizard Arcana</h1>
      {mode === 'home' && <div className="panel">
        <button className="gold" onClick={() => setMode('online')}>Online multiplayer</button>
        <button onClick={() => setMode('offline')}>Offline pass &amp; play</button>
        <details><summary>How to play</summary>
          <p>Predict how many tricks you'll win, then play. Follow the led colour if you can. Wizards and Jesters can always be played. First Wizard wins; otherwise highest trump; otherwise highest of the led colour. Exact prediction: 20 + 10 per trick. Miss: −10 per trick off.</p></details>
      </div>}
      {mode === 'online' && <Online back={() => setMode('home')} />}
      {mode === 'offline' && <Offline back={() => setMode('home')} />}
    </div>);
}
