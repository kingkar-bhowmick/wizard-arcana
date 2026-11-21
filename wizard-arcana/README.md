# Wizard Arcana

Multiplayer Wizard card game (3–6 players). Online (Socket.IO, server-authoritative) + offline pass-and-play.

## Deploy to Render (phone friendly)
1. Push this repo to GitHub (`kingkar-bhowmick/wizard-arcana`).
2. Render dashboard → **New → Blueprint** → select the repo (uses `render.yaml`), or **New → Web Service** with
   Build: `npm install && npm run build`, Start: `npm start`, Health check: `/health`.
3. Open the Render URL, create a room, share the invite link.

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| `PORT` | auto (Render sets it) | HTTP + WebSocket port |
| `REDIS_URL` | optional | Persists rooms/games across restarts. Without it, games live in memory and are LOST on restart/redeploy. Use Render Key Value or Upstash and paste its URL. |

`/health` returns `{ok, rooms, persistent}` — `persistent:true` means Redis is active.

## Develop / test
```
npm install
npm test            # 18 engine tests
npm run build && npm start
```

## How reconnection works
Each seat has its own random token stored in **sessionStorage (per tab)**, so two tabs/players in one browser never replace each other. Refresh or app-switch → client re-sends `resume` with the token; disconnect never forfeits a seat (30 s ping timeout, no seat removal). Server sends the latest authoritative state with only that seat's hand.

## Known limitations (honest list)
- Card art is procedural placeholder (colour + glyph), not illustrated; no animations/sound yet.
- No Tailwind (plain CSS), no PWA/service worker, offline progress uses localStorage (not IndexedDB). Offline pass-and-play needs the page loaded once; it is not cached for cold start offline.
- Closing a tab loses that tab's seat token (sessionStorage); rejoin is not possible from a fresh tab.
- Only engine unit tests + one socket smoke test; no browser E2E, no device testing.
