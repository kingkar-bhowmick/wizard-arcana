# 🧙 Wizard Arcana — Online & Offline Friends Game

A mobile-first fan-made implementation of the Wizard trick-taking card game. **Not affiliated with or endorsed by AMIGO.** Uses original CSS card designs, emoji and system fonts, not copyrighted game illustrations.

## Fastest deployment from a phone (GitHub → Render)

1. Download and unzip `wizard-arcana.zip` to your phone.
2. In the GitHub app or mobile browser, create a **new repository** (e.g. `wizard-arcana`). Upload **the contents** of the `wizard-arcana` folder, not the ZIP itself. You can also upload from a laptop using Git.
3. Sign in at [Render](https://dashboard.render.com/) → **New** → **Web Service** → connect your GitHub repository.
4. Runtime: **Node**; Build command: `npm install`; Start command: `npm start`; choose an available plan (Render's free tier, if offered). `render.yaml` is also included for a Blueprint deployment.
5. Deploy and open the `https://...onrender.com` link. Create a room, share its code, and ask friends to open the same link.

> **Important:** This package cannot itself push to your GitHub account or deploy without your authorization. You must connect GitHub and Render. On Render's free instances, idle sleeping may cause initial wake-up delays. **In-memory rooms are lost if the server restarts, redeploys or sleeps.** Keep one instance; multi-instance deployments need shared storage/Redis. The server is intended for small private friend groups, not public production scale.

### Running locally on laptop

```bash
npm install
npm start
```

Open http://localhost:3000. For online play, the server needs a publicly accessible HTTPS URL.

### Offline mode on phone

Visit the deployed site once while connected. The service worker caches the app files. After that, use **Offline pass & play** on the same device even without internet. Offline mode does **not** synchronize across separate phones; no internet and no local server are required for single-device play. Browser cache clearing or private mode may remove offline support. Offline games do not survive closing/reloading the page.

### Online features

- 6-character room codes, invite sharing, 3–6 players
- Private hands sent only to the corresponding socket
- Secure reconnect token stored on each player's device
- Dealer selection, trump selection, bidding, trick validation and scoring
- Host advances rounds; reconnect after temporary network loss
- Optional plus/minus-one bidding variant for offline games

### Rules

Based on the supplied two-page English AMIGO rulebook: 60 cards (four suits 1–13, four Wizards, four Jesters), increasing hand size, clockwise turns, trump determination, following suit, first Wizard wins, Jester special cases, +20 +10 per correctly predicted trick or -10 per difference, 60/player-count rounds. Optional variant prevents total bids equaling available tricks. The online game uses standard bidding; offline offers the optional variant.

### Limitations and future upgrades

- Online game state is **in RAM only**; no database yet.
- No user accounts, public matchmaking, bots, or spectators.
- Offline is pass-and-play **one device**, not cross-device local Wi-Fi.
- Card artwork is original stylized UI with emoji; custom illustrations can be added later.
- No persistence for offline matches or browser refresh.
- No deployment was performed as part of this ZIP.

## License

Source code provided for personal/private use. The original Wizard game's trademarks and rules remain with their respective owners. Avoid presenting this as an official Wizard product.
