export const STANDARD_BALLS = [
  { key: "red", label: "Red", value: 1, className: "red" },
  { key: "yellow", label: "Yellow", value: 2, className: "yellow" },
  { key: "green", label: "Green", value: 3, className: "green" },
  { key: "brown", label: "Brown", value: 4, className: "brown" },
  { key: "blue", label: "Blue", value: 5, className: "blue" },
  { key: "pink", label: "Pink", value: 6, className: "pink" },
  { key: "black", label: "Black", value: 7, className: "black" }
];

export const CENTURY_BALLS = [
  { key: "super-red", label: "10 Red", value: 10, className: "super-red" },
  ...STANDARD_BALLS
];

export const emptyStats = () => ({ points: 0, currentBreak: 0, highestBreak: 0, fouls: 0, pots: 0 });

export const createFrame = (players, starterIndex = 0, mode = "standard") => ({
  id: cryptoId("frame"),
  mode,
  startedAt: new Date().toISOString(),
  endedAt: null,
  starterIndex,
  currentPlayerIndex: starterIndex,
  winnerId: null,
  events: [],
  undoneEvents: [],
  playerStats: Object.fromEntries(players.map((player) => [player.id, emptyStats()])),
  note: ""
});

export const createMatch = ({ players, mode, bestOf, raceTo, starterIndex }) => ({
  id: cryptoId("match"),
  mode,
  playerIds: players.map((player) => player.id),
  playerSnapshots: players.map(({ id, name, nickname, colour, character }) => ({ id, name, nickname, colour, character })),
  bestOf,
  raceTo,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  winnerId: null,
  frames: [createFrame(players, starterIndex, mode)]
});

export function ballSetForMode(mode) {
  return mode === "century" ? CENTURY_BALLS : STANDARD_BALLS;
}

export function cryptoId(prefix = "id") {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function applyEvent(match, event) {
  const next = structuredClone(match);
  const frame = currentFrame(next);
  frame.events.push({ ...event, id: cryptoId("event"), at: new Date().toISOString() });
  frame.undoneEvents = [];
  recalculateFrame(next, frame.id);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function undoEvent(match) {
  const next = structuredClone(match);
  const frame = currentFrame(next);
  const event = frame.events.pop();
  if (event) frame.undoneEvents.push(event);
  recalculateFrame(next, frame.id);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function redoEvent(match) {
  const next = structuredClone(match);
  const frame = currentFrame(next);
  const event = frame.undoneEvents.pop();
  if (event) frame.events.push(event);
  recalculateFrame(next, frame.id);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function endCurrentFrame(match, winnerId) {
  const next = structuredClone(match);
  const frame = currentFrame(next);
  frame.winnerId = winnerId;
  frame.endedAt = new Date().toISOString();
  next.winnerId = getMatchWinner(next);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function endMatch(match, winnerId) {
  const next = structuredClone(match);
  const frame = currentFrame(next);
  if (frame && !frame.endedAt) {
    frame.winnerId = winnerId;
    frame.endedAt = new Date().toISOString();
  }
  next.winnerId = winnerId;
  next.endedAt = new Date().toISOString();
  next.updatedAt = new Date().toISOString();
  return next;
}

export function addFrame(match, players) {
  const next = structuredClone(match);
  const last = next.frames.at(-1);
  const starterIndex = ((last?.starterIndex ?? -1) + 1) % players.length;
  next.frames.push(createFrame(players, starterIndex, next.mode));
  next.updatedAt = new Date().toISOString();
  return next;
}

export function currentFrame(match) {
  return match.frames.at(-1);
}

export function frameScore(frame, playerId) {
  return frame.playerStats[playerId]?.points ?? 0;
}

export function getFrameLeader(frame, players) {
  const sorted = [...players].sort((a, b) => frameScore(frame, b.id) - frameScore(frame, a.id));
  return sorted[0];
}

export function frameWins(match) {
  return match.playerIds.reduce((wins, id) => {
    wins[id] = match.frames.filter((frame) => frame.winnerId === id).length;
    return wins;
  }, {});
}

export function getMatchWinner(match) {
  const wins = frameWins(match);
  return Object.entries(wins).find(([, count]) => count >= match.raceTo)?.[0] ?? null;
}

export function recalculateFrame(match, frameId) {
  const frame = match.frames.find((item) => item.id === frameId);
  if (!frame) return match;
  frame.playerStats = Object.fromEntries(match.playerIds.map((id) => [id, emptyStats()]));
  frame.currentPlayerIndex = frame.starterIndex;
  frame.winnerId = frame.winnerId && match.playerIds.includes(frame.winnerId) ? frame.winnerId : null;

  for (const event of frame.events) {
    const actorIndex = match.playerIds.indexOf(event.playerId);
    const actor = frame.playerStats[event.playerId];
    if (!actor) continue;

    if (event.type === "pot") {
      actor.points += event.points;
      actor.currentBreak += event.points;
      actor.highestBreak = Math.max(actor.highestBreak, actor.currentBreak);
      actor.pots += 1;
      frame.currentPlayerIndex = actorIndex;
    }

    if (event.type === "foul") {
      actor.fouls += 1;
      actor.currentBreak = 0;
      const recipientId = event.awardedToId ?? nextPlayerId(match.playerIds, event.playerId);
      if (frame.playerStats[recipientId]) frame.playerStats[recipientId].points += event.points;
      frame.currentPlayerIndex = match.playerIds.indexOf(recipientId);
    }

    if (event.type === "miss") {
      actor.currentBreak = 0;
      frame.currentPlayerIndex = nextPlayerIndex(match.playerIds, event.playerId);
    }

    if (event.type === "switch") {
      actor.currentBreak = 0;
      frame.currentPlayerIndex = event.toIndex;
    }

    if (event.type === "adjust") {
      actor.points = Math.max(0, actor.points + event.points);
      actor.highestBreak = Math.max(actor.highestBreak, actor.currentBreak);
    }
  }

  if (match.mode === "century") {
    const winner = match.playerIds.find((id) => (frame.playerStats[id]?.points ?? 0) >= 100);
    if (winner && !frame.winnerId) frame.winnerId = winner;
  }

  return match;
}

export function nextPlayerIndex(playerIds, currentPlayerId) {
  return (playerIds.indexOf(currentPlayerId) + 1) % playerIds.length;
}

export function nextPlayerId(playerIds, currentPlayerId) {
  return playerIds[nextPlayerIndex(playerIds, currentPlayerId)];
}

export function matchSummary(match) {
  const wins = frameWins(match);
  const highBreaks = match.playerIds.reduce((acc, id) => {
    acc[id] = Math.max(0, ...match.frames.map((frame) => frame.playerStats[id]?.highestBreak ?? 0));
    return acc;
  }, {});
  return { wins, highBreaks, winnerId: match.winnerId ?? getMatchWinner(match) };
}
