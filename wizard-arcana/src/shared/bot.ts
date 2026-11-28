import { forbiddenBid, kind, playError, suitOf, trickWinner, val } from './engine';
import type { ActionType, GameView, Suit } from './engine';

function strength(card: number, trump: Suit | null) {
  if (kind(card) === 'w') return 40;
  if (kind(card) === 'j') return 0;
  return val(card) + (trump !== null && suitOf(card) === trump ? 16 : 0);
}

/** Bots receive the same public information and private hand as a human seat. */
export function botAction(game: GameView): { type: ActionType; value: number } | null {
  if (game.phase === 'done' || game.me !== game.turn) return null;
  const { hand, trump, plays, me } = game;

  if (game.phase === 'trump') {
    const strengths = [0, 1, 2, 3].map((suit) => hand
      .filter((card) => suitOf(card) === suit)
      .reduce((sum, card) => sum + 6 + val(card), 0));
    return { type: 'trump', value: strengths.indexOf(Math.max(...strengths)) };
  }

  if (game.phase === 'bid') {
    const estimate = hand.reduce((sum, card) => {
      if (kind(card) === 'w') return sum + 0.94;
      if (kind(card) === 'j') return sum + 0.02;
      const rank = val(card) / 13;
      return sum + (trump !== null && suitOf(card) === trump ? 0.25 + rank * 0.55 : rank ** 3 * 0.55);
    }, 0);
    const blocked = forbiddenBid(game);
    const legal = Array.from({ length: game.round + 1 }, (_, bid) => bid).filter((bid) => bid !== blocked);
    const value = legal.reduce((best, bid) => Math.abs(bid - estimate) < Math.abs(best - estimate) ? bid : best);
    return { type: 'bid', value };
  }

  const legal = hand.filter((card) => !playError(hand, plays, card))
    .sort((a, b) => strength(a, trump) - strength(b, trump));
  if (!legal.length) return null;

  const winning = legal.filter((card) => trickWinner([...plays, { p: me, c: card }], trump) === me);
  const losing = legal.filter((card) => !winning.includes(card));
  const needed = (game.bids[me] ?? 0) - game.won[me];
  if (needed <= 0) return { type: 'play', value: losing[losing.length - 1] ?? legal[0] };
  if (plays.length === game.n - 1) return { type: 'play', value: winning[0] ?? legal[0] };
  return { type: 'play', value: winning[winning.length - 1] ?? legal[0] };
}
