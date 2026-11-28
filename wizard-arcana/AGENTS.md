# Wizard Arcana application

Read the [player guide](docs/how-to-play.md) before changing rules and the [architecture guide](docs/architecture.md) before changing rooms or saves.

- Use `src/shared/engine.ts` for rules and legal actions across all modes.
- Pass `view(state, seat)` to the online client and bots. Send each recipient their own hand and public game data. Keep seat tokens private.
- Keep older local saves and Redis rooms readable. A missing format field means Classic.
- Keep the hand out of the rendered UI until the next pass-and-play player reveals it. Check handoff on a narrow screen.
- Keep rank, suit labels, turn feedback, and scoring readable with sound muted and without relying on color.

Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` from this directory. With `npm start` running, use `node tests/smoke.mjs` to verify room creation, privacy, settings, reconnection, and seating.
