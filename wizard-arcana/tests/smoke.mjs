// Run: npm start (in another shell) then: node tests/smoke.mjs
import { io } from 'socket.io-client';
const url = process.env.URL || 'http://localhost:3000';
const mk = () => io(url, { transports: ['websocket'] });
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const A = mk(), B = mk(), C = mk(); const last = {};
[['A', A], ['B', B], ['C', C]].forEach(([n, s]) => s.on('room', (r) => (last[n] = r)));
const a = await call(A, 'create', { name: 'Ann' });
const b = await call(B, 'join', { code: a.code, name: 'Bob' });
const c = await call(C, 'join', { code: a.code, name: 'Cy' });
A.emit('start', {}); await new Promise((r) => setTimeout(r, 300));
const g = last.A.game; console.assert(g && !g.hands && last.B.game.hand.length === 1, 'privacy/hand');
console.log('own-hand-only:', JSON.stringify(last.A.game).includes('"hands"') === false);
B.close(); await new Promise((r) => setTimeout(r, 200));
const B2 = mk(); const res = await call(B2, 'resume', { code: a.code, token: b.token });
B2.on('room', (r) => (last.B2 = r)); await new Promise((r) => setTimeout(r, 300));
console.log('resume ok:', res.ok, 'seat', last.B2?.me, 'still in game:', !!last.B2?.game);
process.exit(0);
