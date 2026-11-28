// Pure, authoritative Wizard rules engine. Used by the server AND offline mode.
export type Suit = 0 | 1 | 2 | 3;
export const SUITS = ['Blue', 'Green', 'Red', 'Yellow'];
// Card ids: 0-51 numbered (suit=floor(id/13), value=id%13+1), 52-55 Wizards, 56-59 Jesters
export const kind = (id: number): 'n' | 'w' | 'j' => (id < 52 ? 'n' : id < 56 ? 'w' : 'j');
export const suitOf = (id: number): Suit | null => (id < 52 ? (Math.floor(id / 13) as Suit) : null);
export const val = (id: number) => (id < 52 ? (id % 13) + 1 : 0);
export const cardName = (id: number) =>
  kind(id) === 'n' ? `${SUITS[suitOf(id)!]} ${val(id)}` : kind(id) === 'w' ? 'Wizard' : 'Jester';

export type Rng = (n: number) => number; // uniform int in [0,n)
export const rng: Rng = (n) => {
  const a = new Uint32Array(1);
  const lim = 4294967296 - (4294967296 % n);
  let x: number;
  do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim);
  return x % n;
};
export const shuffle = (r: Rng = rng) => {
  const d = Array.from({ length: 60 }, (_, i) => i);
  for (let i = 59; i > 0; i--) { const j = r(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};

export interface Play { p: number; c: number }
export type Format = 'classic' | 'quick';
export const QUICK_ROUNDS = 6;
export interface Opts { plusMinus: boolean; format?: Format }
export type ActionType = 'trump' | 'bid' | 'play';
export interface State {
  n: number; rounds: number; round: number; dealer: number;
  phase: 'trump' | 'bid' | 'play' | 'done';
  hands: number[][]; trumpCard: number | null; trump: Suit | null;
  bids: (number | null)[]; won: number[]; plays: Play[]; turn: number; trickNo: number;
  scores: number[]; history: { round: number; bids: number[]; won: number[]; pts: number[] }[];
  opts: Opts; lastTrick: { plays: Play[]; winner: number; round?: number } | null;
}

export function newGame(n: number, opts: Opts = { plusMinus: false }, r: Rng = rng): State {
  if (!Number.isInteger(n) || n < 3 || n > 6) throw new Error('3-6 players');
  const s: State = { n, rounds: opts.format === 'quick' ? QUICK_ROUNDS : 60 / n, round: 1, dealer: r(n), phase: 'bid', hands: [], trumpCard: null, trump: null,
    bids: [], won: [], plays: [], turn: 0, trickNo: 0, scores: Array(n).fill(0), history: [], opts, lastTrick: null };
  deal(s, r);
  return s;
}
function deal(s: State, r: Rng) {
  const d = shuffle(r), k = s.round;
  s.hands = Array.from({ length: s.n }, (_, p) => d.slice(p * k, (p + 1) * k).sort((a, b) => a - b));
  s.bids = Array(s.n).fill(null); s.won = Array(s.n).fill(0); s.plays = []; s.trickNo = 0;
  s.trumpCard = null; s.trump = null; s.phase = 'bid'; s.turn = (s.dealer + 1) % s.n;
  if (s.round * s.n < 60) {
    const t = d[s.round * s.n]; s.trumpCard = t;
    if (kind(t) === 'n') s.trump = suitOf(t);
    else if (kind(t) === 'w') { s.phase = 'trump'; s.turn = s.dealer; } // dealer chooses
  } // When the deck is exhausted, or a Jester is turned up, there is no trump.
}
export function leadSuit(plays: Play[]): Suit | null {
  for (const x of plays) { if (kind(x.c) === 'w') return null; if (kind(x.c) === 'n') return suitOf(x.c); }
  return null;
}
export function playError(hand: number[], plays: Play[], c: number): string | null {
  if (!hand.includes(c)) return 'You do not hold that card.';
  if (kind(c) !== 'n') return null;
  const ls = leadSuit(plays);
  if (ls === null || suitOf(c) === ls) return null;
  return hand.some((x) => kind(x) === 'n' && suitOf(x) === ls) ? `You must follow ${SUITS[ls]}.` : null;
}
export function trickWinner(plays: Play[], trump: Suit | null): number {
  const w = plays.find((x) => kind(x.c) === 'w'); if (w) return w.p;
  const best = (suit: Suit) => plays.filter((x) => kind(x.c) === 'n' && suitOf(x.c) === suit).sort((a, b) => val(b.c) - val(a.c))[0];
  if (trump !== null) { const t = best(trump); if (t) return t.p; }
  const ls = leadSuit(plays); if (ls !== null) return best(ls).p;
  return plays[0].p; // all Jesters
}
export const roundPoints = (bid: number, won: number) => (bid === won ? 20 + 10 * won : -10 * Math.abs(bid - won));

export function forbiddenBid({ opts, round, bids }: Pick<State, 'opts' | 'round' | 'bids'>) {
  if (!opts.plusMinus || bids.filter((bid) => bid === null).length !== 1) return null;
  return round - bids.reduce<number>((sum, bid) => sum + (bid ?? 0), 0);
}

export function act(s: State, p: number, type: string, value: number, r: Rng = rng): string | null {
  if (s.phase === 'done') return 'Game over.';
  if (s.turn !== p) return 'Not your turn.';
  if (type === 'trump') {
    if (s.phase !== 'trump' || ![0, 1, 2, 3].includes(value)) return 'Cannot choose trump now.';
    s.trump = value as Suit; s.phase = 'bid'; s.turn = (s.dealer + 1) % s.n; return null;
  }
  if (type === 'bid') {
    if (s.phase !== 'bid') return 'Not bidding.';
    if (!Number.isInteger(value) || value < 0 || value > s.round) return 'Invalid bid.';
    if (value === forbiddenBid(s))
      return `Total bids may not equal ${s.round}.`;
    s.bids[p] = value; s.turn = (p + 1) % s.n;
    if (s.bids.every((b) => b !== null)) { s.phase = 'play'; s.turn = (s.dealer + 1) % s.n; }
    return null;
  }
  if (type === 'play') {
    if (s.phase !== 'play') return 'Not playing.';
    const err = playError(s.hands[p], s.plays, value); if (err) return err;
    if (s.plays.length === 0) s.lastTrick = null;
    s.hands[p] = s.hands[p].filter((c) => c !== value); s.plays.push({ p, c: value });
    if (s.plays.length < s.n) { s.turn = (p + 1) % s.n; return null; }
    const w = trickWinner(s.plays, s.trump);
    s.won[w]++; s.lastTrick = { plays: s.plays, winner: w, round: s.round }; s.plays = []; s.trickNo++; s.turn = w;
    if (s.trickNo === s.round) endRound(s, r);
    return null;
  }
  return 'Unknown action.';
}
function endRound(s: State, r: Rng) {
  const pts = s.bids.map((b, i) => roundPoints(b as number, s.won[i]));
  pts.forEach((x, i) => (s.scores[i] += x));
  s.history.push({ round: s.round, bids: s.bids as number[], won: [...s.won], pts });
  if (s.round === s.rounds) { s.phase = 'done'; return; }
  s.round++; s.dealer = (s.dealer + 1) % s.n; deal(s, r);
}
// Privacy: only the viewer's own hand is ever included.
export function view(s: State, me: number) {
  const { hands, ...rest } = s;
  return { ...rest, hand: hands[me], counts: hands.map((h) => h.length), me };
}
export type GameView = ReturnType<typeof view>;
