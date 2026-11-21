// Shared deterministic rule engine used by the server and offline pass-and-play.
// Card values and special-card behavior follow the supplied AMIGO Wizard rulebook.
export const SUITS = ['red', 'blue', 'green', 'yellow'];
export const SUIT_LABELS = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow' };

export function deck() {
  return [
    ...SUITS.flatMap(s => Array.from({ length: 13 }, (_, i) => ({ id: `${s}-${i + 1}`, s, v: i + 1 }))),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `wizard-${i}`, s: 'wizard', v: 99 })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `jester-${i}`, s: 'jester', v: 0 }))
  ];
}

export function shuffle(cards, random = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export function makePlayer(name, token) {
  return {
    name: String(name || 'Apprentice').trim().slice(0, 22) || 'Apprentice',
    token, socketIds: [], connected: true, score: 0, hand: [], bid: null, wins: 0
  };
}
export function makeGame(code, hostName, token, options = {}) {
  return {
    code, phase: 'lobby', round: 0, maxRounds: 0, dealer: -1,
    turn: 0, lead: 0, table: [], trump: null, reveal: null,
    players: [makePlayer(hostName, token)], history: [], lastTrick: null,
    variant: !!options.variant, revision: 0, updatedAt: Date.now(),
    events: []
  };
}
function log(g, text) {
  g.events = [{ text, at: Date.now() }, ...(g.events || [])].slice(0, 15);
}
export function startRound(g) {
  if (g.players.length < 3 || g.players.length > 6) throw Error('A match requires 3–6 players.');
  if (g.phase !== 'lobby' && g.phase !== 'roundEnd') throw Error('Cannot start a new round yet.');
  if (g.round >= 60 / g.players.length) throw Error('The match is complete.');
  g.round++;
  g.maxRounds = 60 / g.players.length;
  g.dealer = (g.dealer + 1) % g.players.length;
  g.turn = (g.dealer + 1) % g.players.length;
  g.lead = g.turn;
  g.table = [];
  g.lastTrick = null;
  g.players.forEach(p => { p.hand = []; p.bid = null; p.wins = 0; });
  const cards = shuffle(deck());
  for (let n = 0; n < g.round; n++) for (const p of g.players) p.hand.push(cards.pop());
  g.players.forEach(p => p.hand.sort((a, b) =>
    (SUITS.indexOf(a.s) < 0 ? 9 : SUITS.indexOf(a.s)) - (SUITS.indexOf(b.s) < 0 ? 9 : SUITS.indexOf(b.s)) || b.v - a.v
  ));
  // In the final round there is no remaining card to reveal and no trump.
  g.reveal = cards.pop() || null;
  g.trump = !g.reveal ? null : g.reveal.s === 'wizard' ? 'choose' : g.reveal.s === 'jester' ? null : g.reveal.s;
  g.phase = g.trump === 'choose' ? 'chooseTrump' : 'bid';
  if (g.phase === 'chooseTrump') g.turn = g.dealer;
  log(g, `Round ${g.round} of ${g.maxRounds} begins`);
  g.revision++;
}
export function chooseTrump(g, index, suit) {
  if (g.phase !== 'chooseTrump' || index !== g.dealer || !SUITS.includes(suit)) throw Error('The dealer must choose a valid trump suit.');
  g.trump = suit;
  g.phase = 'bid';
  g.turn = (g.dealer + 1) % g.players.length;
  log(g, `${g.players[index].name} chose ${suit} trump`);
  g.revision++;
}
// A Wizard led as the first non-Jester leaves everyone free to choose any card.
// A Jester led followed by a number card establishes that number card's suit.
export function requiredSuit(table) {
  let suit = null;
  for (const { card } of table) {
    if (card.s === 'wizard' && !suit) return null;
    if (SUITS.includes(card.s)) { suit = card.s; break; }
  }
  return suit;
}
export function legalCard(hand, table, card) {
  if (!SUITS.includes(card.s)) return true;
  const required = requiredSuit(table);
  return !required || card.s === required || !hand.some(c => c.s === required);
}
export function trickWinner(table, trump) {
  if (!table.length) throw Error('Empty trick');
  const firstWizard = table.find(({ card }) => card.s === 'wizard');
  if (firstWizard) return firstWizard.index;
  const trumpCards = table.filter(({ card }) => card.s === trump);
  if (trumpCards.length) return trumpCards.reduce((a, b) => a.card.v > b.card.v ? a : b).index;
  const ledSuit = table.find(({ card }) => SUITS.includes(card.s))?.card.s;
  if (!ledSuit) return table[0].index; // All Jesters: first Jester wins.
  return table.filter(({ card }) => card.s === ledSuit).reduce((a, b) => a.card.v > b.card.v ? a : b).index;
}
export function bid(g, index, value) {
  if (g.phase !== 'bid' || g.turn !== index || !Number.isInteger(value) || value < 0 || value > g.round)
    throw Error('Invalid prediction or not your turn.');
  if (g.variant && g.players.filter(p => p.bid !== null).length === g.players.length - 1) {
    const total = g.players.reduce((sum, p) => sum + (p.bid ?? 0), value);
    if (total === g.round) throw Error('The final bid cannot equal the total number of tricks (±1 variant).');
  }
  g.players[index].bid = value;
  log(g, `${g.players[index].name} predicted ${value}`);
  if (g.players.every(p => p.bid !== null)) {
    g.phase = 'play';
    g.turn = (g.dealer + 1) % g.players.length;
    g.lead = g.turn;
  } else g.turn = (g.turn + 1) % g.players.length;
  g.revision++;
}
export function play(g, index, id) {
  if (g.phase !== 'play' || g.turn !== index) throw Error('Wait for your turn.');
  const p = g.players[index];
  const card = p.hand.find(c => c.id === id);
  if (!card) throw Error('That card is not in your hand.');
  if (!legalCard(p.hand, g.table, card)) throw Error(`You must follow ${requiredSuit(g.table)}.`);
  p.hand = p.hand.filter(c => c.id !== id);
  g.table.push({ index, card });
  log(g, `${p.name} played ${card.s === 'wizard' ? 'a Wizard' : card.s === 'jester' ? 'a Jester' : `${card.s} ${card.v}`}`);
  if (g.table.length === g.players.length) {
    g.lead = trickWinner(g.table, g.trump);
    g.players[g.lead].wins++;
    g.lastTrick = { winner: g.lead, cards: g.table.map(x => ({ ...x })), trick: g.round - p.hand.length };
    g.phase = 'trickEnd';
  } else g.turn = (g.turn + 1) % g.players.length;
  g.revision++;
}
export function finishTrick(g) {
  if (g.phase !== 'trickEnd') throw Error('Trick not finished.');
  g.table = [];
  log(g, `${g.players[g.lead].name} won the trick`);
  if (g.players.every(p => p.hand.length === 0)) {
    const results = g.players.map(p => {
      const delta = p.bid === p.wins ? 20 + 10 * p.wins : -10 * Math.abs(p.bid - p.wins);
      p.score += delta;
      return { bid: p.bid, wins: p.wins, delta, score: p.score };
    });
    g.history.push({ round: g.round, results });
    g.phase = g.round === g.maxRounds ? 'finished' : 'roundEnd';
    log(g, `Round ${g.round} scored`);
  } else {
    g.phase = 'play';
    g.turn = g.lead;
  }
  g.revision++;
}
export function rematch(g) {
  if (g.phase !== 'finished') throw Error('Finish the current match first.');
  g.round = 0; g.maxRounds = 0; g.dealer = -1; g.lead = 0; g.turn = 0;
  g.table = []; g.trump = null; g.reveal = null; g.lastTrick = null;
  g.history = []; g.events = [];
  g.players.forEach(p => { p.score = 0; p.hand = []; p.bid = null; p.wins = 0; });
  g.phase = 'lobby';
  g.revision++;
}
export function view(g, index) {
  return {
    code: g.code, phase: g.phase, round: g.round, maxRounds: g.maxRounds,
    dealer: g.dealer, turn: g.turn, lead: g.lead, table: g.table,
    trump: g.trump, reveal: g.reveal, history: g.history,
    lastTrick: g.lastTrick, variant: g.variant, revision: g.revision,
    events: (g.events || []).slice(0, 8),
    players: g.players.map((p, i) => ({ index: i, name: p.name,
      connected: p.connected, score: p.score, bid: p.bid,
      wins: p.wins, cards: p.hand.length })),
    hand: index >= 0 ? g.players[index].hand : [],
    myIndex: index, host: index === 0
  };
}
