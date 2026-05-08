# Snooker Mate

Snooker Mate is a mobile-first scoring web app for friends, clubs, and practice nights. It is built as a static app that deploys cleanly to Cloudflare Pages and stores data locally in IndexedDB today, with a storage boundary that can be swapped for Cloudflare D1, KV, R2, or a Workers API later.

## Features

- Player management: add, edit, remove, and colour-code players.
- Game setup: Standard snooker or custom Century Mode, player selection, starting player, and best-of frame settings.
- One-tap scoring with large table-side ball controls:
  - Red = 1
  - Yellow = 2
  - Green = 3
  - Brown = 4
  - Blue = 5
  - Pink = 6
  - Black = 7
- Century Mode:
  - Supports 2+ players, including 3 or 4+ player games.
  - First player to reach 100 points wins.
  - Includes a special 10-point red plus normal snooker colours.
- Fouls, foul-and-miss/free-ball notes, miss/safety visits, undo, redo, player switching, manual score adjustment, frame ending, and next-frame creation.
- Live frame score, match score, current break, highest break, current player, leader, winner, and event log.
- Editable history workflow: reopen previous matches, undo/redo frame events, delete matches, and adjust scores.
- Player history with wins/losses, frame wins, highest breaks, dates, match scores, and head-to-head records.
- Seed/demo data for quick testing.

## Research and design notes

The app follows standard snooker scoring conventions: red and colours score 1-7, fouls award penalty points to the opponent with common quick values of 4-7, missed/non-scoring visits end the active break, frames roll up into match scores, and match history should preserve frame results and high breaks. The referenced Snooker Score app highlights useful table-side features such as current score, frame score, match/frame timing, points ahead/remaining, current break, balls potted, frame details, highest break, duration, saved match results, statistics, and quick player switching. Snooker Mate keeps the first release simple and fast while preserving an event log so more advanced rules automation can be layered in later.

## Local development

This project has no build step. Any static file server can run it.

```bash
npm install
npm run dev
```

Then open the URL printed by `serve`.

Alternative with Python:

```bash
python3 -m http.server 8788
```

Then open <http://localhost:8788>.

## Tests

```bash
npm test
```

The test suite validates the scoring reducer for pots, fouls, breaks, undo/redo, frame wins, and Century Mode auto-winner logic.

## Deploy to Cloudflare Pages

1. Push this repository to GitHub or GitLab.
2. In Cloudflare, create a Pages project connected to the repository.
3. Use these build settings:
   - Framework preset: `None`
   - Build command: leave empty
   - Build output directory: `/`
4. Deploy.

Because the app is plain static HTML/CSS/JavaScript, Cloudflare Pages can serve it without a bundler.

## Data storage

Current storage lives in `src/storage.js` using IndexedDB stores for:

- `players`
- `matches`
- `settings`

All match scoring is event-based. A match contains frames, frames contain events, and frame stats are recalculated from those events. That makes undo, redo, score edits, and future sync conflict handling easier.

## Future backend upgrade path

The UI talks to a small storage adapter rather than directly scattering persistence calls throughout the app. To add Cloudflare-backed sync later:

1. Create a Cloudflare Worker API with endpoints such as `/players`, `/matches`, and `/sync`.
2. Store relational match/player data in D1, or use KV for simple per-user blobs.
3. Add auth with Cloudflare Access, Turnstile, or a lightweight email magic-link provider.
4. Replace or wrap the functions in `src/storage.js` so they first write locally, then sync to the Worker.
5. Keep the event-log model for offline edits and use `updatedAt` timestamps or per-event IDs to merge changes.

## Project structure

```text
index.html              App shell
manifest.webmanifest    PWA metadata
styles.css              Mobile-first design system and components
src/app.js              UI rendering and interaction handlers
src/scoring.js          Scoring/event model and reducer helpers
src/storage.js          IndexedDB adapter and seed data
tests/scoring.test.js   Node-based scoring tests
```

## Notes for real-world play

Snooker rules have nuanced referee decisions around free balls, misses, replaced balls, concession, points remaining, and snookers required. This first release records those calls quickly and keeps scores editable, rather than trying to fully referee every edge case automatically.
