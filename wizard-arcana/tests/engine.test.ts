import { describe, it, expect } from 'vitest';
import * as E from '../src/shared/engine';
const W = 52, J = 56, B = (v: number) => v - 1, G = (v: number) => 13 + v - 1, R = (v: number) => 26 + v - 1;
const play = (p: number, c: number) => ({ p, c });

describe('deck', () => {
  it('has 60 unique cards: 52 numbered, 4 wizards, 4 jesters', () => {
    const d = E.shuffle(); expect(new Set(d).size).toBe(60);
    expect(d.filter((c) => E.kind(c) === 'w').length).toBe(4);
    expect(d.filter((c) => E.kind(c) === 'j').length).toBe(4);
  });
});
describe('following suit', () => {
  it('enforces suit when possible', () => {
    expect(E.playError([B(1), R(5)], [play(0, R(9))], B(1))).toMatch(/follow Red/);
    expect(E.playError([B(1), R(5)], [play(0, R(9))], R(5))).toBeNull();
    expect(E.playError([B(1), G(5)], [play(0, R(9))], B(1))).toBeNull(); // void in red
    expect(E.playError([B(1), R(5), W], [play(0, R(9))], W)).toBeNull();
    expect(E.playError([B(1), R(5), J], [play(0, R(9))], J)).toBeNull();
  });
  it('wizard lead: anything follows', () => {
    expect(E.playError([B(1), R(5)], [play(0, W)], B(1))).toBeNull();
  });
  it('jester lead: first number sets suit, and it never changes', () => {
    expect(E.leadSuit([play(0, J)])).toBeNull();
    expect(E.leadSuit([play(0, J), play(1, G(3)), play(2, R(4))])).toBe(1);
    expect(E.playError([B(1), G(2)], [play(0, J), play(1, G(3))], B(1))).toMatch(/follow Green/);
    expect(E.leadSuit([play(0, J), play(1, J), play(2, W)])).toBeNull();
  });
});
describe('trick winner', () => {
  it('first wizard wins', () => expect(E.trickWinner([play(0, R(13)), play(1, W), play(2, W)], 2)).toBe(1));
  it('highest trump beats lead suit', () => expect(E.trickWinner([play(0, R(13)), play(1, B(2)), play(2, B(1))], 0)).toBe(1));
  it('highest lead suit if no trump', () => expect(E.trickWinner([play(0, R(3)), play(1, R(9)), play(2, B(13))], 3)).toBe(1));
  it('all jesters: first jester', () => expect(E.trickWinner([play(0, J), play(1, J + 1)], null)).toBe(0));
  it('jester lead then number', () => expect(E.trickWinner([play(0, J), play(1, G(2)), play(2, G(7))], null)).toBe(2));
});
describe('scoring', () => {
  it('correct/incorrect', () => {
    expect(E.roundPoints(0, 0)).toBe(20); expect(E.roundPoints(2, 2)).toBe(40);
    expect(E.roundPoints(3, 1)).toBe(-20); expect(E.roundPoints(0, 2)).toBe(-20);
  });
});
describe('trump', () => {
  const find = (pred: (s: E.State) => boolean) => { for (let i = 0; i < 5000; i++) { const s = E.newGame(3); if (pred(s)) return s; } throw new Error('none'); };
  it('wizard trump: dealer chooses', () => {
    const s = find((x) => x.trumpCard !== null && E.kind(x.trumpCard) === 'w');
    expect(s.phase).toBe('trump'); expect(s.turn).toBe(s.dealer);
    expect(E.act(s, (s.dealer + 1) % 3, 'trump', 1)).toMatch(/turn/);
    expect(E.act(s, s.dealer, 'trump', 1)).toBeNull(); expect(s.trump).toBe(1); expect(s.phase).toBe('bid');
  });
  it('jester trump: no trump', () => {
    const s = find((x) => x.trumpCard !== null && E.kind(x.trumpCard) === 'j');
    expect(s.trump).toBeNull(); expect(s.phase).toBe('bid');
  });
});
describe('predictions', () => {
  it('plus/minus rule blocks dealer making total equal tricks', () => {
    const s = E.newGame(3, { plusMinus: true }); s.phase = 'bid'; s.trump = null; s.round = 1;
    let p = (s.dealer + 1) % 3; s.bids = [null, null, null]; s.turn = p;
    expect(E.act(s, p, 'bid', 1)).toBeNull(); p = (p + 1) % 3; expect(E.act(s, p, 'bid', 0)).toBeNull(); p = (p + 1) % 3;
    expect(E.act(s, p, 'bid', 0)).toMatch(/may not equal/); expect(E.act(s, p, 'bid', 1)).toBeNull();
  });
});
describe('privacy', () => {
  it('view exposes only own hand', () => {
    const s = E.newGame(4); const v: any = E.view(s, 2);
    expect(v.hands).toBeUndefined(); expect(v.hand).toEqual(s.hands[2]);
    expect(v.counts.length).toBe(4);
  });
});
describe('full games', () => {
  for (const n of [3, 4, 5, 6]) it(`${n} players complete a full game`, () => {
    const s = E.newGame(n, { plusMinus: n % 2 === 0 }); let guard = 0;
    while (s.phase !== 'done' && guard++ < 5000) {
      const p = s.turn;
      if (s.phase === 'trump') expect(E.act(s, p, 'trump', E.rng(4))).toBeNull();
      else if (s.phase === 'bid') { let ok = false; for (let b = 0; b <= s.round && !ok; b++) ok = E.act(s, p, 'bid', (b + E.rng(2)) % (s.round + 1)) === null || E.act(s, p, 'bid', b) === null; expect(ok).toBe(true); }
      else { const c = s.hands[p].find((x) => !E.playError(s.hands[p], s.plays, x))!; expect(E.act(s, p, 'play', c)).toBeNull(); }
    }
    expect(s.phase).toBe('done'); expect(s.history.length).toBe(60 / n);
    s.history.forEach((h) => expect(h.won.reduce((a, b) => a + b, 0)).toBe(h.round));
    expect(s.scores).toEqual(s.scores.map((_, i) => s.history.reduce((a, h) => a + h.pts[i], 0)));
  });
});
