import type { CSSProperties } from 'react';
import { cardName, kind, SUITS, suitOf, val } from '../shared/engine';

export const SUIT_COLORS = ['#91beff', '#93dbad', '#ff9e9b', '#f3ce7d'];
export const SIGILS = ['◆', '♣', '♥', '✹'];
const cardStyles = ['sapphire', 'emerald', 'ruby', 'amber', 'wizard', 'jester'];

export function Card({ id, compact, selected, reason, onSelect }: {
  id: number; compact?: boolean; selected?: boolean; reason?: string; onSelect?: () => void;
}) {
  const type = kind(id);
  const suit = suitOf(id);
  const index = suit ?? (type === 'w' ? 4 : 5);
  const symbol = suit !== null ? SIGILS[suit] : type === 'w' ? '✦' : '☾';
  const rank = suit !== null ? val(id) : type === 'w' ? 'W' : 'J';
  const title = suit !== null ? SUITS[suit] : cardName(id);
  const label = cardName(id);
  const className = ['card', cardStyles[index], compact && 'compact', selected && 'selected', reason && 'unavailable'].filter(Boolean).join(' ');
  const style = { '--card-ink': SUIT_COLORS[suit ?? 3] } as CSSProperties;
  const face = <span className="card-face" aria-hidden="true">
    <span className="card-corner">{rank}<small>{symbol}</small></span>
    <span className="card-art">{suit !== null && <span>{symbol}</span>}</span>
    <span className="card-title">{title}</span>
    <span className="card-corner inverse">{rank}<small>{symbol}</small></span>
  </span>;
  return onSelect
    ? <button type="button" className={className} style={style} aria-label={label} aria-description={reason}
        aria-disabled={!!reason || undefined} aria-pressed={!!selected} onClick={onSelect}>{face}</button>
    : <div className={className} style={style} role="img" aria-label={label}>{face}</div>;
}
