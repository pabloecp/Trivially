import { FORMATS, quizConfig } from "../quiz/quizInfo.js";
import { geoConfig } from "../mundo/geoInfo.js";
import { historyConfig } from "../historia/historyInfo.js";
import { minesConfig } from "../minas/minesInfo.js";
import { rainConfig } from "../lluvia/rainInfo.js";
import { GAME_MODES, isGameTile } from "../index.js";

// Playlists of games (backend/src/game/playlist.js): the games a playlist can have, each item's settings, a line
// that sums them up, and the JSON they're shared in.

export const MAX_ITEMS = 10;
export const NAME_MAX = 40;

// The games a playlist can have: every game of the menu (not the playlist itself nor a Clásico).
export function playlistGames() {
  return GAME_MODES.filter((m) => m.available && isGameTile(m));
}

// Where each game keeps its settings in the room's config (Adivina la canción's are at its top level), as on the server.
const CONFIG_KEY = { opciones: "quiz", mundo: "geo", historia: "history", minas: "mines", lluvia: "rain", musica: null };
const MUSIC_KEYS = ["rounds", "roundMs", "formats", "useCatalog", "languages", "genres", "difficulties", "playlistIds"];

/** The room's settings with an item's in place of its game's, so the game's own settings panel can show them. */
export function configWithItem(config, item) {
  const key = CONFIG_KEY[item.game];
  return key ? { ...config, [key]: item.config } : { ...config, ...item.config };
}

/** What a game's settings panel saved (its `updateConfig` change) as the item's settings. */
export function itemConfigFrom(game, change, current) {
  const key = CONFIG_KEY[game];
  if (key) return change[key] || current;
  const next = { ...current };
  for (const k of MUSIC_KEYS) if (change[k] !== undefined) next[k] = change[k];
  return next;
}

/** A new item's settings: the game's defaults (the server fills in the same). */
export function defaultItemConfig(game, catalog) {
  if (game === "opciones") return quizConfig({});
  if (game === "mundo") return geoConfig({});
  if (game === "historia") return historyConfig({});
  if (game === "minas") return minesConfig({});
  if (game === "lluvia") return rainConfig({});
  // Adivina la canción: the whole catalog, every language, genre and difficulty (the server fills them in the same).
  return { rounds: 5, roundMs: 15000, formats: FORMATS.map((f) => f.id), useCatalog: true, playlistIds: [] };
}

export function newItemId() {
  return Math.random().toString(36).slice(2, 10);
}

const secondsText = (ms) => `${Math.round(ms / 1000)} s`;

/**
 * One line with an item's rounds and seconds per round, the same words in every game: "5 rondas · 15 s por ronda".
 */
export function itemSummary(item) {
  const c = item.config || {};
  return [
    c.rounds ? `${c.rounds} ${c.rounds === 1 ? "ronda" : "rondas"}` : null,
    c.roundMs ? `${secondsText(c.roundMs)} por ronda` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ---------- "Mis playlists": the ones saved in this browser ---------- */

// A name compared without accents, case or spaces around it ("Noche de juegos" = "noche de JUEGOS").
const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const LIBRARY_KEY = "trivially_playlists";
const LIBRARY_MAX = 30;

/** The saved playlists, newest first. Empty when the browser keeps nothing (private mode). */
export function loadLibrary() {
  try {
    const list = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === "string" && Array.isArray(p.items)) : [];
  } catch {
    return [];
  }
}

function storeLibrary(list) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// Two playlists with the same order and games with the same settings.
const sameGames = (a, b) =>
  a.order === b.order &&
  JSON.stringify((a.items || []).map(({ game, config }) => ({ game, config }))) ===
    JSON.stringify((b.items || []).map(({ game, config }) => ({ game, config })));

// A name no other saved playlist has: "Viernes", else "Viernes (2)", "Viernes (3)"…
function freeName(others, name) {
  const taken = new Set(others.map((p) => fold(p.name)));
  if (!taken.has(fold(name))) return name;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const next = `${name.slice(0, NAME_MAX - suffix.length)}${suffix}`;
    if (!taken.has(fold(next))) return next;
  }
}

/**
 * Saves a playlist in this browser, always as a new one: a saved playlist is never replaced, whatever its name. Only the
 * very same playlist (same name, order, games and settings) isn't saved twice: that one just moves to the top. A name
 * already taken gets "Nombre (2)". Returns { list, id, name } (the name it got), or throws when the browser doesn't let
 * us keep it.
 */
export function saveToLibrary(playlist) {
  const list = loadLibrary();
  const items = playlist.items.map(({ game, config }) => ({ game, config }));
  // Exactly the same name, order, games and settings (what its share code is made of, so it's the same code too).
  const twin = list.find((p) => p.name === playlist.name && sameGames(p, { order: playlist.order, items }));
  if (twin) {
    const moved = [{ ...twin, savedAt: Date.now() }, ...list.filter((p) => p.id !== twin.id)];
    if (!storeLibrary(moved)) throw new Error("Tu navegador no deja guardar playlists aquí.");
    return { list: moved, id: twin.id, name: twin.name };
  }
  const entry = { id: newItemId(), name: freeName(list, playlist.name), order: playlist.order, items, savedAt: Date.now() };
  const next = [entry, ...list].slice(0, LIBRARY_MAX);
  if (!storeLibrary(next)) throw new Error("Tu navegador no deja guardar playlists aquí.");
  return { list: next, id: entry.id, name: entry.name };
}

/** Renames a saved playlist; a name another one has gets "(2)" instead of replacing it. Returns the new list. */
export function renameInLibrary(id, name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (!clean) throw new Error("Escribe un nombre");
  const list = loadLibrary();
  const others = list.filter((p) => p.id !== id);
  const next = list.map((p) => (p.id === id ? { ...p, name: freeName(others, clean) } : p));
  if (!storeLibrary(next)) throw new Error("Tu navegador no deja guardar playlists aquí.");
  return next;
}

export function removeFromLibrary(id) {
  const list = loadLibrary().filter((p) => p.id !== id);
  storeLibrary(list);
  return list;
}

/** A saved playlist as the room's, with new ids for its items. */
export function fromLibrary(entry) {
  return {
    name: entry.name,
    order: entry.order === "aleatorio" ? "aleatorio" : "orden",
    items: entry.items.slice(0, MAX_ITEMS).map((item) => ({ id: newItemId(), game: item.game, config: item.config || {} })),
  };
}
