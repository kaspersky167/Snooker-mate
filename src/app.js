import {
  addFrame,
  applyEvent,
  ballSetForMode,
  createMatch,
  currentFrame,
  endCurrentFrame,
  endMatch,
  frameScore,
  frameWins,
  getFrameLeader,
  matchSummary,
  redoEvent,
  undoEvent
} from "./scoring.js";
import { loadState, removeMatch, removePlayer, removeTeam, resetDemoData, saveMatch, savePlayer, saveTeam, storageInfo } from "./storage.js";

const app = document.querySelector("#app");
const characters = [
  { id: "rocket", name: "Rocket", emoji: "🚀" },
  { id: "wizard", name: "Cue Wizard", emoji: "🧙" },
  { id: "queen", name: "Potting Queen", emoji: "👑" },
  { id: "shark", name: "Table Shark", emoji: "🦈" },
  { id: "dragon", name: "Break Dragon", emoji: "🐉" },
  { id: "ninja", name: "Safety Ninja", emoji: "🥷" }
];
const trophies = ["🏆", "🥇", "🎯", "🔥", "🧊", "🛡️", "🪄", "😂"];
const state = {
  route: "score",
  players: [],
  teams: [],
  matches: [],
  activeMatchId: null,
  selectedPlayerId: null,
  selectedTeamId: null,
  notice: "",
  transition: 0,
  storage: storageInfo(),
  draft: { mode: "standard", playerIds: [], bestOf: 3, starterId: null, teamId: "" }
};

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const byId = (id) => state.players.find((player) => player.id === id);
const teamById = (id) => state.teams.find((team) => team.id === id);
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
        <h1>Score faster, celebrate louder, never wonder what just happened.</h1>
      </div>
      <button class="ghost" data-action="seed">Reset demo data</button>
    </header>
    <nav class="tabs" aria-label="Main sections">
      ${tab("score", "Score")}${tab("setup", "New game")}${tab("players", "Players")}${tab("teams", "Teams")}${tab("history", "History")}${tab("stats", "Stats")}
    </nav>
    ${storageBanner()}
    ${state.notice ? `<div class="toast" role="status">${state.notice}</div>` : ""}
    <main class="page-pop" data-transition="${state.transition}">${section()}</main>`;
  bindGlobal();
}


function storageBanner() {
  if (state.storage.type === "remote") {
    return `<aside class="sync-banner card"><div><strong>Shared database is on</strong><span>${state.storage.label}. Send this link to friends and everyone will see the same players, matches, and history.</span></div><button class="ghost" data-action="copy-share">Copy share link</button></aside>`;
  }
  return `<aside class="sync-banner local card"><div><strong>Local browser storage</strong><span>Running locally with IndexedDB. Deploy to Cloudflare Pages with a D1 binding named DB, then share a room link for synced history.</span></div></aside>`;
}

function tab(route, label) {
  return `<button class="tab ${state.route === route ? "active" : ""}" data-route="${route}">${label}</button>`;
}

function section() {
  if (state.route === "setup") return setupView();
  if (state.route === "players") return playersView();
  if (state.route === "teams") return teamsView();
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
  const winner = match.winnerId ? players.find((player) => player.id === match.winnerId) : null;
  const target = match.mode === "century" ? "Century target: first to 100" : `Best of ${match.bestOf} · race to ${match.raceTo}`;

  return `<section class="score-grid">
    <article class="scoreboard card">
      <div class="score-topline">
        <span class="pill">${match.mode === "century" ? "Century Mode" : "Standard snooker"}</span>
        <div class="target">${target}</div>
        ${winner ? `<div class="winner-banner">🏆 ${winner.name} won this match</div>` : ""}
      </div>
      <div class="player-scores">
        ${players.map((player, index) => {
          const stat = frame.playerStats[player.id] ?? { points: 0, highestBreak: 0, currentBreak: 0 };
          const pct = match.mode === "century" ? Math.min(100, stat.points) : Math.min(100, stat.points / Math.max(1, frameScore(frame, leader.id)) * 100);
          return `<button class="player-score ${index === frame.currentPlayerIndex ? "shooting" : ""}" data-action="switch" data-index="${index}">
            ${characterAvatar(player, "big")}
            <span><strong>${player.name}</strong><small>${wins[player.id] ?? 0} frame wins · HB ${stat.highestBreak} · ${frame.endedAt && frame.winnerId === player.id ? "Frame winner 🏆" : "tap to put at table"}</small></span>
            <b>${stat.points}</b>
            <i style="width:${pct}%"></i>
          </button>`;
        }).join("")}
      </div>
      <div class="live-meta">
        <div><span>At table</span><strong>${current?.name ?? "—"}</strong></div>
        <div><span>Current break</span><strong>${frame.playerStats[current?.id]?.currentBreak ?? 0}</strong></div>
        <div><span>Highest break</span><strong>${Math.max(...players.map((p) => frame.playerStats[p.id]?.highestBreak ?? 0))}</strong></div>
        <div><span>Frame status</span><strong>${frame.endedAt ? "Saved" : `${leader?.name ?? "—"} leads`}</strong></div>
      </div>
    </article>

    <article class="card controls">
      <h2>One-tap scoring</h2>
      <p class="hint">Pot adds to the player at table. Fouls award points to the next player. Big actions ask before saving.</p>
      <div class="ball-grid">
        ${balls.map((ball) => `<button class="ball ${ball.className}" data-action="pot" data-ball="${ball.key}" data-points="${ball.value}" ${match.winnerId ? "disabled" : ""}><span>${ball.value}</span><small>${ball.label}</small></button>`).join("")}
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
        <button class="danger" data-action="end-match">End game</button>
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
  const canCreate = state.draft.playerIds.length >= 2;
  return `<section class="card setup">
    <h2>Start a game</h2>
    <p class="hint">Pick a team to quickly add its players, or choose any players manually.</p>
    <label>Game type
      <select id="mode">
        <option value="standard" ${state.draft.mode === "standard" ? "selected" : ""}>Standard snooker</option>
        <option value="century" ${state.draft.mode === "century" ? "selected" : ""}>Century Mode (2+ players, first to 100)</option>
      </select>
    </label>
    <label>Best of frames
      <input id="bestOf" type="number" min="1" step="2" value="${state.draft.mode === "century" ? 1 : state.draft.bestOf}" ${state.draft.mode === "century" ? "disabled" : ""} />
    </label>
    <label>Add a team
      <select id="teamQuick"><option value="">Choose team preset…</option>${state.teams.map((team) => `<option value="${team.id}" ${state.draft.teamId === team.id ? "selected" : ""}>${team.name}</option>`).join("")}</select>
    </label>
    <div class="picker">
      <h3>Choose players</h3>
      ${state.players.map((player) => `<label class="check">${characterAvatar(player)}<input type="checkbox" value="${player.id}" ${state.draft.playerIds.includes(player.id) ? "checked" : ""} /> <span>${player.name}<small>${player.nickname ?? ""}</small></span></label>`).join("")}
    </div>
    <label>Starting player
      <select id="starter">${state.draft.playerIds.map((id) => `<option value="${id}" ${state.draft.starterId === id ? "selected" : ""}>${byId(id)?.name}</option>`).join("")}</select>
    </label>
    <button class="primary" data-action="create-match" ${canCreate ? "" : "disabled"}>Create match</button>
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

function teamsView() {
  return `<section class="split">
    <form class="card" data-form="team">
      <h2>${state.selectedTeamId ? "Edit team" : "Create team"}</h2>
      ${teamFormFields(state.selectedTeamId ? teamById(state.selectedTeamId) : {})}
      <button class="primary">Save team</button>
      ${state.selectedTeamId ? `<button type="button" class="ghost" data-action="clear-team">Cancel edit</button>` : ""}
    </form>
    <div class="card list"><h2>Teams</h2>${state.teams.map(teamCard).join("") || `<p class="muted">No teams yet. Create your first doubles crew.</p>`}</div>
  </section>`;
}

function historyView() {
  return `<section class="card history"><h2>Match history</h2>${state.matches.map((match) => {
    const players = matchPlayers(match);
    const summary = matchSummary(match);
    const winnerName = players.find((player) => player.id === summary.winnerId)?.name ?? "In progress";
    return `<article class="history-item">
      <div><strong>${players.map((p) => p.name).join(" vs ")}</strong><small>${dateFormat.format(new Date(match.createdAt))} · ${match.mode}</small></div>
      <div>${players.map((p) => `${p.name} ${summary.wins[p.id] ?? 0}`).join(" · ")}</div>
      <div>${summary.winnerId ? "🏆" : "⏳"} Winner: <b>${winnerName}</b> · High breaks ${players.map((p) => `${p.name}: ${summary.highBreaks[p.id]}`).join(", ")}</div>
      <button data-action="load-match" data-id="${match.id}">Open</button><button class="danger" data-action="delete-match" data-id="${match.id}">Delete</button>
    </article>`;
  }).join("")}</section>`;
}

function statsView() {
  const profiles = state.players.map(playerStats).sort((a, b) => b.winRate - a.winRate || b.highBreak - a.highBreak);
  const totalFrames = state.matches.reduce((sum, match) => sum + match.frames.length, 0);
  const biggestBreak = profiles[0]?.highBreak ? profiles.reduce((best, item) => item.highBreak > best.highBreak ? item : best, profiles[0]) : null;
  const funniest = profiles.reduce((best, item) => item.fouls > best.fouls ? item : best, profiles[0] ?? { fouls: 0, name: "—" });
  return `<section class="stats-page">
    <article class="card stat-hero">
      <h2>Trophy cabinet</h2>
      <div class="trophy-grid">
        ${award("🏆", "Table boss", profiles[0]?.name ?? "Play more matches", `${Math.round(profiles[0]?.winRate ?? 0)}% match win rate`)}
        ${award("🔥", "Break beast", biggestBreak?.name ?? "No breaks yet", `Highest break ${biggestBreak?.highBreak ?? 0}`)}
        ${award("😂", "Foul goblin", funniest?.name ?? "No fouls yet", `${funniest?.fouls ?? 0} recorded fouls`)}
        ${award("🎱", "Club activity", `${state.matches.length} matches`, `${totalFrames} frames logged`)}
      </div>
    </article>
    <article class="card"><h2>Useful + silly stats</h2>${profiles.map((profile, index) => statCard(profile, index)).join("")}</article>
    <article class="card"><h2>Team corner</h2>${teamStats().join("") || `<p class="muted">Create teams to see combined records.</p>`}</article>
  </section>`;
}

function emptyCard(title, text) {
  return `<section class="card empty"><h2>${title}</h2><p>${text}</p><button class="primary" data-route="setup">Create a game</button></section>`;
}

function playerFormFields(player = {}) {
  const selected = player.character ?? "rocket";
  return `<input name="id" type="hidden" value="${player.id ?? ""}" />
    <label>Name<input name="name" required value="${player.name ?? ""}" /></label>
    <label>Nickname<input name="nickname" value="${player.nickname ?? ""}" /></label>
    <label>Colour<input name="colour" type="color" value="${player.colour ?? "#14b8a6"}" /></label>
    <label>Animated character<select name="character">${characters.map((character) => `<option value="${character.id}" ${selected === character.id ? "selected" : ""}>${character.emoji} ${character.name}</option>`).join("")}</select></label>
    <div class="character-picker">${characters.map((character) => `<span class="mini-character">${character.emoji}</span>`).join("")}</div>`;
}

function teamFormFields(team = {}) {
  return `<input name="id" type="hidden" value="${team.id ?? ""}" />
    <label>Team name<input name="name" required value="${team.name ?? ""}" /></label>
    <label>Team colour<input name="colour" type="color" value="${team.colour ?? "#24d18f"}" /></label>
    <div class="picker"><h3>Members</h3>${state.players.map((player) => `<label class="check">${characterAvatar(player)}<input name="playerIds" type="checkbox" value="${player.id}" ${(team.playerIds ?? []).includes(player.id) ? "checked" : ""} /> <span>${player.name}<small>${player.nickname ?? ""}</small></span></label>`).join("")}</div>`;
}

function playerCard(player) {
  return `<article class="player-card">${characterAvatar(player, "big")}<div><strong>${player.name}</strong><small>${player.nickname ?? ""} · ${characterFor(player).name}</small></div><button data-action="edit-player" data-id="${player.id}">Edit</button><button class="danger" data-action="delete-player" data-id="${player.id}">Remove</button></article>`;
}

function teamCard(team) {
  const members = team.playerIds.map(byId).filter(Boolean);
  return `<article class="player-card"><span class="team-badge" style="--avatar:${team.colour}">👥</span><div><strong>${team.name}</strong><small>${members.map((player) => player.name).join(", ") || "No members yet"}</small></div><button data-action="edit-team" data-id="${team.id}">Edit</button><button class="danger" data-action="delete-team" data-id="${team.id}">Remove</button></article>`;
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
  app.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { state.route = button.dataset.route; state.transition += 1; render(); }));
  app.onclick = handleClick;
  app.querySelector("[data-form='player']")?.addEventListener("submit", handlePlayerSave);
  app.querySelector("[data-form='team']")?.addEventListener("submit", handleTeamSave);
  app.querySelector("[data-form='adjust']")?.addEventListener("submit", handleAdjust);
  app.querySelector("#mode")?.addEventListener("change", (event) => { state.draft.mode = event.target.value; render(); });
  app.querySelector("#bestOf")?.addEventListener("input", (event) => { state.draft.bestOf = Number(event.target.value) || 1; });
  app.querySelector("#teamQuick")?.addEventListener("change", handleTeamQuickPick);
  app.querySelectorAll(".check input[type='checkbox']:not([name='playerIds'])").forEach((input) => input.addEventListener("change", () => {
    state.draft.playerIds = [...app.querySelectorAll(".check input[type='checkbox']:not([name='playerIds']):checked")].map((item) => item.value);
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

  if (action === "seed") { await resetDemoData(); Object.assign(state, await loadState()); state.activeMatchId = state.matches[0]?.id; flash("Demo data reset — characters, teams and trophies restored."); }
  if (action === "copy-share" && state.storage.shareUrl) { await copyShareLink(); return; }
  if (!match && ["pot", "foul", "miss", "freeball", "switch", "undo", "redo", "end-frame", "new-frame", "end-match"].includes(action)) return;
  if (action === "pot") await updateMatch(applyEvent(match, { type: "pot", playerId: current, points: Number(button.dataset.points), ball: button.dataset.ball }), `${byId(current)?.name ?? "Player"} potted ${button.dataset.ball}.`);
  if (action === "foul") await updateMatch(applyEvent(match, { type: "foul", playerId: current, points: Number(button.dataset.points), awardedToId: opponentForFoul(match, current) }), "Foul saved and points awarded.");
  if (action === "miss") await updateMatch(applyEvent(match, { type: "miss", playerId: current }), "Miss/safety recorded. Turn moved on.");
  if (action === "freeball") await updateMatch(applyEvent(match, { type: "foul", playerId: current, points: 4, awardedToId: opponentForFoul(match, current), miss: true, freeBall: true }), "Free ball note saved.");
  if (action === "switch") await updateMatch(applyEvent(match, { type: "switch", playerId: current, toIndex: Number(button.dataset.index) }), "Player at table changed.");
  if (action === "undo") await updateMatch(undoEvent(match), "Last event undone.");
  if (action === "redo") await updateMatch(redoEvent(match), "Event restored.");
  if (action === "end-frame") await promptEndFrame(match, frame);
  if (action === "end-match") await promptEndMatch(match, frame);
  if (action === "new-frame") await promptNextFrame(match, frame);
  if (action === "create-match") await createNewMatch();
  if (action === "edit-player") { state.selectedPlayerId = button.dataset.id; render(); }
  if (action === "clear-player") { state.selectedPlayerId = null; render(); }
  if (action === "delete-player" && confirm("Remove this player? Past match snapshots stay intact.")) { await removePlayer(button.dataset.id); Object.assign(state, await loadState()); flash("Player removed."); }
  if (action === "edit-team") { state.selectedTeamId = button.dataset.id; render(); }
  if (action === "clear-team") { state.selectedTeamId = null; render(); }
  if (action === "delete-team" && confirm("Remove this team? Players are not deleted.")) { await removeTeam(button.dataset.id); Object.assign(state, await loadState()); flash("Team removed."); }
  if (action === "load-match") { state.activeMatchId = button.dataset.id; state.route = "score"; state.transition += 1; render(); }
  if (action === "delete-match" && confirm("Delete this match forever?")) { await removeMatch(button.dataset.id); Object.assign(state, await loadState()); state.activeMatchId = state.matches[0]?.id; flash("Match deleted."); }
}

async function copyShareLink() {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(state.storage.shareUrl);
    flash("Shared room link copied. Send it to your friends for the same live database.");
  } catch {
    prompt("Copy this shared room link", state.storage.shareUrl);
    flash("Copy the shared room link from the dialog and send it to your friends.");
  }
}

async function promptEndFrame(match, frame) {
  const players = matchPlayers(match);
  const leader = getFrameLeader(frame, players);
  if (!confirm(`End and save this frame for ${leader.name}?`)) return;
  await updateMatch(endCurrentFrame(match, leader.id), `Frame saved. ${leader.name} gets the frame trophy 🏆.`);
}

async function promptEndMatch(match, frame) {
  const players = matchPlayers(match);
  const leader = getFrameLeader(frame, players);
  const wins = frameWins(match);
  const matchLeader = players.reduce((best, player) => (wins[player.id] ?? 0) > (wins[best.id] ?? 0) ? player : best, leader);
  const winner = match.winnerId ? players.find((player) => player.id === match.winnerId) : matchLeader;
  if (!confirm(`End game now and save ${winner.name} as winner?${frame.endedAt ? "" : ` Current frame will go to ${leader.name}.`}`)) return;
  await updateMatch(endMatch(match, winner.id), `Game ended and saved. ${winner.name} lifts the trophy 🏆.`);
}

async function promptNextFrame(match, frame) {
  if (match.winnerId) {
    alert("This match already has a winner. Create a new game for the next battle.");
    return;
  }
  let next = match;
  const players = matchPlayers(match);
  if (!frame.endedAt) {
    const leader = getFrameLeader(frame, players);
    if (!confirm(`Start next frame? First, save this frame for ${leader.name}.`)) return;
    next = endCurrentFrame(match, leader.id);
  } else if (!confirm("Start the next frame now?")) return;
  await updateMatch(addFrame(next, players), "New frame started — rack them up! ✨");
}

async function handlePlayerSave(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await savePlayer(data);
  Object.assign(state, await loadState());
  state.selectedPlayerId = null;
  flash("Player saved with animated character.");
}

async function handleTeamSave(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const data = Object.fromEntries(formData);
  data.playerIds = formData.getAll("playerIds");
  if (data.playerIds.length < 2 && !confirm("Teams are most useful with 2+ players. Save anyway?")) return;
  await saveTeam(data);
  Object.assign(state, await loadState());
  state.selectedTeamId = null;
  flash("Team saved. You can use it on New game.");
}

async function handleAdjust(event) {
  event.preventDefault();
  const match = activeMatch();
  const frame = currentFrame(match);
  const playerId = match.playerIds[frame.currentPlayerIndex];
  const points = Number(new FormData(event.currentTarget).get("points"));
  await updateMatch(applyEvent(match, { type: "adjust", playerId, points }), "Manual adjustment saved.");
}

function handleTeamQuickPick(event) {
  const team = teamById(event.target.value);
  state.draft.teamId = event.target.value;
  if (team) {
    state.draft.playerIds = [...new Set([...state.draft.playerIds, ...team.playerIds])];
    state.draft.starterId = state.draft.playerIds.includes(state.draft.starterId) ? state.draft.starterId : state.draft.playerIds[0];
  }
  render();
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
  flash("Match created. First break awaits 🎯.");
}

async function updateMatch(match, message = "Saved.") {
  await saveMatch(match);
  const index = state.matches.findIndex((item) => item.id === match.id);
  if (index >= 0) state.matches[index] = match;
  state.activeMatchId = match.id;
  flash(message);
}

function flash(message) {
  state.notice = message;
  state.transition += 1;
  render();
}

function playerStats(player) {
  const matches = state.matches.filter((match) => match.playerIds.includes(player.id));
  const wins = matches.filter((match) => match.winnerId === player.id).length;
  const frames = matches.flatMap((match) => match.frames);
  const frameWinsCount = frames.filter((frame) => frame.winnerId === player.id).length;
  const stats = frames.map((frame) => frame.playerStats[player.id]).filter(Boolean);
  const highBreak = Math.max(0, ...stats.map((item) => item.highestBreak ?? 0));
  const pots = stats.reduce((sum, item) => sum + (item.pots ?? 0), 0);
  const fouls = stats.reduce((sum, item) => sum + (item.fouls ?? 0), 0);
  const points = stats.reduce((sum, item) => sum + (item.points ?? 0), 0);
  return { ...player, matches: matches.length, wins, frames: frames.length, frameWinsCount, highBreak, pots, fouls, points, winRate: matches.length ? wins / matches.length * 100 : 0 };
}

function statCard(profile, index) {
  const nickname = profile.fouls > profile.pots ? "Chaos merchant" : profile.highBreak >= 50 ? "Break builder" : profile.pots ? "Pot collector" : "Practice table lurker";
  return `<article class="stat-row fancy-stat"><span class="trophy">${trophies[index % trophies.length]}</span>${characterAvatar(profile)}<div><strong>${profile.name}</strong><small>${profile.matches} matches · ${profile.wins} wins · ${profile.frameWinsCount} frames · ${Math.round(profile.winRate)}% win rate</small><em>${nickname}: ${profile.points} pts, ${profile.pots} pots, ${profile.fouls} fouls, HB ${profile.highBreak}</em></div></article>`;
}

function teamStats() {
  return state.teams.map((team) => {
    const members = team.playerIds.map(byId).filter(Boolean);
    const combined = members.map(playerStats).reduce((totals, item) => ({
      wins: totals.wins + item.wins,
      matches: totals.matches + item.matches,
      points: totals.points + item.points,
      fouls: totals.fouls + item.fouls,
      highBreak: Math.max(totals.highBreak, item.highBreak)
    }), { wins: 0, matches: 0, points: 0, fouls: 0, highBreak: 0 });
    return `<article class="stat-row"><span class="team-badge" style="--avatar:${team.colour}">👥</span><div><strong>${team.name}</strong><small>${members.map((player) => player.name).join(" + ") || "No members"}</small><em>Combined: ${combined.wins} wins, ${combined.points} points, HB ${combined.highBreak}, ${combined.fouls} foul giggles</em></div></article>`;
  });
}

function award(icon, title, value, note) {
  return `<div class="award"><span>${icon}</span><strong>${title}</strong><b>${value}</b><small>${note}</small></div>`;
}

function opponentForFoul(match, currentId) {
  return match.playerIds[(match.playerIds.indexOf(currentId) + 1) % match.playerIds.length];
}

function nearestOdd(value) {
  const number = Math.max(1, Number(value) || 1);
  return number % 2 ? number : number + 1;
}

function characterFor(player = {}) {
  return characters.find((character) => character.id === player.character) ?? characters[0];
}

function characterAvatar(player = {}, size = "") {
  const character = characterFor(player);
  return `<span class="avatar character ${size}" style="--avatar:${player.colour ?? "#14b8a6"}" title="${character.name}"><span>${character.emoji}</span></span>`;
}
