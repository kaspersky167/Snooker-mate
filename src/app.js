import {
  addFrame,
  applyEvent,
  ballSetForMode,
  createMatch,
  currentFrame,
  endCurrentFrame,
  frameScore,
  frameWins,
  getFrameLeader,
  matchSummary,
  redoEvent,
  undoEvent
} from "./scoring.js";
import { loadState, removeMatch, removePlayer, resetDemoData, saveMatch, savePlayer } from "./storage.js";

const app = document.querySelector("#app");
const state = {
  route: "score",
  players: [],
  matches: [],
  activeMatchId: null,
  selectedPlayerId: null,
  draft: { mode: "standard", playerIds: [], bestOf: 3, starterId: null }
};

const money = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const $ = (selector) => document.querySelector(selector);
const byId = (id) => state.players.find((player) => player.id === id);
const activeMatch = () => state.matches.find((match) => match.id === state.activeMatchId) ?? state.matches[0];
const matchPlayers = (match) => match?.playerIds.map((id) => byId(id) ?? match.playerSnapshots.find((p) => p.id === id)).filter(Boolean) ?? [];

init();

async function init() {
  Object.assign(state, await loadState());
  state.activeMatchId = state.matches[0]?.id ?? null;
  state.draft.playerIds = state.players.slice(0, 2).map((player) => player.id);
  state.draft.starterId = state.draft.playerIds[0] ?? null;
  render();
}

function render() {
  app.innerHTML = `
    <header class="hero">
      <div>
        <p class="eyebrow">Snooker Mate</p>
        <h1>Tap balls, track frames, settle bragging rights.</h1>
      </div>
      <button class="ghost" data-action="seed">Reset demo data</button>
    </header>
    <nav class="tabs" aria-label="Main sections">
      ${tab("score", "Score")}${tab("setup", "New game")}${tab("players", "Players")}${tab("history", "History")}${tab("stats", "Stats")}
    </nav>
    <main>${section()}</main>`;
  bindGlobal();
}

function tab(route, label) {
  return `<button class="tab ${state.route === route ? "active" : ""}" data-route="${route}">${label}</button>`;
}

function section() {
  if (state.route === "setup") return setupView();
  if (state.route === "players") return playersView();
  if (state.route === "history") return historyView();
  if (state.route === "stats") return statsView();
  return scoreView();
}

function scoreView() {
  const match = activeMatch();
  if (!match) return emptyCard("No match yet", "Create a game to start scoring around the table.");
  const frame = currentFrame(match);
  const players = matchPlayers(match);
  const current = players[frame.currentPlayerIndex] ?? players[0];
  const wins = frameWins(match);
  const balls = ballSetForMode(match.mode);
  const leader = getFrameLeader(frame, players);
  const target = match.mode === "century" ? `<div class="target">Century target: first to 100</div>` : `<div class="target">Best of ${match.bestOf} · race to ${match.raceTo}</div>`;

  return `<section class="score-grid">
    <article class="scoreboard card">
      <div class="score-topline">
        <span class="pill">${match.mode === "century" ? "Century Mode" : "Standard snooker"}</span>
        ${target}
      </div>
      <div class="player-scores">
        ${players
          .map((player, index) => {
            const stat = frame.playerStats[player.id];
            const pct = match.mode === "century" ? Math.min(100, stat.points) : Math.min(100, stat.points / Math.max(1, frameScore(frame, leader.id)) * 100);
            return `<button class="player-score ${index === frame.currentPlayerIndex ? "shooting" : ""}" data-action="switch" data-index="${index}">
              <span class="avatar" style="--avatar:${player.colour ?? "#14b8a6"}">${initials(player.name)}</span>
              <span><strong>${player.name}</strong><small>${wins[player.id] ?? 0} frame wins · HB ${stat.highestBreak}</small></span>
              <b>${stat.points}</b>
              <i style="width:${pct}%"></i>
            </button>`;
          })
          .join("")}
      </div>
      <div class="live-meta">
        <div><span>At table</span><strong>${current?.name ?? "—"}</strong></div>
        <div><span>Current break</span><strong>${frame.playerStats[current?.id]?.currentBreak ?? 0}</strong></div>
        <div><span>Highest break</span><strong>${Math.max(...players.map((p) => frame.playerStats[p.id]?.highestBreak ?? 0))}</strong></div>
        <div><span>Leader</span><strong>${leader?.name ?? "—"}</strong></div>
      </div>
    </article>

    <article class="card controls">
      <h2>One-tap scoring</h2>
      <div class="ball-grid">
        ${balls.map((ball) => `<button class="ball ${ball.className}" data-action="pot" data-ball="${ball.key}" data-points="${ball.value}"><span>${ball.value}</span><small>${ball.label}</small></button>`).join("")}
      </div>
      <div class="quick-actions">
        <button data-action="foul" data-points="4">Foul +4</button>
        <button data-action="foul" data-points="5">Foul +5</button>
        <button data-action="foul" data-points="6">Foul +6</button>
        <button data-action="foul" data-points="7">Foul +7</button>
        <button data-action="miss">Miss / safety</button>
        <button data-action="freeball">Free ball note</button>
      </div>
      <form class="manual" data-form="adjust">
        <input name="points" type="number" placeholder="± points" required />
        <button>Manual adjust</button>
      </form>
      <div class="undo-row">
        <button class="ghost" data-action="undo">Undo</button>
        <button class="ghost" data-action="redo">Redo</button>
        <button class="danger" data-action="end-frame">End frame</button>
        <button class="ghost" data-action="new-frame">Next frame</button>
      </div>
    </article>

    <article class="card log-card">
      <h2>Frame event log</h2>
      <div class="event-log">${eventLog(match, frame, players)}</div>
    </article>
  </section>`;
}

