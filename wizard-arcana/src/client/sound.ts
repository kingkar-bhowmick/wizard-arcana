import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';
import type { GameView } from '../shared/engine';

type Cue = 'tap' | 'bid' | 'card' | 'trick' | 'round' | 'finish';
const notes: Record<Cue, number[]> = {
  tap: [587], bid: [440, 587], card: [311], trick: [392, 523, 659],
  round: [330, 440, 523, 659], finish: [392, 523, 659, 784, 1047],
};
let context: AudioContext | undefined;
let enabled = readStorage('local', 'wa:sound') !== 'off';

function unlock() {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Audio support is optional. */ }
}

export function playSound(cue: Cue) {
  if (!enabled || context?.state !== 'running') return;
  const audio = context;
  notes[cue].forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.075;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = cue === 'card' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(cue === 'tap' ? 0.035 : 0.085, start + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.23);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}

export function useSoundPreference() {
  const [sound, setSound] = useState(enabled);
  useEffect(() => {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  function toggle() {
    enabled = !enabled;
    setSound(enabled);
    writeStorage('local', 'wa:sound', enabled ? 'on' : 'off');
    if (enabled) {
      unlock();
      void context?.resume().then(() => playSound('tap')).catch(() => {});
    }
  }
  return { sound, toggle };
}

export function playGameUpdate(before: GameView | null, game: GameView) {
  if (!before) return;
  if (before.phase !== 'done' && game.phase === 'done') playSound('finish');
  else if (before.round !== game.round) playSound('round');
  else if (before.trickNo !== game.trickNo) playSound('trick');
  else if (before.plays.length !== game.plays.length) playSound('card');
  else if (before.phase !== game.phase || before.bids.some((bid, i) => bid !== game.bids[i])) playSound('bid');
}
