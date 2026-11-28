import type { ReactNode } from 'react';
import type { Format, Opts } from '../shared/engine';
import { QUICK_ROUNDS } from '../shared/engine';

export function Panel({ eyebrow, title, description, children }: {
  eyebrow: string; title: string; description?: string; children: ReactNode;
}) {
  return <section className="setup panel">
    <p className="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
    {description && <p className="muted">{description}</p>}
    {children}
  </section>;
}

export function MatchOptions({ options, onChange, disabled }: {
  options: Opts; onChange: (options: Opts) => void; disabled?: boolean;
}) {
  return <fieldset className="match-options" disabled={disabled}>
    <legend>Match format</legend>
    <div className="format-options">
      {(['classic', 'quick'] as Format[]).map((format) => <button type="button" key={format}
        aria-pressed={(options.format ?? 'classic') === format}
        onClick={() => onChange({ ...options, format })}>
        <strong>{format === 'classic' ? 'Classic' : 'Quick'}</strong>
        <small>{format === 'classic' ? 'Full deck progression' : `${QUICK_ROUNDS} rounds`}</small>
      </button>)}
    </div>
    <label className="check">
      <input type="checkbox" checked={options.plusMinus} onChange={(event) => onChange({ ...options, plusMinus: event.target.checked })} />
      <span><strong>Plus/minus bidding</strong><small>The last bid can’t make total bids equal the number of tricks.</small></span>
    </label>
  </fieldset>;
}

export function Feedback({ children }: { children: ReactNode }) {
  return children ? <p className="feedback" role="status">{children}</p> : null;
}