function setupView() {
  const canCentury = state.draft.playerIds.length >= 2;
  return `<section class="card setup">
    <h2>Start a game</h2>
    <label>Game type
      <select id="mode">
        <option value="standard" ${state.draft.mode === "standard" ? "selected" : ""}>Standard snooker</option>
        <option value="century" ${state.draft.mode === "century" ? "selected" : ""}>Century Mode (2+ players, first to 100)</option>
      </select>
    </label>
    <label>Best of frames
      <input id="bestOf" type="number" min="1" step="2" value="${state.draft.mode === "century" ? 1 : state.draft.bestOf}" ${state.draft.mode === "century" ? "disabled" : ""} />
    </label>
    <div class="picker">
      <h3>Choose players</h3>
      ${state.players.map((player) => `<label class="check"><input type="checkbox" value="${player.id}" ${state.draft.playerIds.includes(player.id) ? "checked" : ""} /> ${player.name}<small>${player.nickname ?? ""}</small></label>`).join("")}
    </div>
    <label>Starting player
      <select id="starter">${state.draft.playerIds.map((id) => `<option value="${id}" ${state.draft.starterId === id ? "selected" : ""}>${byId(id)?.name}</option>`).join("")}</select>
    </label>
    <button class="primary" data-action="create-match" ${canCentury ? "" : "disabled"}>Create match</button>
  </section>`;
}

function playersView() {
  return `<section class="split">
    <form class="card" data-form="player">
      <h2>${state.selectedPlayerId ? "Edit player" : "Add player"}</h2>
      ${playerFormFields(state.selectedPlayerId ? byId(state.selectedPlayerId) : {})}
      <button class="primary">Save player</button>
      ${state.selectedPlayerId ? `<button type="button" class="ghost" data-action="clear-player">Cancel edit</button>` : ""}
    </form>
    <div class="card list"><h2>Players</h2>${state.players.map(playerCard).join("")}</div>
  </section>`;
}

