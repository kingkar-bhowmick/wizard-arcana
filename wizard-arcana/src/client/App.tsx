import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Card } from './Card';
import { hasLocalSave, Local } from './Local';
import type { LocalMode } from './Local';
import { Online } from './Online';
import { playSound, useSoundPreference } from './sound';
import { readStorage } from './storage';

type Page = 'home' | 'online' | LocalMode;
type Mode = Exclude<Page, 'home'>;
const modes: { id: Mode; icon: string; title: string; description: string; players: string }[] = [
  { id: 'solo', icon: '✦', title: 'Solo practice', description: 'Sharpen your predictions against computer opponents.', players: '1 player' },
  { id: 'online', icon: '◇', title: 'Online multiplayer', description: 'Create a private room and invite friends to your table.', players: '3–6 players' },
  { id: 'pass', icon: '☾', title: 'Pass & play', description: 'Share a device and reveal each hand as turns change.', players: '3–6 players' },
];

function Guide({ dialog }: { dialog: RefObject<HTMLDialogElement> }) {
  return <dialog ref={dialog} className="guide" aria-labelledby="guide-title"
    onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <section>
      <div className="guide-title"><h2 id="guide-title">How to play</h2>
        <form method="dialog"><button type="submit" aria-label="Close guide">×</button></form></div>
      <p className="muted">A trick is one card from each player. Your goal is to win exactly the number of tricks you bid.</p>
      <ol className="guide-steps">
        <li><div><strong>Check trump</strong><p>The turned-up card sets trump. A Wizard lets the dealer choose. A Jester or an exhausted deck means no trump.</p></div></li>
        <li><div><strong>Make a prediction</strong><p>Round one deals one card per player, round two deals two, and so on. Bid between zero and the number of cards in your hand.</p></div></li>
        <li><div><strong>Play one card per trick</strong><p>Follow the first numbered suit led if you can. Wizards and Jesters can always be played. A Wizard played before any numbered card leaves the suit open.</p></div></li>
        <li><div><strong>Decide the winner</strong><p>The first Wizard wins, then the highest trump, then the highest card of the led suit. If everyone plays a Jester, the first Jester wins.</p></div></li>
      </ol>
      <div className="guide-cards"><Card id={11} compact /><Card id={52} compact /><Card id={56} compact /></div>
      <h3>Scoring</h3>
      <p>Hit your bid for 20 points plus 10 per trick you won. Miss it and lose 10 points per trick off. A bid of two with two wins earns 40 points. A bid of two with one win loses 10.</p>
      <h3>Match formats</h3>
      <p>Classic plays until a full-deck round. Quick plays six rounds. With plus/minus bidding enabled, the final bidder cannot make the sum of all bids equal the tricks available.</p>
    </section>
  </dialog>;
}

function Home({ navigate, openGuide }: { navigate: (page: Page) => void; openGuide: () => void }) {
  return <>
    <section className="hero" aria-labelledby="home-title">
      <div className="hero-scene" aria-hidden="true">
        <div className="hero-card far"><Card id={38} /></div>
        <div className="hero-card jester"><Card id={56} /></div>
        <div className="hero-card wizard"><Card id={52} /></div>
      </div>
      <div className="hero-content">
        <p className="eyebrow"><span aria-hidden="true">✦</span> A game of tricks and predictions</p>
        <h1 id="home-title">Wizard<br /><em>Arcana</em></h1>
        <p>Read your hand, call your tricks, and outplay the table.</p>
        <div className="hero-actions">
          <button className="primary" onClick={() => navigate('solo')}>{hasLocalSave('solo') ? 'Resume solo game' : 'Play solo'} <span aria-hidden="true">↗</span></button>
          <button className="subtle" onClick={openGuide}>Learn the rules</button>
        </div>
      </div>
    </section>
    <section className="mode-section" aria-labelledby="modes-title">
      <h2 id="modes-title">Choose a mode</h2>
      <div className="mode-grid">{modes.map((mode) => {
        const resume = mode.id === 'online' ? !!readStorage('session', 'wa:code') : hasLocalSave(mode.id);
        return <button key={mode.id} className={`mode-tile ${mode.id}`} onClick={() => navigate(mode.id)}>
          <span className="mode-top"><span className="mode-icon" aria-hidden="true">{mode.icon}</span><small>{mode.players}</small></span>
          <strong>{mode.title}</strong>
          <span className="mode-description">{mode.description}</span>
          <span className="mode-link">{resume ? 'Resume game' : mode.id === 'online' ? 'Find your table' : 'Set up a game'} <span aria-hidden="true">↗</span></span>
        </button>;
      })}</div>
    </section>
  </>;
}

export default function App() {
  const [page, setPage] = useState<Page>(() => readStorage('session', 'wa:code') || new URLSearchParams(location.search).get('room') ? 'online' : 'home');
  const { sound, toggle } = useSoundPreference();
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  function navigate(next: Page) {
    if (page === next) return;
    playSound('tap');
    setPage(next);
    window.scrollTo(0, 0);
    content.current?.focus({ preventScroll: true });
  }
  const openGuide = () => dialog.current?.showModal();
  return <div className="app">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header">
      <div className="shell header-inner">
        <button className="brand" onClick={() => navigate('home')} aria-label="Wizard Arcana home">
          <span className="brand-icon" aria-hidden="true">✦</span><span>Wizard <em>Arcana</em></span>
        </button>
        <div className="header-actions">
          <button className="plain rules-link" onClick={openGuide}><span aria-hidden="true">ⓘ</span> Rules</button>
          <button className="sound-control" aria-pressed={sound} aria-label={sound ? 'Mute sound' : 'Enable sound'} onClick={toggle}>
            <span aria-hidden="true">♫</span> <span>Sound {sound ? 'on' : 'off'}</span>
          </button>
        </div>
      </div>
    </header>
    <main className="shell main" id="content" ref={content} tabIndex={-1}>
      {page !== 'home' && <button className="plain back" onClick={() => navigate('home')}><span aria-hidden="true">←</span> Back to home</button>}
      {page === 'home' && <Home navigate={navigate} openGuide={openGuide} />}
      {page === 'online' && <Online back={() => navigate('home')} />}
      {(page === 'solo' || page === 'pass') && <Local key={page} mode={page} home={() => navigate('home')} />}
    </main>
    <footer className="shell footer"><span>Wizard Arcana</span><button className="plain" onClick={openGuide}>How to play</button></footer>
    <Guide dialog={dialog} />
  </div>;
}
