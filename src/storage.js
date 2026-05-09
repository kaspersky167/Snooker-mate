import { createMatch, cryptoId } from "./scoring.js";

const DB_NAME = "snooker-mate";
const DB_VERSION = 2;
const STORES = ["players", "matches", "settings", "teams"];
const DEFAULT_SHARED_ROOM = "main";

const demoPlayers = [
  { id: "player-ronnie", name: "Ronnie", nickname: "Rocket", colour: "#f97316", character: "rocket", createdAt: "2026-01-02T19:00:00.000Z" },
  { id: "player-steve", name: "Steve", nickname: "Safety", colour: "#38bdf8", character: "wizard", createdAt: "2026-01-02T19:01:00.000Z" },
  { id: "player-reanne", name: "Reanne", nickname: "Cue Queen", colour: "#a78bfa", character: "queen", createdAt: "2026-01-02T19:02:00.000Z" },
  { id: "player-judd", name: "Judd", nickname: "Ace", colour: "#22c55e", character: "shark", createdAt: "2026-01-02T19:03:00.000Z" }
];

const demoTeams = [
  { id: "team-rapid", name: "Rapid Reds", colour: "#ef4444", playerIds: ["player-ronnie", "player-judd"], createdAt: "2026-01-03T12:00:00.000Z" },
  { id: "team-cushion", name: "Cushion Crew", colour: "#38bdf8", playerIds: ["player-steve", "player-reanne"], createdAt: "2026-01-03T12:05:00.000Z" }
];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());
}

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const localStorageAdapter = {
  type: "local",
  label: "This browser only",
  async all(store) {
    return tx(store, "readonly", (objectStore) => requestToPromise(objectStore.getAll()));
  },
  async put(store, value) {
    return tx(store, "readwrite", (objectStore) => objectStore.put(value));
  },
  async delete(store, id) {
    return tx(store, "readwrite", (objectStore) => objectStore.delete(id));
  },
  async clear(store) {
    return tx(store, "readwrite", (objectStore) => objectStore.clear());
  }
};

function browserConfig() {
  return globalThis.window?.SnookerMateConfig ?? {};
}

function currentUrl() {
  try {
    return new URL(globalThis.location?.href ?? "http://localhost/");
  } catch {
    return new URL("http://localhost/");
  }
}

function isLocalHost(hostname) {
  return ["", "localhost", "127.0.0.1", "::1"].includes(hostname);
}

function wantsRemoteStorage() {
  const config = browserConfig();
  const url = currentUrl();
  if (url.searchParams.get("storage") === "local") return false;
  if (url.searchParams.has("room")) return true;
  if (config.storage === "remote") return true;
  if (config.storage === "local") return false;
  return !isLocalHost(url.hostname);
}

function sharedRoomId() {
  const config = browserConfig();
  const url = currentUrl();
  const fromUrl = url.searchParams.get("room")?.trim();
  const room = fromUrl || config.defaultRoom || DEFAULT_SHARED_ROOM;
  return room.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || DEFAULT_SHARED_ROOM;
}

function apiUrl(path) {
  const base = browserConfig().apiBaseUrl ?? "/api";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function parseJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Shared storage request failed (${response.status})`);
  return body;
}

function remoteStorageAdapter(room) {
  const roomPath = encodeURIComponent(room);
  return {
    type: "remote",
    label: `Shared room: ${room}`,
    room,
    async all(store) {
      const response = await fetch(apiUrl(`/${roomPath}/${encodeURIComponent(store)}`));
      const body = await parseJsonResponse(response);
      return body.records ?? [];
    },
    async put(store, value) {
      const response = await fetch(apiUrl(`/${roomPath}/${encodeURIComponent(store)}/${encodeURIComponent(value.id)}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value)
      });
      await parseJsonResponse(response);
    },
    async delete(store, id) {
      const response = await fetch(apiUrl(`/${roomPath}/${encodeURIComponent(store)}/${encodeURIComponent(id)}`), { method: "DELETE" });
      await parseJsonResponse(response);
    },
    async clear(store) {
      const response = await fetch(apiUrl(`/${roomPath}/${encodeURIComponent(store)}`), { method: "DELETE" });
      await parseJsonResponse(response);
    }
  };
}

export const storage = wantsRemoteStorage() ? remoteStorageAdapter(sharedRoomId()) : localStorageAdapter;

export function storageInfo() {
  const url = currentUrl();
  const shareUrl = storage.type === "remote" ? `${url.origin}${url.pathname}?room=${encodeURIComponent(storage.room)}` : null;
  return { type: storage.type, label: storage.label, room: storage.room, shareUrl };
}