function historyView() {
  return `<section class="card history"><h2>Match history</h2>${state.matches.map((match) => {
    const players = matchPlayers(match);
    const summary = matchSummary(match);
    return `<article class="history-item">
      <div><strong>${players.map((p) => p.name).join(" vs ")}</strong><small>${money.format(new Date(match.createdAt))} · ${match.mode}</small></div>
      <div>${players.map((p) => `${p.name} ${summary.wins[p.id] ?? 0}`).join(" · ")}</div>
      <div>Winner: <b>${byId(summary.winnerId)?.name ?? "In progress"}</b> · High breaks ${players.map((p) => `${p.name}: ${summary.highBreaks[p.id]}`).join(", ")}</div>
      <button data-action="load-match" data-id="${match.id}">Open</button><button class="danger" data-action="delete-match" data-id="${match.id}">Delete</button>
    </article>`;
  }).join("")}</section>`;
}

function statsView() {
  const rows = state.players.map((player) => {
    const matches = state.matches.filter((match) => match.playerIds.includes(player.id));
    const wins = matches.filter((match) => match.winnerId === player.id).length;
    const frameWinsCount = matches.reduce((sum, match) => sum + match.frames.filter((frame) => frame.winnerId === player.id).length, 0);
    const highBreak = Math.max(0, ...matches.flatMap((match) => match.frames.map((frame) => frame.playerStats[player.id]?.highestBreak ?? 0)));
    const head = state.players.filter((opponent) => opponent.id !== player.id).map((opponent) => {
      const played = matches.filter((match) => match.playerIds.includes(opponent.id));
      const won = played.filter((match) => match.winnerId === player.id).length;
      return `${opponent.name}: ${won}-${played.length - won}`;
    }).join(" · ");
    return `<article class="stat-row"><span class="avatar" style="--avatar:${player.colour}">${initials(player.name)}</span><div><strong>${player.name}</strong><small>${matches.length} matches · ${wins} wins · ${frameWinsCount} frames · HB ${highBreak}</small><em>${head || "No head-to-head yet"}</em></div></article>`;
  });
  return `<section class="card"><h2>Player history & head-to-head</h2>${rows.join("")}</section>`;
}

function emptyCard(title, text) {
  return `<section class="card empty"><h2>${title}</h2><p>${text}</p><button class="primary" data-route="setup">Create a game</button></section>`;
}

function playerFormFields(player = {}) {
  return `<input name="id" type="hidden" value="${player.id ?? ""}" />
    <label>Name<input name="name" required value="${player.name ?? ""}" /></label>
    <label>Nickname<input name="nickname" value="${player.nickname ?? ""}" /></label>
    <label>Colour<input name="colour" type="color" value="${player.colour ?? "#14b8a6"}" /></label>`;
}

function playerCard(player) {
  return `<article class="player-card"><span class="avatar" style="--avatar:${player.colour}">${initials(player.name)}</span><div><strong>${player.name}</strong><small>${player.nickname ?? ""}</small></div><button data-action="edit-player" data-id="${player.id}">Edit</button><button class="danger" data-action="delete-player" data-id="${player.id}">Remove</button></article>`;
}

function eventLog(match, frame, players) {
  if (!frame.events.length) return `<p class="muted">No events yet. Tap a ball to start the break.</p>`;
  return frame.events.slice().reverse().map((event) => {
    const player = players.find((p) => p.id === event.playerId);
    const label = event.type === "pot" ? `${event.ball} +${event.points}` : event.type === "foul" ? `foul +${event.points}${event.miss ? " and miss" : ""}${event.freeBall ? " · free ball" : ""}` : event.type === "adjust" ? `manual ${event.points > 0 ? "+" : ""}${event.points}` : event.type;
    return `<div class="event"><span>${player?.name ?? "Unknown"}</span><b>${label}</b><small>${new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>`;
  }).join("");
}

function bindGlobal() {
  app.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { state.route = button.dataset.route; render(); }));
  app.onclick = handleClick;
  app.querySelector("[data-form='player']")?.addEventListener("submit", handlePlayerSave);
  app.querySelector("[data-form='adjust']")?.addEventListener("submit", handleAdjust);
  app.querySelector("#mode")?.addEventListener("change", (event) => { state.draft.mode = event.target.value; render(); });
  app.querySelector("#bestOf")?.addEventListener("input", (event) => { state.draft.bestOf = Number(event.target.value) || 1; });
  app.querySelectorAll(".check input").forEach((input) => input.addEventListener("change", () => {
    state.draft.playerIds = [...app.querySelectorAll(".check input:checked")].map((item) => item.value);
    state.draft.starterId = state.draft.playerIds.includes(state.draft.starterId) ? state.draft.starterId : state.draft.playerIds[0];
    render();
  }));
  app.querySelector("#starter")?.addEventListener("change", (event) => { state.draft.starterId = event.target.value; });
}

