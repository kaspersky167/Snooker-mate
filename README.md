# Snooker Mate

Snooker Mate is a mobile-first scoring web app for friends, clubs, and practice nights. It deploys to Cloudflare Pages and now supports a shared Cloudflare D1-backed database through Pages Functions, while still using IndexedDB automatically for local development.

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
- Shared rooms: deployed Cloudflare Pages links use the same D1 database so friends can see the same players, matches, and history from any device.

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

## Deploy to Cloudflare Pages with shared storage

1. Push this repository to GitHub or GitLab.
2. In Cloudflare, create a Pages project connected to the repository.
3. Use these build settings:
   - Framework preset: `None`
   - Build command: leave empty
   - Build output directory: `/`
4. Create a Cloudflare D1 database for Snooker Mate.
5. In the Pages project, add a D1 binding named `DB` that points at that database. The Pages Function in `functions/api/[[path]].js` creates the `snooker_records` table automatically on first request.
6. Deploy.

Because the browser app is still plain static HTML/CSS/JavaScript, there is no bundler. The only server-side piece is the small Pages Function API used for shared D1 reads and writes.

## Data storage

Storage lives behind the adapter in `src/storage.js` and uses these logical stores:

- `players`
- `matches`
- `settings`
- `teams`

When the app runs on `localhost`, it uses IndexedDB so development works without a Cloudflare account. When the app runs on a deployed host, or when the URL includes `?room=...`, it uses the shared API at `/api/:room/:store` backed by Cloudflare D1. The default room is `main`, so sharing the normal deployed project link shows the same data to everyone. Use room links such as `https://your-site.pages.dev/?room=tuesday-club` if you want a separate shared history for a different group.

The app shows a storage banner near the top of the UI. In shared mode, use **Copy share link** and send that URL to friends so they join the same room. Add `?storage=local` to force IndexedDB on a deployed host for private testing.

All match scoring is event-based. A match contains frames, frames contain events, and frame stats are recalculated from those events. That makes undo, redo, score edits, and future sync conflict handling easier.

## Shared storage API

The Cloudflare Pages Function in `functions/api/[[path]].js` exposes:

- `GET /api/:room/:store` — list records.
- `PUT /api/:room/:store/:id` — upsert a record.
- `DELETE /api/:room/:store/:id` — delete one record.
- `DELETE /api/:room/:store` — clear a store in that room.

Only the known stores above are accepted, and room names are limited to lowercase letters, numbers, `_`, and `-`. For production clubs that need private data, add Cloudflare Access or another auth layer in front of the Pages project.

## Project structure

```text
index.html              App shell
manifest.webmanifest    PWA metadata
styles.css              Mobile-first design system and components
src/app.js              UI rendering and interaction handlers
src/scoring.js          Scoring/event model and reducer helpers
src/storage.js          IndexedDB/shared D1 storage adapter and seed data
functions/api/[[path]].js Cloudflare Pages Function for shared D1 storage
tests/scoring.test.js   Node-based scoring tests
```

## Notes for real-world play

Snooker rules have nuanced referee decisions around free balls, misses, replaced balls, concession, points remaining, and snookers required. This first release records those calls quickly and keeps scores editable, rather than trying to fully referee every edge case automatically.
