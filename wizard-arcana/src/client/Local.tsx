import { useEffect, useState } from 'react';
import * as E from '../shared/engine';
import { botAction } from '../shared/bot';
import { Game } from './Game';
import { Feedback, MatchOptions, Panel } from './components';
import { playGameUpdate, playSound } from './sound';
import { readStorage, writeStorage } from './storage';

export type LocalMode = 'pass' | 'solo';
type Save = { s: E.State; names: string[] };
const keys: Record<LocalMode, string> = { pass: 'wa:off', solo: 'wa:solo' };
const botNames = ['Astra', 'Rowan', 'Ember', 'Sable', 'Nova'];

function readSave(mode: LocalMode): Save | null {
  try {
    const save = JSON.parse(readStorage('local', keys[mode]) ?? 'null');
    if (save?.s && Array.isArray(save.s.hands) && save.names?.length === save.s.n &&
        save.names.every((name: unknown) => typeof name === 'string' && name.trim())) return save;
  } catch { /* Ignore saves that cannot be read. */ }
  return null;
}

export function hasLocalSave(mode: LocalMode) {
  return readSave(mode) !== null;
}

export function Local({ mode, home }: { mode: LocalMode; home: () => void }) {
  const solo = mode === 'solo';
  const [save, setSave] = useState(() => readSave(mode));
  const [names, setNames] = useState(['', '', '']);
  const [options, setOptions] = useState<E.Opts>({ format: solo ? 'quick' : 'classic', plusMinus: false });
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const title = solo ? 'Solo practice' : 'Pass & play';

  function store(value: Save | null) {
    writeStorage('local', keys[mode], value ? JSON.stringify(value) : null);
    setSave(value);
  }

  function reset() {
    if (save) {
      setNames(save.names);
      setOptions(save.s.opts);
    }
    store(null);
    setConfirmReset(false);
    setRevealed(false);
    setError('');
  }

  useEffect(() => {
    if (!solo || !save || save.s.turn === 0 || save.s.phase === 'done' || confirmReset) return;
    const { s, names } = save;
    const timer = window.setTimeout(() => {
      const before = E.view(s, s.turn);
      const move = botAction(before);
      if (!move) { setError('This bot could not find a legal move.'); return; }
      const next = structuredClone(s);
      const error = E.act(next, s.turn, move.type, move.value);
      if (error) { setError(error); return; }
      playGameUpdate(before, E.view(next, 0));
      store({ s: next, names });
    }, s.lastTrick && !s.plays.length && s.phase === 'play' ? 1000 : 450);
    return () => window.clearTimeout(timer);
  }, [solo, save, confirmReset]);

  if (!save) return <Panel eyebrow={solo ? 'Single player' : 'Local multiplayer'} title={title}
    description={solo ? 'Play against bots and practice making exact bids.' : 'Share one device. Each player reveals their hand at the start of their turn.'}>
    <form className="setup-form" onSubmit={(event) => {
      event.preventDefault();
      const players = names.map((name, i) => solo && i > 0 ? botNames[i - 1] : name.trim() || (solo ? 'You' : `Player ${i + 1}`));
      store({ s: E.newGame(players.length, options), names: players });
      playSound('round');
    }}>
      <fieldset>
        <legend>{solo ? 'Bot opponents' : 'Players'}</legend>
        <div className="choices">{[3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={n === names.length}
          onClick={() => setNames(Array.from({ length: n }, (_, i) => names[i] || ''))}>{solo ? n - 1 : n}</button>)}</div>
      </fieldset>
      <div className="name-fields">{names.slice(0, solo ? 1 : names.length).map((name, i) => <label key={i}>
        {solo ? 'Your name' : `Player ${i + 1}`}
        <input value={name} maxLength={16} placeholder={solo ? 'Wizard' : `Player ${i + 1}`}
          onChange={(event) => setNames(names.map((value, seat) => seat === i ? event.target.value : value))} />
      </label>)}</div>
      <MatchOptions options={options} onChange={setOptions} />
      <button className="primary" type="submit">Start match <span aria-hidden="true">↗</span></button>
    </form>
  </Panel>;

  if (confirmReset) return <Panel eyebrow={title} title="Start over?" description="This will clear the current match for this mode.">
    <div className="split-actions">
      <button onClick={() => setConfirmReset(false)}>Keep playing</button>
      <button className="primary" onClick={reset}>Clear match</button>
    </div>
  </Panel>;

  const { s, names: players } = save;
  const me = solo ? 0 : s.turn;
  if (!solo && !revealed && s.phase !== 'done') return <Panel eyebrow={`Pass & play · Round ${s.round} of ${s.rounds}`}
    title={`Pass to ${players[s.turn]}`} description="The next player can reveal their hand once they have the device.">
    <div className="handoff-seal" aria-hidden="true">✦</div>
    <button className="primary" onClick={() => { playSound('tap'); setRevealed(true); }}>Reveal my hand</button>
    <div className="split-actions"><button className="plain" onClick={home}>Pause match</button>
      <button className="plain" onClick={() => setConfirmReset(true)}>Start over</button></div>
  </Panel>;

  function act(type: E.ActionType, value: number) {
    const next = structuredClone(s);
    const error = E.act(next, me, type, value);
    if (error) { setError(error); return; }
    setError('');
    playGameUpdate(E.view(s, me), E.view(next, me));
    if (!solo && next.turn !== s.turn) setRevealed(false);
    store({ s: next, names: players });
  }

  return <>
    <Game game={E.view(s, me)} names={players} onAction={act} error={error}
      bots={solo ? players.slice(1).map((_, i) => i + 1) : undefined} onReplay={reset} />
    {s.phase !== 'done' && <div className="local-actions"><Feedback>{solo && s.turn !== 0 ? error : ''}</Feedback>
      <button className="plain" onClick={() => { setRevealed(false); setConfirmReset(true); }}>Start over</button></div>}
  </>;
}