async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  const match = activeMatch();
  const frame = match && currentFrame(match);
  const current = match && match.playerIds[frame.currentPlayerIndex];

  if (action === "seed") { await resetDemoData(); Object.assign(state, await loadState()); state.activeMatchId = state.matches[0]?.id; render(); }
  if (action === "pot") await updateMatch(applyEvent(match, { type: "pot", playerId: current, points: Number(button.dataset.points), ball: button.dataset.ball }));
  if (action === "foul") await updateMatch(applyEvent(match, { type: "foul", playerId: current, points: Number(button.dataset.points), awardedToId: opponentForFoul(match, current) }));
  if (action === "miss") await updateMatch(applyEvent(match, { type: "miss", playerId: current }));
  if (action === "freeball") await updateMatch(applyEvent(match, { type: "foul", playerId: current, points: 4, awardedToId: opponentForFoul(match, current), miss: true, freeBall: true }));
  if (action === "switch") await updateMatch(applyEvent(match, { type: "switch", playerId: current, toIndex: Number(button.dataset.index) }));
  if (action === "undo") await updateMatch(undoEvent(match));
  if (action === "redo") await updateMatch(redoEvent(match));
  if (action === "end-frame") await updateMatch(endCurrentFrame(match, getFrameLeader(frame, matchPlayers(match)).id));
  if (action === "new-frame") await updateMatch(addFrame(match, matchPlayers(match)));
  if (action === "create-match") await createNewMatch();
  if (action === "edit-player") { state.selectedPlayerId = button.dataset.id; render(); }
  if (action === "clear-player") { state.selectedPlayerId = null; render(); }
  if (action === "delete-player") { await removePlayer(button.dataset.id); Object.assign(state, await loadState()); render(); }
  if (action === "load-match") { state.activeMatchId = button.dataset.id; state.route = "score"; render(); }
  if (action === "delete-match") { await removeMatch(button.dataset.id); Object.assign(state, await loadState()); state.activeMatchId = state.matches[0]?.id; render(); }
}

async function handlePlayerSave(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await savePlayer(data);
  Object.assign(state, await loadState());
  state.selectedPlayerId = null;
  render();
}

async function handleAdjust(event) {
  event.preventDefault();
  const match = activeMatch();
  const frame = currentFrame(match);
  const playerId = match.playerIds[frame.currentPlayerIndex];
  const points = Number(new FormData(event.currentTarget).get("points"));
  await updateMatch(applyEvent(match, { type: "adjust", playerId, points }));
}

async function createNewMatch() {
  const players = state.draft.playerIds.map(byId).filter(Boolean);
  if (players.length < 2) return;
  const bestOf = state.draft.mode === "century" ? 1 : nearestOdd(state.draft.bestOf);
  const match = createMatch({ players, mode: state.draft.mode, bestOf, raceTo: Math.floor(bestOf / 2) + 1, starterIndex: Math.max(0, state.draft.playerIds.indexOf(state.draft.starterId)) });
  await saveMatch(match);
  Object.assign(state, await loadState());
  state.activeMatchId = match.id;
  state.route = "score";
  render();
}

async function updateMatch(match) {
  await saveMatch(match);
  const index = state.matches.findIndex((item) => item.id === match.id);
  if (index >= 0) state.matches[index] = match;
  state.activeMatchId = match.id;
  render();
}

function opponentForFoul(match, currentId) {
  return match.playerIds[(match.playerIds.indexOf(currentId) + 1) % match.playerIds.length];
}

function nearestOdd(value) {
  const number = Math.max(1, Number(value) || 1);
  return number % 2 ? number : number + 1;
}

function initials(name = "?") {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
