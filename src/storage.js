import { createMatch, cryptoId } from "./scoring.js";

const DB_NAME = "snooker-mate";
const DB_VERSION = 1;
const STORES = ["players", "matches", "settings"];

const demoPlayers = [
  { id: "player-ronnie", name: "Ronnie", nickname: "Rocket", colour: "#f97316", createdAt: "2026-01-02T19:00:00.000Z" },
  { id: "player-steve", name: "Steve", nickname: "Safety", colour: "#38bdf8", createdAt: "2026-01-02T19:01:00.000Z" },
  { id: "player-reanne", name: "Reanne", nickname: "Cue Queen", colour: "#a78bfa", createdAt: "2026-01-02T19:02:00.000Z" },
  { id: "player-judd", name: "Judd", nickname: "Ace", colour: "#22c55e", createdAt: "2026-01-02T19:03:00.000Z" }
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

export const storage = {
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

export async function loadState() {
  await seedIfNeeded();
  const [players, matches] = await Promise.all([storage.all("players"), storage.all("matches")]);
  return {
    players: players.sort((a, b) => a.name.localeCompare(b.name)),
    matches: matches.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  };
}

export async function savePlayer(player) {
  const now = new Date().toISOString();
  const record = { ...player, id: player.id || cryptoId("player"), createdAt: player.createdAt || now, updatedAt: now };
  await storage.put("players", record);
  return record;
}

export async function saveMatch(match) {
  await storage.put("matches", { ...match, updatedAt: new Date().toISOString() });
}

export async function removePlayer(id) {
  await storage.delete("players", id);
}

export async function removeMatch(id) {
  await storage.delete("matches", id);
}

export async function resetDemoData() {
  await storage.clear("players");
  await storage.clear("matches");
  await seedDemoData(true);
}

async function seedIfNeeded() {
  const settings = await storage.all("settings");
  const seeded = settings.find((item) => item.id === "seeded");
  if (!seeded) await seedDemoData();
}

async function seedDemoData(force = false) {
  const existingPlayers = await storage.all("players");
  if (existingPlayers.length && !force) return;
  await Promise.all(demoPlayers.map((player) => storage.put("players", player)));

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
}
