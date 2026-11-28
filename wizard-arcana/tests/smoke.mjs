// Start the application first, then run: node tests/smoke.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';

const url = process.env.URL || 'http://localhost:3000';
const sockets = [];
const latest = new Map();
const call = (socket, event, data) => socket.timeout(3000).emitWithAck(event, data);
const room = (socket) => latest.get(socket);

async function connect() {
  const socket = io(url, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  socket.on('room', (state) => latest.set(socket, state));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Could not connect to ' + url)), 4000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
  });
  return socket;
}

try {
  const host = await connect();
  const departed = await connect();
  const remaining = await connect();
  const guest = await connect();
  const created = await call(host, 'create', { name: 'Ann' });
  const joined = [];
  for (const [socket, name] of [[departed, 'Bob'], [remaining, 'Cy'], [guest, 'Dee']]) {
    const joinedRoom = once(socket, 'room', { signal: AbortSignal.timeout(3000) });
    const response = await call(socket, 'join', { name, code: created.code });
    assert.ok(response.token, response.error);
    joined.push(response);
    await joinedRoom;
  }
  assert.match(created.code, /^[A-Z2-9]{6}$/);
  assert.equal(room(guest).me, 3);

  const reindexed = once(guest, 'room', { signal: AbortSignal.timeout(3000) });
  assert.equal((await call(departed, 'leave', {})).ok, true);
  assert.equal((await reindexed)[0].me, 2);
  assert.equal((await call(guest, 'opts', { format: 'quick' })).error, 'Only the host can change lobby settings.');

  assert.equal((await call(host, 'opts', { format: 'quick', plusMinus: true })).ok, true);
  const guestStarted = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Guest did not receive the active game.')), 3000);
    const inspect = (state) => {
      if (!state.game) return;
      guest.off('room', inspect);
      clearTimeout(timeout);
      resolve(state.game);
    };
    guest.on('room', inspect);
  });
  assert.equal((await call(host, 'start', {})).ok, true);
  const game = await guestStarted;
  assert.equal(game.rounds, 6);
  assert.deepEqual(game.opts, { format: 'quick', plusMinus: true });
  assert.equal(game.hand.length, 1);
  assert.equal('hands' in game, false);
  assert.equal('token' in room(guest).seats[0], false);

  const restored = await connect();
  const replaced = once(guest, 'replaced', { signal: AbortSignal.timeout(3000) });
  const restoredRoom = once(restored, 'room', { signal: AbortSignal.timeout(3000) });
  assert.equal((await call(restored, 'resume', { code: created.code, token: joined[2].token })).ok, true);
  await replaced;
  const [state] = await restoredRoom;
  assert.equal(state.me, 2);
  assert.deepEqual(state.game.hand, game.hand);
  assert.equal((await call(guest, 'act', { type: 'bid', value: 0 })).error, 'No active game.');

  const players = [host, remaining, restored];
  for (let move = 0; room(host).game.phase !== 'done' && move < 100; move++) {
    const { turn, phase } = room(host).game;
    const player = players[turn];
    const seat = room(player).game;
    const blocked = seat.bids.filter((bid) => bid === null).length === 1 &&
      seat.bids.reduce((sum, bid) => sum + (bid ?? 0), 0) === seat.round;
    const firstLead = seat.plays.find(({ c }) => c < 56);
    const lead = firstLead && firstLead.c < 52 ? Math.floor(firstLead.c / 13) : null;
    const follow = seat.hand.find((card) => card < 52 && Math.floor(card / 13) === lead);
    const action = phase === 'trump' ? { type: 'trump', value: 0 }
      : phase === 'bid' ? { type: 'bid', value: blocked ? 1 : 0 }
      : { type: 'play', value: follow ?? seat.hand[0] };
    const updates = players.map((socket) => once(socket, 'room', { signal: AbortSignal.timeout(3000) }));
    assert.equal((await call(player, 'act', action)).error, null);
    await Promise.all(updates);
  }
  assert.equal(room(host).game.phase, 'done');
  assert.equal(room(host).game.history.length, 6);
  assert.equal((await call(host, 'start', {})).ok, true);
  assert.equal(room(host).game.round, 1);
  assert.equal(room(host).game.history.length, 0);
  console.log('Online smoke passed: room settings, seat changes, hand privacy, resume, a complete Quick match, and rematch.');
} finally {
  for (const socket of sockets) socket.disconnect();
}