export async function loadState() {
  await seedIfNeeded();
  const [players, matches, teams] = await Promise.all([storage.all("players"), storage.all("matches"), storage.all("teams")]);
  return {
    players: players.sort((a, b) => a.name.localeCompare(b.name)),
    matches: matches.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    teams: teams.sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function savePlayer(player) {
  const now = new Date().toISOString();
  const record = { ...player, id: player.id || cryptoId("player"), character: player.character || "rocket", createdAt: player.createdAt || now, updatedAt: now };
  await storage.put("players", record);
  return record;
}

export async function saveTeam(team) {
  const now = new Date().toISOString();
  const playerIds = Array.isArray(team.playerIds) ? team.playerIds : [team.playerIds].filter(Boolean);
  const record = { ...team, playerIds, id: team.id || cryptoId("team"), createdAt: team.createdAt || now, updatedAt: now };
  await storage.put("teams", record);
  return record;
}

export async function saveMatch(match) {
  await storage.put("matches", { ...match, updatedAt: new Date().toISOString() });
}

export async function removePlayer(id) {
  await storage.delete("players", id);
}

export async function removeTeam(id) {
  await storage.delete("teams", id);
}

export async function removeMatch(id) {
  await storage.delete("matches", id);
}

export async function resetDemoData() {
  await storage.clear("players");
  await storage.clear("matches");
  await storage.clear("teams");
  await seedDemoData(true);
}

async function seedIfNeeded() {
  const settings = await storage.all("settings");
  const seeded = settings.find((item) => item.id === "seeded-v2");
  if (!seeded) await seedDemoData();
}

async function seedDemoData(force = false) {
  const existingPlayers = await storage.all("players");
  if (existingPlayers.length && !force) {
    await Promise.all(demoPlayers.map((player) => storage.put("players", { ...player, ...(existingPlayers.find((item) => item.id === player.id) ?? {}) })));
    const existingTeams = await storage.all("teams");
    if (!existingTeams.length) await Promise.all(demoTeams.map((team) => storage.put("teams", team)));
    await storage.put("settings", { id: "seeded-v2", value: true, at: new Date().toISOString() });
    return;
  }

  await Promise.all(demoPlayers.map((player) => storage.put("players", player)));
  await Promise.all(demoTeams.map((team) => storage.put("teams", team)));

  const standard = createMatch({ players: demoPlayers.slice(0, 2), mode: "standard", bestOf: 3, raceTo: 2, starterIndex: 0 });
  standard.createdAt = "2026-04-12T20:05:00.000Z";
  standard.frames[0].events = [
    { id: "seed-e1", type: "pot", playerId: "player-ronnie", points: 1, ball: "red", at: "2026-04-12T20:06:00.000Z" },
    { id: "seed-e2", type: "pot", playerId: "player-ronnie", points: 7, ball: "black", at: "2026-04-12T20:06:20.000Z" },
    { id: "seed-e3", type: "foul", playerId: "player-steve", awardedToId: "player-ronnie", points: 4, miss: true, freeBall: true, at: "2026-04-12T20:08:00.000Z" },
    { id: "seed-e4", type: "pot", playerId: "player-ronnie", points: 6, ball: "pink", at: "2026-04-12T20:10:00.000Z" }
  ];
  standard.frames[0].playerStats["player-ronnie"] = { points: 18, currentBreak: 14, highestBreak: 14, fouls: 0, pots: 3 };
  standard.frames[0].playerStats["player-steve"] = { points: 0, currentBreak: 0, highestBreak: 0, fouls: 1, pots: 0 };
  standard.frames[0].winnerId = "player-ronnie";
  standard.frames[0].endedAt = "2026-04-12T20:35:00.000Z";
  standard.winnerId = "player-ronnie";

  const century = createMatch({ players: demoPlayers.slice(1, 4), mode: "century", bestOf: 1, raceTo: 1, starterIndex: 0 });
  century.createdAt = "2026-04-18T18:30:00.000Z";
  century.frames[0].events = [
    { id: "seed-c1", type: "pot", playerId: "player-steve", points: 10, ball: "super-red", at: "2026-04-18T18:31:00.000Z" },
    { id: "seed-c2", type: "pot", playerId: "player-reanne", points: 7, ball: "black", at: "2026-04-18T18:32:00.000Z" },
    { id: "seed-c3", type: "pot", playerId: "player-judd", points: 10, ball: "super-red", at: "2026-04-18T18:33:00.000Z" }
  ];
  century.frames[0].playerStats["player-steve"] = { points: 10, currentBreak: 10, highestBreak: 10, fouls: 0, pots: 1 };
  century.frames[0].playerStats["player-reanne"] = { points: 7, currentBreak: 7, highestBreak: 7, fouls: 0, pots: 1 };
  century.frames[0].playerStats["player-judd"] = { points: 10, currentBreak: 10, highestBreak: 10, fouls: 0, pots: 1 };

  await storage.put("matches", standard);
  await storage.put("matches", century);
  await storage.put("settings", { id: "seeded", value: true, at: new Date().toISOString() });
  await storage.put("settings", { id: "seeded-v2", value: true, at: new Date().toISOString() });
}
