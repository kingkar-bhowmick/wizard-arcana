# Architecture

| Entry point | Responsibility |
| --- | --- |
| `src/shared/engine.ts` | Deck, deals, turn validation, scoring, seat-specific views |
| `src/shared/bot.ts` | Bot actions based on one seat’s view and legal moves |
| `src/client/App.tsx` | Mode selection, navigation, and the in-game rules |
| `src/client/Game.tsx` | Shared table, hand, turn controls, results, and scorecard |
| `src/client/Online.tsx` | Room entry, lobby, invitations, seat resume, Socket.IO commands |
| `src/client/Local.tsx` | Pass-and-play privacy, local saves, solo bot turns |
| `src/client/Card.tsx`, `src/client/style.css` | Card faces, suit indicators, layout, and responsive styles |
| `src/client/sound.ts` | Browser-generated cues for selections, bids, plays, and results |
| `server/index.ts` | Static serving, room membership, authoritative online actions, optional Redis |

## Actions and visibility

The engine takes a seat, an action type (`trump`, `bid`, or `play`), and a numeric value. It rejects invalid actions before changing state. New matches take an optional format and plus/minus flag. A missing format is Classic for compatibility with existing saved matches.

Online, the server maps a connected socket to its seat and publishes `view(state, seat)` containing only that seat’s hand, the other hand counts, and public game fields. Room snapshots and resume tokens stay server-side. The browser stores its own token in session storage. A disconnected seat remains reserved, and a successful resume replaces that seat’s old socket.

Local modes use the same rules. Pass & play hides hands between distinct seats. Solo creates a seat-specific view for each bot and schedules its action after a brief delay. Local snapshots are saved under `wa:off` for pass & play and `wa:solo` for solo.

## Verify changes

Run the checks from the [README](../README.md). For gameplay changes, complete a Quick match, check that the standings agree with round scores, and try the plus/minus restriction. For room changes, exercise create, invite, leave, reconnect, and rematch. For UI changes, check a narrow viewport with all six seats, a hand that scrolls, keyboard card selection, and the sound toggle.

## Artwork and audio

`public/art/` contains original generated illustrations used in the home scene and on the Wizard and Jester cards. Numbered cards use CSS borders and suit symbols with readable rank labels. Web Audio synthesizes the cues, so there are no audio downloads or third-party card requests during play.

The card and home illustrations were generated together with the built-in imagegen tool and cropped into `observatory.jpg`, `wizard.jpg`, and `jester.jpg`.

> Create one landscape triptych illustration texture atlas for the original indie card game Wizard Arcana. EXACTLY three equal vertical panels touching side to side with straight vertical boundaries at thirds, each panel filled edge-to-edge with a distinct separate tarot-inspired scene in richly layered vintage ink etching / oil painting. LEFT: twilight indigo mountain observatory and a luminous full moon over alpine woods. MIDDLE: a mysterious gold-embroidered hooded wizard, back to viewer, raising a staff into a large luminous copper-gold celestial armillary under starry midnight violet sky, single strong focal point. RIGHT: a masked violet-and-rose jester with ornate cap and a crescent moon amid rolling dark clouds. Overall palette near-black navy and violet, soft antique gold, warm cream highlights, mysterious and dramatic. Desktop background and playable deck artwork, clear shapes at small size. No frames, no card borders, no letters, no numbers, no text, no watermark. Keep the subject of each panel within the middle 70% of its third.
