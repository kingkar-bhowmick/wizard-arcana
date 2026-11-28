import { useState } from 'react';
import type { CSSProperties } from 'react';
import * as E from '../shared/engine';
import { Card, SIGILS, SUIT_COLORS } from './Card';
import { Feedback } from './components';
import { playSound } from './sound';

type GameProps = {
  game: E.GameView; names: string[]; onAction: (type: E.ActionType, value: number) => void;
  error?: string; blocked?: boolean; bots?: number[]; onReplay?: () => void;
};

const signed = (points: number) => points > 0 ? `+${points}` : String(points);

function Scorecard({ game, names, open }: { game: E.GameView; names: string[]; open?: boolean }) {
  return <details className="scorecard" open={open}>
    <summary>Round scorecard <span>{game.history.length} of {game.rounds} scored</span></summary>
    {!game.history.length ? <p className="muted">Results appear after the first round.</p> :
      <div className="score-scroll" tabIndex={0} aria-label="Round results">
        <table>
          <thead><tr><th scope="col">Round</th>{names.map((name, i) => <th scope="col" key={i}>{name}</th>)}</tr></thead>
          <tbody>{[...game.history].reverse().map((round) => <tr key={round.round}>
            <th scope="row">{round.round}</th>{names.map((_, i) => <td key={i}>
              <strong className={round.pts[i] >= 0 ? 'positive' : 'negative'}>{signed(round.pts[i])}</strong>
              <small>{round.bids[i]} bid · {round.won[i]} won</small>
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>}
  </details>;
}

function Results({ game, names, onReplay }: Pick<GameProps, 'game' | 'names' | 'onReplay'>) {
  const ranks = names.map((name, seat) => ({ name, seat, score: game.scores[seat] })).sort((a, b) => b.score - a.score);
  const winners = ranks.filter((player) => player.score === ranks[0].score);
  return <section className="panel results">
    <p className="eyebrow">Match complete</p>
    <h1>{winners.length === 1 ? `${winners[0].name} wins` : 'The match is tied'}</h1>
    <ol className="standings">{ranks.map((player) => <li key={player.seat} className={player.score === ranks[0].score ? 'first' : ''}>
      <span>{ranks.findIndex((entry) => entry.score === player.score) + 1}</span><strong>{player.name}</strong><b>{player.score} pts</b>
    </li>)}</ol>
    <Scorecard game={game} names={names} open />
    {onReplay && <button className="primary" onClick={onReplay}>Play again <span aria-hidden="true">↗</span></button>}
  </section>;
}

export function Game(props: GameProps) {
  const { game, names, onReplay } = props;
  if (game.phase === 'done') return <Results game={game} names={names} onReplay={onReplay} />;
  const turnKey = [game.me, game.phase, game.round, game.trickNo, game.turn].join(':');
  return <Match {...props} turnKey={turnKey} />;
}

function Match({ game, names, onAction, error, blocked, bots = [], turnKey }: GameProps & { turnKey: string }) {
  const [selection, setSelection] = useState<{ turn: string; value: number } | null>(null);
  const [feedback, setFeedback] = useState<{ turn: string; message: string } | null>(null);
  const selected = selection?.turn === turnKey ? selection.value : null;
  const mine = game.turn === game.me;
  const active = mine && !blocked;
  const banned = E.forbiddenBid(game);
  const lead = E.leadSuit(game.plays);
  const previous = !game.plays.length ? game.lastTrick : null;
  const shown = previous?.plays ?? game.plays;
  const winner = previous && (previous.winner === game.me ? 'You won the trick' : `${names[previous.winner]} won the trick`);
  const priorRound = previous?.round !== undefined && previous.round < game.round ? previous.round : null;
  const actor = mine ? 'You' : names[game.turn];
  const heading = game.phase === 'trump' ? (mine ? 'Choose trump' : `${actor} chooses trump`)
    : game.phase === 'bid' ? (mine ? 'Make your prediction' : `${actor} is bidding`)
    : (mine ? 'Your turn to play' : `${actor} to play`);
  const message = game.phase === 'trump' ? 'A Wizard was turned up. The dealer chooses the trump suit.'
    : game.phase === 'bid' ? `Predict how many of the ${game.round} ${game.round === 1 ? 'trick' : 'tricks'} you’ll win.`
    : lead === null ? 'Any card may be played.' : `Follow ${E.SUITS[lead]} if you can. Wizards and Jesters are always playable.`;
  const completeRound = game.history[game.history.length - 1];
  const roundSummary = completeRound?.round === game.round - 1 && game.trickNo === 0 && !game.plays.length;
  const choose = (value: number) => {
    setFeedback(null);
    setSelection({ turn: turnKey, value });
    playSound('tap');
  };
  return <section className="match">
    <div className="match-header">
      <div><p className="eyebrow">{game.opts.format === 'quick' ? 'Quick match' : 'Classic match'}</p>
        <h1>Round {game.round} <small>/ {game.rounds}</small></h1></div>
      <div className="match-facts">
        {game.phase === 'play' && <span>Trick <strong>{game.trickNo + 1} / {game.round}</strong></span>}
        <span>Trump <strong style={game.trump !== null ? { color: SUIT_COLORS[game.trump] } : undefined}>
          {game.phase === 'trump' ? 'Pending' : game.trump === null ? 'None' : `${SIGILS[game.trump]} ${E.SUITS[game.trump]}`}
        </strong></span>
        {game.trumpCard !== null && <Card id={game.trumpCard} compact />}
      </div>
    </div>
    <div className="seats" style={{ '--seats': game.n } as CSSProperties}>
      {names.map((name, seat) => <div className={`seat ${game.turn === seat ? 'current' : ''}`} key={seat} aria-current={game.turn === seat ? 'step' : undefined}>
        <div className="seat-name"><span className="avatar" aria-hidden="true">{Array.from(name)[0].toUpperCase()}</span>
          <div><strong>{name}</strong><small>{[seat === game.me ? 'You' : bots.includes(seat) ? 'Bot' : null, seat === game.dealer ? 'Dealer' : null].filter(Boolean).join(' · ') || `${game.counts[seat]} ${game.counts[seat] === 1 ? 'card' : 'cards'}`}</small></div>
        </div>
        <div className="seat-stats"><span>Bid <b>{game.bids[seat] ?? '—'}</b></span><span>Won <b>{game.won[seat]}</b></span><span><b>{game.scores[seat]}</b> pts</span></div>
      </div>)}
    </div>
    <section className={`felt${game.phase !== 'play' && !shown.length ? ' preparing' : ''}`} aria-label="Trick table">
      {shown.length ? <>
        <p className="trick-caption">{winner || 'Current trick'}{priorRound !== null && ` · Round ${priorRound}`}</p>
        <div className="played">{shown.map((play) => <div key={play.p} className={previous?.winner === play.p ? 'winning-card' : ''}>
          <Card id={play.c} compact /><span>{names[play.p]}</span>
        </div>)}</div>
      </> : <div className="empty-table"><span aria-hidden="true">✧</span><span>Waiting for the first card</span></div>}
    </section>
    {roundSummary && <p className="round-result">Round {completeRound.round} scored <strong>{signed(completeRound.pts[game.me])} pts</strong></p>}
    <section className="decision">
      <div className="decision-heading" aria-live="polite"><h2>{heading}</h2><p>{message}</p></div>
      {mine && game.phase === 'trump' && <div className="choices">
        {E.SUITS.map((suit, i) => <button key={suit} disabled={!active} onClick={() => onAction('trump', i)}
          style={{ color: SUIT_COLORS[i] }}>{SIGILS[i]} {suit}</button>)}
      </div>}
      {mine && game.phase === 'bid' && <div className="bid-controls">
        <div className="choices" aria-label="Trick predictions">
          {Array.from({ length: game.round + 1 }, (_, value) => <button key={value}
            aria-label={`Bid ${value}${value === banned ? ' (blocked by plus/minus bidding)' : ''}`}
            aria-pressed={selected === value} disabled={!active || value === banned}
            onClick={() => choose(value)}>{value}</button>)}
        </div>
        {banned !== null && banned >= 0 && banned <= game.round && <small className="muted">A bid of {banned} would make total bids equal the number of tricks.</small>}
        <button className="primary" disabled={!active || selected === null} onClick={() => selected !== null && onAction('bid', selected)}>Confirm bid{selected !== null ? ` · ${selected}` : ''}</button>
      </div>}
      <Feedback>{error || (feedback?.turn === turnKey ? feedback.message : '')}</Feedback>
    </section>
    <section className="hand-section" aria-label="Your hand">
      <div className="hand-header"><h2>Your hand <small>{game.hand.length}</small></h2>
        {mine && game.phase === 'play' && <button className="primary" disabled={!active || selected === null}
          onClick={() => selected !== null && onAction('play', selected)}>Play card <span aria-hidden="true">↑</span></button>}
      </div>
      {game.hand.length ? <div className="hand">{game.hand.map((card) => {
        const reason = E.playError(game.hand, game.plays, card) ?? undefined;
        return <Card key={card} id={card} selected={selected === card && game.phase === 'play'}
          reason={mine && game.phase === 'play' ? reason ?? (blocked ? 'Waiting for the room.' : undefined) : undefined}
          onSelect={mine && game.phase === 'play' ? () => {
            if (blocked) return;
            if (reason) setFeedback({ turn: turnKey, message: reason });
            else choose(card);
          } : undefined} />;
      })}</div> : <p className="muted">You’ve played all your cards this round.</p>}
    </section>
    <Scorecard game={game} names={names} />
  </section>;
}
