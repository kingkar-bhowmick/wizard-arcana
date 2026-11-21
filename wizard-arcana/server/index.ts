import express from 'express';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Server, Socket } from 'socket.io';
import * as E from '../src/shared/engine';

const PORT = Number(process.env.PORT || 3000);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
interface Seat { name: string; avatar: number; token: string; connected: boolean; sid?: string }
interface Room { code: string; seats: Seat[]; host: number; started: boolean; opts: E.Opts; state: E.State | null }
const rooms = new Map<string, Room>();

let redis: any = null;
if (process.env.REDIS_URL) {
  const { default: IORedis } = await import('ioredis');
  redis = new IORedis(process.env.REDIS_URL);
  const keys = await redis.keys('wa:room:*');
  for (const k of keys) { const r: Room = JSON.parse(await redis.get(k)); r.seats.forEach((s) => { s.connected = false; s.sid = undefined; }); rooms.set(r.code, r); }
  console.log(`Restored ${rooms.size} room(s) from Redis`);
} else console.log('REDIS_URL not set: games are in memory only and are lost on restart.');
const save = (r: Room) => redis?.set('wa:room:' + r.code, JSON.stringify(r), 'EX', 3 * 86400).catch(() => {});

const app = express();
app.get('/health', (_q, res) => res.json({ ok: true, rooms: rooms.size, persistent: !!redis }));
const dist = path.resolve('dist/client');
app.use(express.static(dist));
app.get('*', (_q, res) => (fs.existsSync(dist) ? res.sendFile(path.join(dist, 'index.html')) : res.status(404).send('Run npm run build')));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 30000 });

const clean = (s: any) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Wizard';
const newCode = () => { let c; do c = Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); while (rooms.has(c)); return c; };

function push(r: Room) {
  r.seats.forEach((s, i) => s.sid && io.to(s.sid).emit('room', {
    code: r.code, host: r.host, started: r.started, opts: r.opts, me: i,
    seats: r.seats.map((x) => ({ name: x.name, avatar: x.avatar, connected: x.connected })),
    game: r.state ? E.view(r.state, i) : null,
  }));
  save(r);
}
io.on('connection', (sock: Socket) => {
  let hits = 0; const iv = setInterval(() => (hits = 0), 10000);
  const guard = (f: (...a: any[]) => void) => (...a: any[]) => { if (++hits > 60) return; try { f(...a); } catch (e) { console.error(e); } };
  const bind = (r: Room, i: number) => {
    const old = r.seats[i].sid; if (old && old !== sock.id) io.to(old).emit('replaced');
    r.seats[i].sid = sock.id; r.seats[i].connected = true; sock.data = { code: r.code, seat: i }; push(r);
  };
  sock.on('create', guard((d, ack) => {
    const r: Room = { code: newCode(), seats: [], host: 0, started: false, opts: { plusMinus: false }, state: null };
    const token = crypto.randomBytes(24).toString('hex');
    r.seats.push({ name: clean(d?.name), avatar: d?.avatar | 0, token, connected: true });
    rooms.set(r.code, r); ack?.({ code: r.code, token }); bind(r, 0);
  }));
  sock.on('join', guard((d, ack) => {
    const r = rooms.get(String(d?.code || '').toUpperCase());
    if (!r) return ack?.({ error: 'Room not found.' });
    if (r.started) return ack?.({ error: 'Game already started.' });
    if (r.seats.length >= 6) return ack?.({ error: 'Room is full.' });
    const token = crypto.randomBytes(24).toString('hex');
    r.seats.push({ name: clean(d?.name), avatar: d?.avatar | 0, token, connected: true });
    ack?.({ code: r.code, token }); bind(r, r.seats.length - 1);
  }));
  sock.on('resume', guard((d, ack) => {
    const r = rooms.get(String(d?.code || '').toUpperCase());
    const i = r ? r.seats.findIndex((s) => s.token === d?.token) : -1;
    if (!r || i < 0) return ack?.({ error: 'Session expired.' });
    ack?.({ ok: true }); bind(r, i);
  }));
  sock.on('opts', guard((d) => {
    const r = rooms.get(sock.data.code); if (!r || r.started || sock.data.seat !== r.host) return;
    r.opts.plusMinus = !!d?.plusMinus; push(r);
  }));
  sock.on('start', guard((_d, ack) => {
    const r = rooms.get(sock.data.code);
    if (!r || sock.data.seat !== r.host || r.started) return;
    if (r.seats.length < 3) return ack?.({ error: 'Need at least 3 players.' });
    r.state = E.newGame(r.seats.length, r.opts); r.started = true; push(r);
  }));
  sock.on('act', guard((d, ack) => {
    const r = rooms.get(sock.data.code); if (!r?.state) return;
    const err = E.act(r.state, sock.data.seat, String(d?.type), Number(d?.value));
    ack?.({ error: err }); if (!err) push(r);
  }));
  sock.on('leave', guard(() => {
    const r = rooms.get(sock.data.code); if (!r || r.started) return;
    r.seats.splice(sock.data.seat, 1); r.host = 0; sock.data = {};
    r.seats.forEach((s) => s.sid && io.to(s.sid).emit('reindex')); // clients re-resume to get new seat index
    if (!r.seats.length) { rooms.delete(r.code); redis?.del('wa:room:' + r.code); }
  }));
  // Disconnect NEVER forfeits a seat; the player simply resumes with their own token.
  sock.on('disconnect', () => {
    clearInterval(iv);
    const r = rooms.get(sock.data?.code); const s = r?.seats[sock.data?.seat];
    if (r && s && s.sid === sock.id) { s.connected = false; s.sid = undefined; push(r); }
  });
});
server.listen(PORT, () => console.log(`Wizard Arcana on :${PORT}`));
const stop = async () => { await Promise.all([...rooms.values()].map((r) => save(r))); server.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
