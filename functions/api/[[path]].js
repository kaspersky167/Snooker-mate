const STORES = new Set(["players", "matches", "settings", "teams"]);
const ROOM_PATTERN = /^[a-z0-9_-]{1,80}$/;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

function cleanRoom(room) {
  const value = (room ?? "").toLowerCase();
  return ROOM_PATTERN.test(value) ? value : null;
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS snooker_records (
      room TEXT NOT NULL,
      store TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (room, store, id)
    )
  `).run();
}

async function readJson(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body;
}

export async function onRequest({ request, env, params }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!env.DB) return json({ error: "Cloudflare D1 binding `DB` is required for shared storage." }, 500);

  const path = Array.isArray(params.path)
    ? params.path
    : String(params.path ?? "").split("/").filter(Boolean);
  const [roomParam, store, id] = path;
  const room = cleanRoom(roomParam);

  if (!room || !STORES.has(store) || path.length > 3) {
    return json({ error: "Use /api/:room/:store or /api/:room/:store/:id." }, 404);
  }

  await ensureSchema(env.DB);

  if (request.method === "GET" && !id) {
    const { results } = await env.DB
      .prepare("SELECT value FROM snooker_records WHERE room = ? AND store = ?")
      .bind(room, store)
      .all();
    return json({ records: results.map((row) => JSON.parse(row.value)) });
  }

  if (request.method === "PUT" && id) {
    const record = await readJson(request);
    if (!record || record.id !== id) return json({ error: "Request body must be a JSON record with an id matching the URL." }, 400);

    await env.DB
      .prepare("INSERT INTO snooker_records (room, store, id, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(room, store, id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(room, store, id, JSON.stringify(record), new Date().toISOString())
      .run();
    return json({ ok: true });
  }

  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM snooker_records WHERE room = ? AND store = ? AND id = ?").bind(room, store, id).run();
    return json({ ok: true });
  }

  if (request.method === "DELETE" && !id) {
    await env.DB.prepare("DELETE FROM snooker_records WHERE room = ? AND store = ?").bind(room, store).run();
    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
}
