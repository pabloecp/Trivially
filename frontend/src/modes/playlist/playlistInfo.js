import { FORMATS, LEVELS, TOPICS, quizConfig } from "../quiz/quizInfo.js";
import { DIFFICULTIES as GEO_LEVELS, geoConfig } from "../mundo/geoInfo.js";
import { historyConfig } from "../historia/historyInfo.js";
import { STYLES as MINES_STYLES, minesConfig } from "../minas/minesInfo.js";
import { GAME_MODES, findMode } from "../index.js";

// Playlists of games (backend/src/game/playlist.js): the games a playlist can have, each item's settings, a line
// that sums them up, and the JSON they're shared in.

export const MAX_ITEMS = 20;
export const NAME_MAX = 40;

// The games a playlist can have: every game of the menu but the playlist itself.
export function playlistGames() {
  return GAME_MODES.filter((m) => m.available && m.kind !== "playlist");
}

// Where each game keeps its settings in the room's config (Adivina la canción's are at its top level), as on the server.
const CONFIG_KEY = { opciones: "quiz", mundo: "geo", historia: "history", minas: "mines", musica: null };
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
  // Adivina la canción: the whole catalog, every language, genre and difficulty (the server fills them in the same).
  return { rounds: 5, roundMs: 15000, formats: FORMATS.map((f) => f.id), useCatalog: true, playlistIds: [] };
}

export function newItemId() {
  return Math.random().toString(36).slice(2, 10);
}

// "Historia", "Historia y Arte", "4 categorías"; "Todas" when every one is ticked.
function listText(ids = [], all, { allText, none, many }) {
  if (!ids.length) return none;
  if (ids.length === all.length) return allText;
  if (ids.length > 2) return `${ids.length} ${many}`;
  return ids.map((id) => all.find((x) => x.id === id)?.label || id).join(" y ");
}

const topicsText = (ids) => listText(ids, TOPICS, { allText: "Todas las categorías", none: "Sin categorías", many: "categorías" });
const levelsText = (ids, all = LEVELS) => listText(ids, all, { allText: "Todas las dificultades", none: "Sin dificultad", many: "dificultades" });
const secondsText = (ms) => `${Math.round(ms / 1000)} s`;

function formatsText(ids = []) {
  if (ids.length === FORMATS.length) return null;
  if (!ids.length) return "Sin modo de juego";
  return ids[0] === "opciones" ? "Solo cerradas" : "Solo abiertas";
}

/** One line with an item's settings: "5 tableros · Por turnos · Historia · Fácil". */
export function itemSummary(item, catalog) {
  const c = item.config || {};
  let parts;
  if (item.game === "opciones") {
    parts = [`${c.rounds} preguntas`, topicsText(c.categories), levelsText(c.difficulties), formatsText(c.formats), secondsText(c.roundMs)];
  } else if (item.game === "musica") {
    // The catalog (with its filters) and the room's Spotify playlists.
    const lists = (c.playlistIds || []).length;
    const catalogOn = c.useCatalog !== false;
    const listsText = lists ? `${lists} ${lists === 1 ? "playlist" : "playlists"}` : "";
    const songs = catalogOn ? (lists ? `Catálogo y ${listsText}` : "Catálogo") : listsText || "Sin canciones";
    parts = [`${c.rounds} canciones`, songs, formatsText(c.formats), secondsText(c.roundMs)];
  } else if (item.game === "mundo") {
    parts = [`${c.rounds} países`, levelsText(c.difficulties, GEO_LEVELS)];
  } else if (item.game === "historia") {
    parts = [`${c.rounds} acontecimientos`, topicsText(c.categories), levelsText(c.difficulties), secondsText(c.roundMs)];
  } else if (item.game === "minas") {
    const styles = c.styles || [];
    const style = styles.length === 2 ? "Turnos y carrera" : styles.length ? MINES_STYLES.find((s) => s.id === styles[0])?.label : "Sin modo de juego";
    parts = [`${c.rounds} tableros`, style, topicsText(c.categories), levelsText(c.difficulties)];
  } else {
    parts = [];
  }
  return parts.filter(Boolean).join(" · ");
}

/* ---------- Sharing: the JSON a playlist is copied, downloaded and imported in ---------- */

/**
 * The playlist as a JSON to share: its name, order and games, each with the game's id (the one the server knows),
 * its name (only for people reading it) and its settings.
 */
export function toShareJson(playlist) {
  return JSON.stringify(
    {
      trivially: "playlist",
      version: 1,
      name: playlist.name,
      order: playlist.order,
      items: playlist.items.map(({ game, config }) => ({ game, name: findMode(game)?.name || game, config })),
    },
    null,
    2
  );
}

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// An item's game: its id, or the game's name for a JSON written by hand ("Campo de minas").
function gameOf(item) {
  const games = playlistGames();
  if (games.some((m) => m.id === item?.game)) return item.game;
  const named = games.find((m) => fold(m.name) === fold(item?.game ?? item?.name));
  return named?.id || null;
}

/**
 * A shared playlist read back from its JSON (or a bare list of games). Throws a message to show when it can't be read.
 * Games this site doesn't know are left out (`skipped` says how many); the server checks every setting again.
 */
export function parsePlaylistJson(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? "").trim());
  } catch {
    throw new Error("Ese texto no es un JSON válido. Copia la playlist entera, de la primera llave a la última.");
  }
  const list = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(list)) throw new Error("Ese JSON no tiene una lista de juegos (\"items\").");
  const items = [];
  for (const raw of list) {
    const game = gameOf(raw);
    if (!game) continue;
    const config = raw.config && typeof raw.config === "object" && !Array.isArray(raw.config) ? raw.config : {};
    items.push({ id: newItemId(), game, config });
  }
  if (!items.length) throw new Error("Esa playlist no tiene ningún juego que conozcamos.");
  const name = typeof data?.name === "string" && data.name.trim() ? data.name.trim().slice(0, NAME_MAX) : "Playlist importada";
  return {
    playlist: { name, order: data?.order === "aleatorio" ? "aleatorio" : "orden", items: items.slice(0, MAX_ITEMS) },
    skipped: list.length - items.length + Math.max(0, items.length - MAX_ITEMS),
  };
}

/** Saves the playlist's JSON as a file ("noche-de-juegos.json"). */
export function downloadPlaylist(playlist) {
  const slug = fold(playlist.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "playlist";
  const url = URL.createObjectURL(new Blob([toShareJson(playlist)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- "Mis playlists": the ones saved in this browser ---------- */

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

/**
 * Saves a playlist in this browser, in place of a saved one with the same name. Returns the new list, or throws when
 * the browser doesn't let us keep it.
 */
export function saveToLibrary(playlist) {
  const entry = {
    id: newItemId(),
    name: playlist.name,
    order: playlist.order,
    items: playlist.items.map(({ game, config }) => ({ game, config })),
    savedAt: Date.now(),
  };
  const list = [entry, ...loadLibrary().filter((p) => fold(p.name) !== fold(playlist.name))].slice(0, LIBRARY_MAX);
  if (!storeLibrary(list)) throw new Error("Tu navegador no deja guardar playlists aquí. Descárgala como archivo.");
  return list;
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
