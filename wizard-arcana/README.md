# ✦ Wizard Arcana v3 — The Circle

A mobile-first, fan-made Wizard-style card game with **private online lobbies** (3–6 players) and **offline pass-and-play** for one shared device. The rules follow the two-page English Wizard rulebook (AMIGO, version 3.0) provided with the project.

**Important legal note:** This version includes 60 small card images cropped from a **photograph supplied by the user**. The photography and/or underlying original AMIGO card illustrations may be protected by copyright. Including them here does **not** grant rights to redistribute those images. Use this package only where you have permission; for a public or commercial deployment, obtain the appropriate artwork rights or replace the card images with your own licensed artwork. The application is not affiliated with AMIGO.

## Deploy from a phone: GitHub → Render

The ZIP is designed for your existing GitHub repository **`kingkar-bhowmick/wizard-arcana`**, where the application lives in a subfolder called `wizard-arcana`.

1. Upload `wizard-arcana-v3.zip` **as a single file** to the repository root on GitHub.
2. Open its GitHub Codespace and open **Terminal** (from repository root).
3. Run:

   ```bash
   unzip -o wizard-arcana-v3.zip
   git add -A
   git commit -m "Upgrade Wizard Arcana to v3"
   git push origin main
   ```

4. In Render, connect (or keep connected to) `kingkar-bhowmick/wizard-arcana`. If the service is already deployed, the new commit should trigger its automatic redeploy when Auto-Deploy is enabled. Otherwise choose **Manual Deploy → Deploy latest commit**.
5. For a **manual Render web service**, use these exact settings:

   | Setting | Value |
   | --- | --- |
   | Runtime | Node |
   | Branch | `main` |
   | **Root Directory** | **`wizard-arcana`** (no slash) |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Health Check Path | `/health` |

The ZIP also contains a **root-level `render.yaml`** for Render Blueprint deployment. Render may not automatically apply that file to an existing manually configured service, so confirm the Root Directory setting there.

## Start locally (laptop or GitHub Codespaces)

```bash
cd wizard-arcana
npm install
npm test
npm start
```

Open port 3000 (or use Codespaces' forwarded link). Render sets the `PORT` environment variable itself.

## Game features

- Original-type 60-card deck from the supplied reference photo: 1–13 in red/blue/green/yellow, 4 Wizards, 4 Jesters.
- Dark magical tabletop, card dealing glow animations, large touch targets, scrollable hand, scorepad/history, trump and bid controls, and sound toggle.
- Online private 6-character room code, direct invitation link, lobby, 3–6 seats, host controls, secure random resume tokens, and private hands.
- Refresh/reconnect fix: **online seats are saved in per-tab `sessionStorage`, not shared `localStorage`.** A second tab no longer automatically steals another tab's seat. Refresh of the same tab resumes the same seat.
- Server broadcasts state to all connected sockets for a given seat instead of replacing another socket with a hostile `sessionReplaced` event.
- Offline single-device pass-and-play with private handoff screen and automatic local save / resume after refresh; a cached Progressive Web App (PWA) can work without internet once loaded online and installed/cached.
- Correct scoring and trick behavior, including a special Wizard-led trick, a Jester-led trick, no-trump final round, and optional plus/minus-one bidding variant for offline.
- `npm test` runs 12 tests including full game simulations for 3, 4, 5, and 6 players.

### What offline does NOT mean

Offline means **one device passed between players**, not separate phones communicating with no network. For separate devices, use the online lobby hosted on Render, or host the server over a shared local Wi-Fi network.

### Rooms surviving Render restarts (optional Upstash Redis)

In-memory rooms survive ordinary page refreshes, network hiccups and reconnects, but **not** a server restart or Render redeployment. To preserve online game state across restarts, optionally provide these Render environment variables from your own Upstash Redis REST database:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The server saves room state under `wizard-arcana:ROOMCODE` with a 24-hour expiry after activity and restores a saved room when a player resumes. Seat tokens are random and should remain private. Do not commit Redis credentials to GitHub. Without these variables, the game works normally but rooms use server memory only.

### Troubleshooting

- **Render error `package.json not found`:** Set Render **Root Directory** to `wizard-arcana`, not `/wizard-arcana`.
- **First request takes time / room lost:** Free hosting can suspend/restart; Redis persistence is optional and helps after restart.
- **Another tab wants to play as a new person:** Open the invitation link in a new tab and **Join room** with a different name. New tabs use a separate seat token.
- **Same player refreshed:** Use the automatic reconnect or the **Reconnect to CODE** button.
- **Cards look old after deploying:** Hard-refresh your browser or close/reopen the PWA; the service worker cache updates as it detects the new release.
- **Offline mode doesn't load without internet:** Visit the site online once so the PWA service worker can cache its assets. Private browsing and cache clearing can prevent offline use.
- **Long games on a phone:** Scroll the hand horizontally to reach cards beyond the visible width.

## Commands

```bash
npm test     # Rule engine tests
npm run check # JavaScript syntax checks
npm start    # Node.js web server
```

## File layout

```text
wizard-arcana/
  engine.js            Shared rules engine (server + offline)
  server.js            Express + Socket.IO, optional Upstash Redis
  package.json
  public/
    index.html         Browser entry point
    style.css          Mobile-first fantasy UI
    app.js             All online/offline interactions
    sw.js              Offline cache
    manifest.webmanifest
    icon.svg
    assets/cards/      60 user-reference card images, WebP
  tests/               Rules + complete game simulations
render.yaml            Blueprint configuration at repository root
```

Source code offered for personal study and experimentation. Wizard is a game by Ken Fisher; the original product, marks, and illustrated card artwork belong to their respective owners.
