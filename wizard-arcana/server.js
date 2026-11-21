import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeGame, makePlayer, startRound, chooseTrump, bid, play, finishTrick, rematch, view } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
const server = createServer(app);
const io = new Server(server, { serveClient: true, maxHttpBufferSize: 40_000,
  pingInterval: 24_000, pingTimeout: 24_000,
  cors: { origin: false } });
app.use(express.static(join(__dirname, 'public'), { maxAge: '0', etag: true }));
app.get('/engine.js', (_, res) => res.sendFile(join(__dirname, 'engine.js')));
app.get('/health', (_, res) => res.json({ ok: true, title: 'Wizard Arcana', version: '3.0.0' }));

const rooms = new Map();
const ROOM_TTL = 24 * 60 * 60 * 1000;
const MAX_ROOMS = 250;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const persistQueues = new Map();
const roomCode = () => Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
const secret = () => randomBytes(32).toString('hex');
const normalizeCode = raw => String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

async function redisCommand(args) {
  if (!redisUrl || !redisToken) return null;
  const resp = await fetch(redisUrl, { method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(4500) });
  if (!resp.ok) throw Error(`Redis returned HTTP ${resp.status}`);
  const result = await resp.json();
  if (result.error) throw Error(result.error);
  return result.result;
}
function snapshot(g) {
  // NEVER persist or expose socket IDs; clients authenticate with random seat tokens.
  return { ...g, players: g.players.map(({ socketIds, ...p }) => ({ ...p, connected: false })) };
}
function persist(g) {
  if (!redisUrl || !redisToken) return;
  const data = JSON.stringify(snapshot(g));
  const key = `wizard-arcana:${g.code}`;
  const previous = persistQueues.get(g.code) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => redisCommand(['SET', key, data, 'EX', Math.ceil(ROOM_TTL / 1000)]));
  persistQueues.set(g.code, next);
  next.catch(err => console.error('Optional Redis save failed:', err.message));
}
async function getRoom(code) {
  if (rooms.has(code)) return rooms.get(code);
  if (!redisUrl || !redisToken || !code) return null;
  try {
    const raw = await redisCommand(['GET', `wizard-arcana:${code}`]);
    if (!raw) return null;
    const g = JSON.parse(raw);
    g.players.forEach(p => { p.socketIds = []; p.connected = false; });
    g.updatedAt = Date.now();
    rooms.set(code, g);
    return g;
  } catch (err) {
    console.error('Optional Redis recovery failed:', err.message);
    return null;
  }
}
function publish(g) {
  g.updatedAt = Date.now();
  g.players.forEach((p, i) => (p.socketIds || []).forEach(id => io.to(id).emit('state', view(g, i))));
  persist(g);
}
function reject(cb, message) { if (typeof cb === 'function') cb({ ok: false, error: message }); }
function okay(cb, data = {}) { if (typeof cb === 'function') cb({ ok: true, ...data }); }
function seat(socket) {
  const g = rooms.get(socket.data.code);
  if (!g) throw Error('Room unavailable. Try rejoining with your invitation code.');
  const i = g.players.findIndex(p => p.token === socket.data.token && p.socketIds?.includes(socket.id));
  if (i < 0) throw Error('Session expired. Rejoin with your room code.');
  return [g, i];
}
function takeAction(socket, cb, fn) {
  try {
    const [g, i] = seat(socket);
    fn(g, i);
    publish(g);
    okay(cb);
  } catch (err) { reject(cb, err.message); }
}
function disconnectSeat(socket) {
  const g = rooms.get(socket.data.code);
  const p = g?.players.find(p => p.token === socket.data.token);
  if (p) {
    p.socketIds = (p.socketIds || []).filter(id => id !== socket.id);
    p.connected = p.socketIds.length > 0;
    publish(g);
  }
  if (socket.data.code) socket.leave(socket.data.code);
  socket.data.code = null; socket.data.token = null;
}
function bind(socket, g, p) {
  // Multiple tabs may observe the SAME seat without kicking each other out.
  // Each new tab normally gets an independent sessionStorage token instead.
  if (socket.data.code || socket.data.token) disconnectSeat(socket);
  p.socketIds = [...new Set([...(p.socketIds || []), socket.id])];
  p.connected = true;
  socket.data.code = g.code;
  socket.data.token = p.token;
  socket.join(g.code);
  publish(g);
  if (g.phase === 'trickEnd') scheduleTrick(g);
}
const trickTimers = new Map();
function scheduleTrick(g) {
  if (trickTimers.has(g.code)) return;
  const revision = g.revision;
  const timer = setTimeout(() => {
    trickTimers.delete(g.code);
    if (g.phase === 'trickEnd' && g.revision === revision) {
      finishTrick(g);
      publish(g);
    }
  }, 2800);
  trickTimers.set(g.code, timer);
}
// Light abuse protection on an unauthenticated, publicly accessible hobby game.
function rateLimited(socket) {
  const now = Date.now();
  const window = socket.data.rate || { start: now, hits: 0 };
  if (now - window.start > 10_000) { window.start = now; window.hits = 0; }
  window.hits++;
  socket.data.rate = window;
  return window.hits > 75;
}
function endpoint(socket, event, handler) {
  socket.on(event, (...args) => {
    const cb = typeof args.at(-1) === 'function' ? args.pop() : undefined;
    if (rateLimited(socket)) return reject(cb, 'Too many actions. Please slow down.');
    try { const response = handler(args[0], cb);
      if (response?.catch) response.catch(err => reject(cb, err.message));
    } catch (err) { reject(cb, err.message); }
  });
}
io.on('connection', socket => {
  endpoint(socket, 'create', ({ name, variant } = {}, cb) => {
    if (rooms.size >= MAX_ROOMS) return reject(cb, 'Server is busy. Please try again.');
    let id; do { id = roomCode(); } while (rooms.has(id));
    const token = secret(), g = makeGame(id, name, token, { variant });
    rooms.set(id, g);
    bind(socket, g, g.players[0]);
    okay(cb, { code: id, token });
  });
  endpoint(socket, 'join', async ({ name, code } = {}, cb) => {
    const id = normalizeCode(code), g = await getRoom(id);
    if (!g) return reject(cb, 'Room not found. Check the code, or create a new room.');
    if (g.phase !== 'lobby') return reject(cb, 'This match has started. Reconnect with your saved session.');
    if (g.players.length >= 6) return reject(cb, 'This room is full (maximum 6 players).');
    const token = secret(), p = makePlayer(name, token);
    g.players.push(p);
    bind(socket, g, p);
    okay(cb, { code: id, token });
  });
  endpoint(socket, 'resume', async ({ code, token } = {}, cb) => {
    if (!/^[a-f0-9]{64}$/.test(String(token))) return reject(cb, 'No saved session found.');
    const g = await getRoom(normalizeCode(code));
    const p = g?.players.find(p => p.token === token);
    if (!p) return reject(cb, 'Room expired or game restarted. Ask your host for a fresh code.');
    // A fresh browser socket can safely bind without replacing other participants.
    if (socket.data.code === g.code && socket.data.token === p.token && p.socketIds?.includes(socket.id)) {
      io.to(socket.id).emit('state', view(g, g.players.indexOf(p)));
      return okay(cb, { code: g.code, token: p.token });
    }
    bind(socket, g, p);
    okay(cb, { code: g.code, token: p.token });
  });
  endpoint(socket, 'start', (_, cb) => takeAction(socket, cb, (g, i) => {
    if (i !== 0 || g.phase !== 'lobby') throw Error('Only the host can start.');
    if (g.players.some(p => !p.connected)) throw Error('Wait for disconnected players or remove them.');
    startRound(g);
  }));
  endpoint(socket, 'trump', (s, cb) => takeAction(socket, cb, (g, i) => chooseTrump(g, i, s)));
  endpoint(socket, 'bid', (n, cb) => takeAction(socket, cb, (g, i) => bid(g, i, n)));
  endpoint(socket, 'play', (id, cb) => takeAction(socket, cb, (g, i) => {
    play(g, i, id);
    if (g.phase === 'trickEnd') scheduleTrick(g);
  }));
  endpoint(socket, 'next', (_, cb) => takeAction(socket, cb, (g, i) => {
    if (i !== 0 || g.phase !== 'roundEnd') throw Error('Only the host can deal the next round.');
    startRound(g);
  }));
  endpoint(socket, 'rematch', (_, cb) => takeAction(socket, cb, (g, i) => {
    if (i !== 0) throw Error('Only the host can start a rematch.');
    rematch(g);
  }));
  endpoint(socket, 'remove', (index, cb) => takeAction(socket, cb, (g, i) => {
    if (i !== 0 || g.phase !== 'lobby' || !Number.isInteger(index) || index <= 0 || index >= g.players.length) throw Error('Not allowed.');
    const player = g.players[index];
    if (player.connected) throw Error('Can only remove disconnected seats.');
    g.players.splice(index, 1);
    g.revision++;
  }));
  endpoint(socket, 'leave', (_, cb) => {
    try {
      const [g, i] = seat(socket);
      if (g.phase !== 'lobby' && g.phase !== 'finished') throw Error('You can leave this screen, but your seat stays reserved during a match.');
      g.players.splice(i, 1);
      disconnectSeat(socket);
      if (!g.players.length) {
        rooms.delete(g.code);
        if (redisUrl && redisToken) redisCommand(['DEL', `wizard-arcana:${g.code}`]).catch(() => {});
      } else { g.revision++; publish(g); }
      okay(cb);
    } catch (err) { reject(cb, err.message); }
  });
  socket.on('disconnect', () => disconnectSeat(socket));
});
setInterval(() => {
  for (const [id, g] of rooms) {
    if (Date.now() - (g.updatedAt || 0) > ROOM_TTL && g.players.every(p => !p.connected)) rooms.delete(id);
  }
}, 60_000).unref();
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => console.log(`Wizard Arcana v3 listening on port ${PORT}`));
