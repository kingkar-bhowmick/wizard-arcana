import { makeGame, makePlayer, startRound, chooseTrump, bid, play, finishTrick, rematch,
  view, legalCard, SUITS } from '/engine.js';

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
toastElement.classList.add('toast');
const socket = typeof io === 'function' ? io({ autoConnect: true, reconnection: true,
  reconnectionDelay: 500, reconnectionDelayMax: 5000, timeout: 15000 }) : null;
const SESSION_KEY = 'wizard-arcana-v3-seat';
const OFFLINE_KEY = 'wizard-arcana-v3-offline';
const NAME_KEY = 'wizard-arcana-v3-name';
const SETTINGS_KEY = 'wizard-arcana-v3-settings';
const invitation = new URLSearchParams(location.search).get('room')?.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || '';
let mode = invitation ? 'join' : 'home';
let state = null, offline = null, offlineIndex = 0, offlineHandoff = false, offlineNext = 0;
let playerCount = 3, offlineNames = [], selectedCard = null, modal = null, busy = false;
let onlineSession = getSession();
let audioOn = readStore(storage('localStorage'), SETTINGS_KEY, { audio: false }).audio;
let previousPhase = null, previousRevision = -1;

function storage(name) { try { return window[name] || null; } catch { return null; } }
function readStore(store, key, fallback) { try { return JSON.parse(store.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeStore(store, key, value) { try { store.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ } }
function getSession() { return readStore(storage('sessionStorage'), SESSION_KEY, null); }
function saveSession(value) { onlineSession = value; writeStore(storage('sessionStorage'), SESSION_KEY, value); }
function clearSession() { onlineSession = null; try { sessionStorage.removeItem(SESSION_KEY); } catch {} }
function getName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
function setName(value) { try { localStorage.setItem(NAME_KEY, value); } catch {} }
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function toast(message) { toastElement.textContent = String(message); toastElement.classList.add('show'); clearTimeout(toastElement._timer); toastElement._timer = setTimeout(()=>toastElement.classList.remove('show'), 3500); }
function sound(type='tap') {
  if (!audioOn) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const ctx = sound.ctx || (sound.ctx = new Audio());
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), gain = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(type === 'win' ? 620 : 480, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(type === 'win' ? 950 : 700, ctx.currentTime + .16);
    gain.gain.setValueAtTime(.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.04, ctx.currentTime + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .24);
    o.connect(gain); gain.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .25);
  } catch {}
}
function haptic() { try { navigator.vibrate?.(15); } catch {} }
function send(event, payload) {
  if (!socket?.connected) { toast('Connection lost — reconnecting. Offline mode is still available.'); return; }
  if (busy) return;
  busy = true;
  socket.timeout(8000).emit(event, payload, (err, response) => {
    busy = false;
    if (err) return toast('Server did not respond. Check your connection.');
    if (!response?.ok) return toast(response?.error || 'Action could not be completed.');
    if (event === 'create' || event === 'join' || event === 'resume') {
      saveSession({ code: response.code, token: response.token });
      mode = 'online';
    }
    if (event === 'leave') { clearSession(); state = null; mode = 'home'; render(); }
  });
}
const colorCode = { red:'#c65d5b', blue:'#76a7dd', green:'#71b48b', yellow:'#e3be70' };
const suitMark = { red:'⚜', blue:'♜', green:'❦', yellow:'☀' };
const avatars = ['🧙','🧝','🧛','🧚','🧙‍♀️','🧝‍♀️'];
function cardName(card) { return card.s === 'wizard' ? 'Wizard' : card.s === 'jester' ? 'Jester' : `${card.s} ${card.v}`; }
function cardPath(card) { return `/assets/cards/${encodeURIComponent(card.id)}.webp`; }
function art(card, cls='', additional='') { return `<img class="${cls}" src="${cardPath(card)}" alt="${safe(cardName(card))}" loading="eager" draggable="false" ${additional}>`; }
function btn(text, action, kind='btn-quiet', extra='') { return `<button type="button" class="btn ${kind}" data-act="${safe(action)}" ${extra}>${text}</button>`; }
function panel(content, cls='') { return `<section class="panel ${cls}">${content}</section>`; }
function header() {
  const network = mode === 'offline' ? '<span class="modebadge">◉ LOCAL</span>' : `<span class="netbadge ${socket?.connected?'ok':'off'}">${socket?.connected?'ONLINE':socket?'CONNECTING':'OFFLINE'}</span>`;
  return `<header class="top"><div class="logo">✦ WIZARD <b>ARCANA</b></div><div class="top-right">${network}<button class="tinybtn" data-act="audio" aria-label="${audioOn?'Mute':'Enable'} sound" title="Toggle sound">${audioOn?'♫':'♪'}</button><button class="tinybtn" data-act="rules" aria-label="Rules" title="Rules">?</button></div></header>`;
}
function heroCards() { return `<div class="card-gallery" aria-hidden="true">${[
  ['blue-8','-10deg','12px'],['wizard-2','-3deg','0'],['red-13','6deg','0'],['green-10','13deg','15px']
 ].map(([id,rot,y])=>`<img style="--rot:${rot};--y:${y}" src="/assets/cards/${id}.webp" alt="">`).join('')}</div>`; }
function home() {
  const savedOffline = readStore(storage('localStorage'), OFFLINE_KEY, null);
  const resumable = savedOffline?.players?.length > 0;
  return `<div class="narrow">${header()}<div class="hero"><div class="emblem"><span class="emblem-core">W</span></div><h1 class="hero-title">WIZARD<span>ARCANA</span></h1><p class="hero-sub">Enter the circle of prophecy. Predict each trick, master the elements, and outwit your friends.</p>${heroCards()}</div>${panel(`<h2>The circle awaits</h2><label class="field" for="nickname">YOUR APPRENTICE NAME</label><input class="textinput" id="nickname" maxlength="22" autocomplete="nickname" placeholder="e.g. Merlin" value="${safe(getName())}"><div class="btn-stack" style="margin-top:16px">${btn('✦ Create an online room','create','btn-gold btn-full')}${btn('↗ Join with room code','joinPage','btn-full')}${btn('♠ Offline · Pass & play','offlinePage','btn-quiet btn-full')}</div>${onlineSession?`<div style="margin-top:10px">${btn(`↶ Reconnect to ${safe(onlineSession.code)}`,'resume','btn-quiet btn-full')}</div>`:''}${resumable?`<div style="margin-top:10px">${btn('↶ Resume offline match','resumeOffline','btn-quiet btn-full')}</div>`:''}`, 'panel-ornate')}<div class="feature-row"><div class="feature"><b>60</b><span>ORIGINAL-TYPE CARDS</span></div><div class="feature"><b>3–6</b><span>APPRENTICES</span></div><div class="feature"><b>∞</b><span>MAGICAL MOMENTS</span></div></div><p class="foot">Independent fan-made game · Rule system from the supplied AMIGO booklet · Card art sourced from your reference photograph · Not officially affiliated</p></div>`;
}
function joinPage() {
 return `<div class="narrow">${header()}<div class="hero"><div class="emblem" style="width:105px;height:105px"><span class="emblem-core" style="font-size:52px">✧</span></div><h1>Enter the Circle</h1><p class="hero-sub">Your friends are waiting around the magical table.</p></div>${panel(`<label class="field">YOUR APPRENTICE NAME</label><input id="nickname" class="textinput" maxlength="22" value="${safe(getName())}" placeholder="Your name"><label class="field">SIX-CHARACTER INVITE CODE</label><input id="roomcode" class="textinput codeinput" maxlength="6" value="${safe(invitation)}" placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false"><div class="btn-stack" style="margin-top:18px">${btn('Enter the room →','join','btn-gold btn-full')}${btn('← Back to home','home','btn-quiet btn-full')}</div>`,'panel-ornate')}</div>`;
}
function offlineFields(n) {
 return Array.from({length:n},(_,i)=>`<label class="field" for="local${i}">APPRENTICE ${i+1}</label><input class="textinput offline-name" id="local${i}" maxlength="22" value="${safe(offlineNames[i] || (i===0 ? getName() : ''))}" placeholder="Wizard ${i+1}">`).join('');
}
function offlinePage() {
 return `<div class="narrow">${header()}<div class="hero"><h1>Gather the Coven</h1><p class="hero-sub">One device. Private hands. No internet needed once the game is cached.</p></div>${panel(`<h2>Pass & play setup</h2><span class="eyebrow">Number of players</span><div class="choice-grid">${[3,4,5,6].map(n=>`<button type="button" class="btn ${playerCount===n?'btn-gold':'btn-quiet'}" data-count="${n}">${n}</button>`).join('')}</div><div id="offline-names">${offlineFields(playerCount)}</div><label class="choice"><input id="variant" type="checkbox">Plus/minus one variant: the total of predictions must not equal the number of tricks</label>${btn('Begin the offline ritual','offlineStart','btn-gold btn-full')}${btn('Back','home','btn-quiet btn-full','style="margin-top:9px"')}`,'panel-ornate')}</div>`;
}
function getNickname() {
 const n = document.querySelector('#nickname')?.value.trim().slice(0,22) || 'Apprentice';
 setName(n); return n;
}
function playerRoster(p, showKick=false) {
 return `<div class="roster-item"><div class="avatar">${avatars[p.index % avatars.length]}</div><div class="rinfo"><b>${safe(p.name)}${p.index === state.myIndex ? ' · YOU' : ''}${p.index===0?' ✦':''}</b><small><i class="${p.connected?'online-dot':'offline-dot'}"></i>${p.connected?'Connected':'Offline'}${state.phase==='lobby'?'':' · '+p.cards+' cards · Bid '+(p.bid??'—')+' · Won '+p.wins}</small></div><span class="points">${p.score} ✧</span>${showKick && !p.connected && p.index!==0 ? `<button class="mini-cross" data-remove="${p.index}" aria-label="Remove ${safe(p.name)}">×</button>`:''}</div>`;
}
function lobby() {
 const roomUrl = `${location.origin}/?room=${state.code}`;
 return `<div class="narrow">${header()}<div class="hero" style="padding:10px 0"><span class="eyebrow">The gathering</span><h1 style="margin:10px 0">Your Magical Circle</h1><p class="hero-sub">Invite your friends to this private table.</p></div><div class="lobby-grid">${panel(`<div class="center"><span class="eyebrow">SECRET ROOM CODE</span><div class="bigcode">${state.code}</div><div class="btn-row">${btn('▤ Copy code','copyCode')}${btn('↗ Share invitation','share')}</div><p class="muted" style="margin-bottom:0">${state.players.length} / 6 friends · 3 minimum</p></div>`,'panel-ornate')}${panel(`<h2>The apprentices</h2><div class="roster">${state.players.map(p=>playerRoster(p,state.host)).join('')}</div><p class="hint">${state.host?'Only you can begin the game.':'Waiting for the host to begin the game.'}</p>`)}
 </div><div class="lobby-steps"><span class="active">1. Gather</span><span>2. Predict</span><span>3. Play</span><span>4. Score</span></div>${state.host?btn('✦ Start the match','start','btn-gold btn-full',state.players.length<3||state.players.some(p=>!p.connected)?'disabled':''):panel('<div class="center"><span class="spark">✧</span> Waiting for the host to begin…</div>')}${btn('Leave the lobby','exit','btn-quiet btn-full','style="margin-top:9px"')}<p class="foot">Invite link: ${safe(roomUrl)}</p></div>`;
}
function seat(p) {
 const active = state.turn === p.index && ['chooseTrump','bid','play'].includes(state.phase);
 return `<div class="seat ${active?'active':''} ${p.connected?'':'offline'}"><div class="bubble">${avatars[p.index%avatars.length]}</div><div class="seat-name">${safe(p.name)}</div><div class="seat-stat">${p.cards} 🂠 · ${p.score} ✦</div><div class="seat-conn">${!p.connected?'● Disconnected':p.bid===null?'Bid —':`Bid ${p.bid} · Won ${p.wins}`}</div></div>`;
}
function table() {
 let content;
 if (state.table.length) {
   content = state.table.map(({card,index})=>`<div class="played-slot">${art(card)}<span>${safe(state.players[index]?.name || '?')}</span></div>`).join('');
 } else if (state.reveal) {
   content = `<div class="trump-reveal">${art(state.reveal)}<div class="reveal-text">THE REVEALED CARD<strong>${safe(cardName(state.reveal))}</strong>${state.trump === 'choose' ? 'Dealer decides the trump color' : state.trump ? `${state.trump.toUpperCase()} is trump this round` : 'No trump this round'}</div></div>`;
 } else {
   content = `<div class="empty-table">✧ &nbsp; ${state.phase==='play'?'The first card awaits':'All cards dealt · No trump'} &nbsp; ✧</div>`;
 }
 let trump = state.trump && state.trump !== 'choose' ? `<span class="trump-dot" style="--dot:${colorCode[state.trump]}"></span> ${state.trump.toUpperCase()} TRUMP` : state.trump === 'choose' ? '✧ CHOOSING TRUMP' : '✧ NO TRUMP';
 return `<div class="table-wrapper"><div class="player-ring">${state.players.filter(p=>p.index!==state.myIndex).map(seat).join('')}</div><div class="table-felt"><div class="rune">✧</div><span class="trump-pill">${trump}</span><div class="table-cards">${content}</div></div></div>`;
}
function statusMessage() {
 const phase=state.phase, myTurn=state.myIndex===state.turn;
 if(phase==='trickEnd') return `<span class="spark">✧</span> ${safe(state.players[state.lastTrick.winner]?.name)} wins the trick!`;
 if(phase==='roundEnd') return `✦ Round ${state.round} has been scored`;
 if(phase==='finished') return `🏆 The championship is complete`;
 if(myTurn) return `<span class="spark">✦</span> YOUR TURN — ${phase==='bid'?'predict your tricks':phase==='chooseTrump'?'choose the trump color':'select and play a card'}`;
 return `◷ Waiting for ${safe(state.players[state.turn]?.name || 'the others')} to ${phase==='bid'?'predict':phase==='chooseTrump'?'choose trump':'play'}…`;
}
function handCard(card) {
 const canPlay = state.phase === 'play' && state.myIndex === state.turn && legalCard(state.hand,state.table,card);
 const canInspect = !canPlay;
 const chosen = selectedCard === card.id;
 return `<button class="playing-card ${canPlay?'selectable':''} ${canInspect&&state.phase==='play'&&state.myIndex===state.turn?'unplayable':''} ${chosen?'selected':''}" data-card="${safe(card.id)}" aria-label="${safe(cardName(card))}${canPlay?', selectable':' (inspect)'}" aria-pressed="${chosen}">${art(card)}${canInspect&&state.phase==='play'&&state.myIndex===state.turn?'<span class="illegal-tag">FOLLOW SUIT</span>':''}</button>`;
}
function controls() {
 const mine = state.turn===state.myIndex;
 if(state.phase==='chooseTrump') {
  return `<div class="action-area"><h3>✧ The trump prophecy</h3><p class="hint">${mine?'You revealed a Wizard as dealer. Choose the trump color.':`Waiting for ${safe(state.players[state.dealer].name)} to choose trump.`}</p>${mine?`<div class="suit-grid">${SUITS.map(s=>`<button class="suit-button" data-trump="${s}"><span class="suit-circle" style="--sc:${colorCode[s]}"></span>${s.toUpperCase()}</button>`).join('')}</div>`:''}</div>`;
 }
 if(state.phase==='bid') {
  return `<div class="action-area"><h3>✧ Make your prophecy</h3><p class="hint">${mine?`How many of this round's ${state.round} tricks will you win?`:`${safe(state.players[state.turn].name)} is choosing their prediction.`}</p>${mine?`<div class="choice-grid">${Array.from({length:state.round+1},(_,n)=>`<button class="btn btn-gold" data-bid="${n}">${n}</button>`).join('')}</div>`:''}</div>`;
 }
 if(state.phase==='play') {
  return `<div class="action-area"><h3>♜ ${mine?'Your spell is ready':'Watch the table'}</h3><p class="hint">${mine?selectedCard?`Selected: ${safe(cardName(state.hand.find(c=>c.id===selectedCard)||{s:'?' }))}. Tap again or press Play.`:'Tap a playable card to select it. Tap again to cast it.':`Your hand is private. Wait for your turn, and plan your next move.`}</p>${mine?btn(selectedCard?`✦ Play ${safe(cardName(state.hand.find(c=>c.id===selectedCard)||{s:'?' }))}`:'Select a card first','playSelected','btn-gold btn-play',selectedCard?'':'disabled'):''}</div>`;
 }
 if(state.phase==='trickEnd') {
  return `<div class="action-area center"><span class="result-crown">✦</span><h2 class="turn-result">${safe(state.players[state.lastTrick.winner].name)} wins the trick</h2><p class="hint">${mode==='offline'?'Pass the device once the trick is cleared.':'The next trick begins automatically in a moment.'}</p>${mode==='offline'?btn('Continue to next trick →','finishTrick','btn-gold btn-full'):''}</div>`;
 }
 return '';
}
function myHand() {
 const p = state.players[state.myIndex];
 const show = ['chooseTrump','bid','play','trickEnd'].includes(state.phase);
 if(!show) return '';
 return `<section class="my-quarters"><div class="my-header"><div><h3>✧ ${safe(p.name)}'s Hand ${mode==='online'?'<span class="tag">PRIVATE</span>':''}</h3><div class="my-stats">Bid <b>${p.bid??'—'}</b> · Won <b>${p.wins}</b> · Score <b>${p.score}</b></div></div><span class="badge-gold">${state.hand.length} CARDS</span></div><div class="hand-rail" aria-label="Your hand">${state.hand.length?state.hand.map(handCard).join(''):'<div class="hand-empty">All your cards have been played ✧</div>'}</div>${mode==='offline'&&state.phase!=='trickEnd'?btn('🔒 Hide hand / pass device','hideHand','btn-quiet btn-full'):''}</section>`;
}
function scoringTable(full=false) {
 const last = state.history.at(-1);
 if(!last) return '<p class="muted">No completed rounds yet.</p>';
 return `<div class="scroll-x"><table class="score-table"><thead><tr><th>Apprentice</th><th>Bid / Won</th><th>Round ±</th><th>Total ✦</th></tr></thead><tbody>${state.players.map(p=>{
  const r=last.results[p.index];return `<tr class="${p.index===state.myIndex?'me':''}"><td>${safe(p.name)}</td><td>${r.bid} / ${r.wins}</td><td class="${r.delta>=0?'plus':'minus'}">${r.delta>0?'+':''}${r.delta}</td><td>${r.score}</td></tr>`;
 }).join('')}</tbody></table></div>${full?`<h3 style="margin-top:18px">Round-by-round score history</h3><div class="scroll-x"><table class="score-table"><thead><tr><th>Round</th>${state.players.map(p=>`<th>${safe(p.name)}</th>`).join('')}</tr></thead><tbody>${state.history.map(h=>`<tr><td>${h.round}</td>${h.results.map(r=>`<td>${r.score} <small class="${r.delta>=0?'plus':'minus'}">(${r.delta>0?'+':''}${r.delta})</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}`;
}
function results() {
 const final = state.phase==='finished';
 const winningScore = Math.max(...state.players.map(p=>p.score));
 const winners=state.players.filter(p=>p.score===winningScore).map(p=>p.name);
 return `<div class="narrow">${header()}<div class="hero"><div class="emblem"><span class="emblem-core">${final?'♛':'✧'}</span></div><div class="eyebrow">${final?'The prophecy is fulfilled':'Experience awarded'}</div><h1>${final?'Grand Finale':`Round ${state.round} Complete`}</h1>${final?`<div class="summary-leader">👑 ${winners.map(safe).join(' & ')} ${winners.length===1?'wins':'tie for victory'}!</div>`:'<p class="hero-sub">Every prediction counts. Your adventure continues.</p>'}</div>${panel(`<h2>${final?'Final standings':'The Scorepad of Truth'}</h2>${scoringTable()}${final?state.host||mode==='offline'?btn('✦ Play another match','rematch','btn-gold btn-full','style="margin-top:15px"'):'<p class="muted">Waiting for the host to start a rematch.</p>':state.host||mode==='offline'?btn('✧ Deal the next round','next','btn-gold btn-full','style="margin-top:15px"'):'<p class="muted">Waiting for the host to deal the next round.</p>'}${btn('See all scores','scores','btn-quiet btn-full','style="margin-top:8px"')}${btn('Exit to main menu','exit','btn-quiet btn-full','style="margin-top:8px"')}`,'panel-ornate')}</div>`;
}
function game() {
 if(mode==='offline' && offlineHandoff) return handoff();
 if(['roundEnd','finished'].includes(state.phase)) return results();
 const me=state.players[state.myIndex];
 const stage = state.phase==='chooseTrump'?'The Trump':state.phase==='bid'?'Prophecies':state.phase==='play'?'The Trick':'Trick Claimed';
 const tricksCompleted = Math.max(0, state.round - Math.max(...state.players.map(p=>p.cards))); 
 let marks=''; if(state.round<=20)for(let i=0;i<state.round;i++)marks+=`<span class="${i<tricksCompleted?'done':''}"></span>`;
 return `<div class="arena">${header()}<div class="match-top"><div><div class="eyebrow">The Academy · Chapter ${state.round}</div><h1 class="phase-title">${stage}</h1><div class="match-sub">${state.players.length} apprentices · ${state.round} trick${state.round===1?'':'s'} this round</div></div><div class="badge-gold">ROUND <span class="round-number">${state.round}</span> / ${state.maxRounds}</div></div><div class="progress-track">${marks}</div><div class="turn-banner ${state.turn!==state.myIndex?'waiting':''} ${socket&&!socket.connected&&mode==='online'?'conn-warning':''}">${mode==='online'&&!socket?.connected?'⚠ Connection lost — trying to reconnect…':statusMessage()}</div><div class="game-screen"><section class="game-main">${table()}</section><aside class="side">${controls()}${myHand()}<div class="game-footer">${btn('▤ Scoreboard','scores')}${btn('☰ Activity','events')}${btn('✧ Rules','rules')}${btn('⇤ Exit','exit')}</div>${mode==='offline'?'<p class="foot">Private pass-and-play · Everything is saved on this device</p>':'<p class="foot">Private room '+safe(state.code)+' · Your cards are visible only to you</p>'}</aside></div></div>`;
}
function handoff() {
 const p=offline.players[offlineNext];
 return `<div class="overlay"><div class="dialog handoff"><span class="lock">🔒</span><span class="eyebrow">Private passage</span><h2>Hand over the device</h2><p class="muted">It's time for this apprentice to look at their secret cards:</p><div class="name">${safe(p.name)}</div><p class="muted">Other players: look away now. No cards will be shown until the next player confirms.</p>${btn(`✦ I am ${safe(p.name)} — reveal my hand`,'reveal','btn-gold btn-full')}</div></div>`;
}
function rulesModal() {
 return `<div class="rule"><b>60 cards:</b> red, blue, green and yellow, each numbered 1–13, plus four Wizards and four Jesters.</div><div class="rule"><b>Rounds:</b> Deal one card each in round 1, two in round 2, and so on. The game ends when all 60 cards are dealt (10 rounds for 6 players, 12 for 5, 15 for 4, 20 for 3).</div><div class="rule"><b>Trump:</b> Reveal the top undealt card. A number sets its color as trump. A Wizard means the dealer chooses. A Jester or the final round means no trump.</div><div class="rule"><b>Prediction:</b> Going clockwise from the dealer's left, everyone predicts how many tricks they will take.</div><div class="rule"><b>Follow suit:</b> Play the led color if you have it; otherwise you may play any card. A Wizard or Jester can always be played.</div><div class="rule"><b>Trick winner:</b> First Wizard wins; otherwise highest trump; otherwise highest card of the led color. If all are Jesters, the first Jester wins. A leading Jester doesn't set the led suit until the first numbered card appears.</div><div class="rule"><b>Scoring:</b> Exact prediction = 20 bonus + 10 per trick won. Missed prediction = −10 × absolute difference.</div><p class="hint">Based on the English AMIGO Wizard rules, version 3.0. Independent fan project, not an official release.</p>`;
}
function modalMarkup() {
 if (!modal) return '';
 let title='', body='';
 if(modal==='rules') {title='The Book of Spells';body=rulesModal();}
 else if(modal==='scores') {title='Scorepad of Truth';body=state?`${panel(scoringTable(true))}`:'<p class="muted">Start a match to track points.</p>';}
 else if(modal==='events') {title='The Chronicle';body=state?`<div class="history">${(state.events||[]).map(e=>`<div class="event"><span>${safe(e.text)}</span><time>${new Date(e.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div>`).join('')||'<p class="muted">The story has not begun.</p>'}</div>`:'<p class="muted">Start a match to see activity.</p>';}
 else if(modal.startsWith('card:')) {const id=modal.slice(5);const c=(state?.hand||[]).find(c=>c.id===id);if(!c){modal=null;return '';}title=cardName(c);body=`<div class="center">${art(c,'',`style="width:min(65%,240px);border:3px solid #f0ca86;border-radius:11px;box-shadow:0 16px 35px #000b"`)}<p class="muted">${c.s==='wizard'?'The first Wizard played wins the trick.':c.s==='jester'?'Jesters can be played any time; they normally lose.':`A ${c.s} card with value ${c.v}.`}</p></div>`;}
 return `<div class="overlay" id="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-label="${safe(title)}"><div class="dialog-top"><h2>${safe(title)}</h2><button class="tinybtn" data-act="closeModal" aria-label="Close dialog">✕</button></div>${body}</div></div>`;
}
function saveOffline() { if(offline)writeStore(storage('localStorage'),OFFLINE_KEY,offline); }
function loadOffline() {
 const old=readStore(storage('localStorage'),OFFLINE_KEY,null);
 if(!old?.players?.length || !old.phase) {toast('No saved offline game found.');return;}
 offline=old; mode='offline';offlineIndex=offline.turn;offlineNext=offline.turn;
 offlineHandoff=['chooseTrump','bid','play','trickEnd'].includes(offline.phase);
 refreshOffline();
}
function clearOffline() { offline=null; try{localStorage.removeItem(OFFLINE_KEY);}catch{} }
function refreshOffline() { state=view(offline,offlineIndex);render(); }
function offlineStep(fn) {
 try{
  fn(); selectedCard=null;saveOffline();offlineIndex=offline.turn;offlineNext=offline.turn;
  offlineHandoff=['chooseTrump','bid','play'].includes(offline.phase);refreshOffline();
 }catch(err){toast(err.message);}
}
function render() {
 if(mode==='home')app.innerHTML=home();
 else if(mode==='join')app.innerHTML=joinPage();
 else if(mode==='offlineSetup')app.innerHTML=offlinePage();
 else if(!state)app.innerHTML=home();
 else if(state.phase==='lobby')app.innerHTML=lobby();
 else app.innerHTML=game();
 if(modal)app.insertAdjacentHTML('beforeend',modalMarkup());
}
async function shareInvite() {
 const url=`${location.origin}/?room=${state.code}`;
 if(navigator.share){try{await navigator.share({title:'Wizard Arcana',text:`Join my Wizard Arcana table! Code: ${state.code}`,url});return;}catch{}}
 await copyText(`${state.code} — ${url}`);
}
async function copyText(text) {
 try{await navigator.clipboard.writeText(text);toast('Copied to clipboard ✦');}
 catch{window.prompt('Copy your invite:',text);}
}
function changeSound(){audioOn=!audioOn;writeStore(storage('localStorage'),SETTINGS_KEY,{audio:audioOn});sound('win');render();}
function renderOfflineSetup(){mode='offlineSetup';modal=null;render();}
function quit() {
 modal=null;selectedCard=null;
 if(mode==='offline'){
  saveOffline();offline=null;state=null;mode='home';render();return;
 }
 if(mode==='online') {
  if(state && ['lobby','finished'].includes(state.phase)){
    send('leave',null);
  }else{
    // Leaving a live game does NOT delete the seat. The same browser tab can rejoin.
    socket?.disconnect();state=null;mode='home';render();
  }
  return;
 }
 mode='home';render();
}
function handleAction(button) {
 const action=button.dataset.act;
 if(action==='audio')return changeSound();
 if(action==='rules'||action==='scores'||action==='events'){modal=action;render();return;}
 if(action==='closeModal'){modal=null;render();return;}
 if(action==='home')return quit();
 if(action==='exit')return quit();
 if(action==='joinPage'){getNickname();mode='join';render();return;}
 if(action==='offlinePage'){getNickname();return renderOfflineSetup();}
 if(action==='create')return send('create',{name:getNickname(),variant:false});
 if(action==='join'){const code=document.querySelector('#roomcode')?.value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code||'')){toast('Enter a 6-character room code.');return;}return send('join',{name:getNickname(),code});}
 if(action==='resume'){if(onlineSession){if(socket?.connected)send('resume',onlineSession);else socket?.connect();}return;}
 if(action==='copyCode')return copyText(state.code);
 if(action==='share')return shareInvite();
 if(action==='start')return send('start',null);
 if(action==='offlineStart'){
  const players=[...document.querySelectorAll('.offline-name')].map((n,i)=>n.value.trim().slice(0,22)||`Wizard ${i+1}`);
  if(players[0])setName(players[0]);
  offline=makeGame('LOCAL',players[0],'offline-0',{variant:document.querySelector('#variant')?.checked});
  players.slice(1).forEach((n,i)=>offline.players.push(makePlayer(n,`offline-${i+1}`)));
  startRound(offline);mode='offline';offlineIndex=offline.turn;offlineNext=offline.turn;offlineHandoff=true;saveOffline();refreshOffline();return;
 }
 if(action==='resumeOffline')return loadOffline();
 if(action==='reveal'){offlineIndex=offlineNext;offlineHandoff=false;refreshOffline();return;}
 if(action==='hideHand'){offlineHandoff=true;offlineNext=offline.turn;refreshOffline();return;}
 if(action==='finishTrick')return offlineStep(()=>finishTrick(offline));
 if(action==='next'){if(mode==='online')send('next',null);else offlineStep(()=>startRound(offline));return;}
 if(action==='rematch'){
  if(mode==='online')send('rematch',null);else offlineStep(()=>{rematch(offline);startRound(offline);});return;
 }
 if(action==='playSelected'){
  if(!selectedCard)return;
  const card=state.hand.find(c=>c.id===selectedCard);
  if(!card || !legalCard(state.hand,state.table,card))return;
  haptic();sound();if(mode==='online')send('play',card.id);else offlineStep(()=>play(offline,offlineIndex,card.id));
 }
}
app.addEventListener('click',event=>{
 const el=event.target.closest('button');
 if(!el||el.disabled)return;
 if(el.dataset.act){handleAction(el);return;}
 if(el.dataset.count){
  offlineNames=[...document.querySelectorAll('.offline-name')].map(x=>x.value);
  playerCount=Number(el.dataset.count);render();return;
 }
 if(el.dataset.remove){send('remove',Number(el.dataset.remove));return;}
 if(el.dataset.trump){sound('win');if(mode==='online')send('trump',el.dataset.trump);else offlineStep(()=>chooseTrump(offline,offlineIndex,el.dataset.trump));return;}
 if(el.dataset.bid!==undefined){sound('tap');if(mode==='online')send('bid',Number(el.dataset.bid));else offlineStep(()=>bid(offline,offlineIndex,Number(el.dataset.bid)));return;}
 if(el.dataset.card){
   const id=el.dataset.card, card=state?.hand?.find(c=>c.id===id);
   if(!card)return;
   const allowed=state.phase==='play'&&state.myIndex===state.turn&&legalCard(state.hand,state.table,card);
   if(!allowed){modal=`card:${id}`;render();return;}
   if(selectedCard===id){haptic();sound();if(mode==='online')send('play',id);else offlineStep(()=>play(offline,offlineIndex,id));}
   else {selectedCard=id;haptic();sound();render();document.querySelector(`[data-card="${CSS.escape(id)}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});}
 }
});
app.addEventListener('click',event=>{
 if(event.target.id==='dialog-backdrop'){modal=null;render();}
});
window.addEventListener('keydown', e=>{if(e.key==='Escape'&&modal){modal=null;render();}});
if(socket){
 socket.on('state', newState=>{
   if(mode==='offline'||mode==='offlineSetup')return;
   // Prevent older websocket messages from overwriting newer state.
   if(state?.code===newState.code&&newState.revision<state.revision)return;
   const justWon=previousPhase!==newState.phase&&newState.phase==='trickEnd';
   state=newState;mode='online';
   if(!state.hand.some(c=>c.id===selectedCard))selectedCard=null;
   previousPhase=newState.phase;previousRevision=newState.revision;
   render();if(justWon)sound('win');
 });
 socket.on('connect',()=>{
   if(mode==='online'&&state)render();
   if(onlineSession && (!invitation || invitation===onlineSession.code) && mode!=='offline' && mode!=='offlineSetup')send('resume',onlineSession);
   else if(mode==='home'||mode==='join')render();
 });
 socket.on('disconnect',()=>{if(mode==='online')render();});
 socket.on('connect_error',()=>{if(mode==='online')render();});
}
// A saved online seat is tab-specific, so two browser tabs won't impersonate each other.
// sessionStorage survives refresh, while localStorage holds only nickname and offline saves.
render();
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
