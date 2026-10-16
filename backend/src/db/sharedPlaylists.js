import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "./store.js";

// Playlists shared by code ("Copiar código" in the playlist's panel): the server keeps each one and gives back a code
// like "K7P2M-XH4QN" that anyone can paste to load it. They live in the Supabase table `shared_playlists` (see
// backend/supabase/schema.sql); without Supabase, or if the table isn't there yet, in
// backend/private/shared-playlists.json (that folder is never committed).
//
// Safeguards: the playlist is the room's own, already cleaned (at most 10 games, valid settings only) and capped in
// size; the same playlist always gets the same code (no new row); each person can make only a few codes a minute; and
// a code nobody opens for a year is deleted.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// (Tests point SHARED_PLAYLISTS_FILE somewhere else, so they never touch the real file.)
const LOCAL_PATH = process.env.SHARED_PLAYLISTS_FILE || path.join(__dirname, "../../private/shared-playlists.json");
const TABLE = "shared_playlists";

// The same letters and numbers as room codes (no I, O, 0 or 1): 10 of them, as two groups of five.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SHARE_CODE_LENGTH = 10;
const MAX_BYTES = 20_000;
export const SHARE_LIMIT = { count: 10, windowMs: 60_000 };
export const SHARE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function newCode() {
  let raw = "";
  const bytes = crypto.randomBytes(SHARE_CODE_LENGTH);
  for (const b of bytes) raw += CODE_CHARS[b % CODE_CHARS.length];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** A pasted code in its stored form ("k7p2m xh4qn" → "K7P2M-XH4QN"), or null when it can't be one. */
export function normalizeShareCode(input) {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== SHARE_CODE_LENGTH || [...raw].some((c) => !CODE_CHARS.includes(c))) return null;
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** What is kept of a playlist: its name, order and games with their settings (never the room's own ids). */
export function shareablePlaylist(playlist) {
  return {
    name: playlist.name,
    order: playlist.order,
    items: (playlist.items || []).map((item) => ({ game: item.game, config: item.config || {} })),
  };
}

// The same playlist (same name, order, games and settings) always hashes the same.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
const hashOf = (data) => crypto.createHash("sha256").update(stableJson(data)).digest("hex");

// ---------- Local file (no Supabase) ----------
function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeLocal(all) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(all));
}

// ---------- Rate limit: SHARE_LIMIT codes a minute per person (or connection) ----------
const recent = new Map();
export function assertCanShare(who, now = Date.now()) {
  const times = (recent.get(who) || []).filter((t) => now - t < SHARE_LIMIT.windowMs);
  if (times.length >= SHARE_LIMIT.count) throw new Error("Estás creando muchos códigos. Espera un momento.");
  times.push(now);
  recent.set(who, times);
}

/**
 * The code for a playlist: the one it already has when the same playlist was shared before, else a new one. Throws
 * (in Spanish) when it can't be kept.
 */
export async function shareCodeFor(playlist, { local = !supabaseEnabled() } = {}) {
  const data = shareablePlaylist(playlist);
  if (!data.items.length) throw new Error("Añade al menos un juego para compartirla");
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new Error("La playlist es demasiado grande para compartirla");
  const hash = hashOf(data);
  const now = new Date().toISOString();

  if (!local) {
    const db = getSupabase();
    const found = await db.from(TABLE).select("code").eq("hash", hash).maybeSingle();
    if (!found.error && found.data) {
      await db.from(TABLE).update({ last_used_at: now }).eq("code", found.data.code);
      return found.data.code;
    }
    if (!found.error) {
      for (let tries = 0; tries < 5; tries += 1) {
        const code = newCode();
        const { error } = await db.from(TABLE).insert({ code, hash, data, last_used_at: now });
        if (!error) return code;
        // Taken already: the same playlist shared at the same moment, or (rarely) a code in use.
        const again = await db.from(TABLE).select("code").eq("hash", hash).maybeSingle();
        if (again.data) return again.data.code;
      }
    }
    console.warn(`[Playlists] No se pudo usar Supabase (${found.error?.message || "código"}); se guarda en ${LOCAL_PATH}`);
  }

  const all = readLocal();
  const existing = Object.entries(all).find(([, row]) => row.hash === hash);
  if (existing) {
    existing[1].lastUsedAt = now;
    writeLocal(all);
    return existing[0];
  }
  let code = newCode();
  while (all[code]) code = newCode();
  all[code] = { hash, data, createdAt: now, lastUsedAt: now };
  writeLocal(all);
  return code;
}

/** The playlist a code points to ({ name, order, items }), or throws (in Spanish) when there is none. */
export async function playlistByCode(input, { local = !supabaseEnabled() } = {}) {
  const code = normalizeShareCode(input);
  if (!code) throw new Error("El código tiene 10 letras y números, como K7P2M-XH4QN");
  const now = new Date().toISOString();
  if (!local) {
    const db = getSupabase();
    const { data, error } = await db.from(TABLE).select("data").eq("code", code).maybeSingle();
    if (!error) {
      if (!data) throw new Error("No hay ninguna playlist con ese código");
      // Opened again: it stays alive another year.
      db.from(TABLE).update({ last_used_at: now }).eq("code", code).then(() => {});
      return data.data;
    }
  }
  const all = readLocal();
  const row = all[code];
  if (!row) throw new Error("No hay ninguna playlist con ese código");
  row.lastUsedAt = now;
  writeLocal(all);
  return row.data;
}

/** Deletes the codes nobody shared or opened in SHARE_TTL_MS (a year). Run at boot and once a day. */
export async function forgetOldShareCodes({ local = !supabaseEnabled(), now = Date.now() } = {}) {
  const limit = new Date(now - SHARE_TTL_MS).toISOString();
  if (!local) {
    const { error } = await getSupabase().from(TABLE).delete().lt("last_used_at", limit);
    if (!error) return;
  }
  const all = readLocal();
  let changed = false;
  for (const [code, row] of Object.entries(all)) {
    if ((row.lastUsedAt || row.createdAt) < limit) {
      delete all[code];
      changed = true;
    }
  }
  if (changed) writeLocal(all);
}
