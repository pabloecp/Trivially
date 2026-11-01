import { useSyncExternalStore } from "react";
import { useApp } from "./store.jsx";

// What only owners have: the "Vista" switch of the admin panel (the owner's own tools, "debug", or the site as any
// player sees it) and the games an owner forces on its own public match. Both live in this browser only; the server
// checks the account before doing anything with them.
const VIEW_KEY = "trivially_owner_view";
const FORCED_KEY = "trivially_forced_games";
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
  emit();
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** "debug" (the owner's tools show) or "usuario" (the site as a normal player sees it). */
export const getOwnerView = () => (read(VIEW_KEY, "debug") === "usuario" ? "usuario" : "debug");
export const setOwnerView = (view) => write(VIEW_KEY, view === "usuario" ? "usuario" : "debug");

/** The variant ids forced for this owner's public matches, in order ([] means the usual random draw). */
export function getForcedGames() {
  try {
    const list = JSON.parse(read(FORCED_KEY, "[]"));
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}
export const setForcedGames = (list) => write(FORCED_KEY, JSON.stringify(list.filter((id) => typeof id === "string")));

// How the Blobs are drawn (their skin): everyone sees "sombra" (its colour with a shadow inside, low on the right); an
// owner, in debug view, can try "plano" (only the colour) and "luz" (the shadow and a light high on the left), from the
// admin panel. Only on this device.
const BLOB_STYLE_KEY = "trivially_blob_style";
export const BLOB_STYLES = ["plano", "sombra", "luz"];
const getBlobStyle = () => {
  const style = read(BLOB_STYLE_KEY, "sombra");
  return BLOB_STYLES.includes(style) ? style : "sombra";
};
export const setBlobStyle = (style) => write(BLOB_STYLE_KEY, BLOB_STYLES.includes(style) ? style : "sombra");
/** The owner's choice, whatever the view (the admin panel's switch). */
export const useBlobStyleChoice = () => useSyncExternalStore(subscribe, getBlobStyle, () => "sombra");

// "Reducir movimiento" (the admin panel): the Blobs stay still (no jumps nor looks). Only an owner can turn it on,
// for this device; everyone else always sees them move.
const STILL_KEY = "trivially_blobs_still";
export const setBlobsStill = (still) => write(STILL_KEY, still ? "1" : "0");
export const useBlobsStillChoice = () => useSyncExternalStore(subscribe, () => read(STILL_KEY, "0") === "1", () => false);

/** Whether this account is an owner. */
export function useIsOwner() {
  const { user } = useApp();
  const owner = user?.role === "owner" && !user?.isGuest;
  return owner;
}

/** An owner who is looking at the site with their tools on (the "Vista owner (debug)" of the admin panel). */
export function useOwnerDebug() {
  const owner = useIsOwner();
  const view = useSyncExternalStore(subscribe, getOwnerView, () => "debug");
  return owner && view === "debug";
}

export function useOwnerView() {
  return useSyncExternalStore(subscribe, getOwnerView, () => "debug");
}

export function useForcedGames() {
  const raw = useSyncExternalStore(subscribe, () => read(FORCED_KEY, "[]"), () => "[]");
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

// The results screens an owner sees (between games and at the end of a match), to try the new designs in real matches:
// "actual" (the usual one), "barras" (a bar per player beside the podium, in the match's colour or neutral) or "panel"
// (the usual one, with each player's points under their name and their games won on the right). Only in debug view;
// everyone else, and the owner in "Usuario normal", sees "actual".
// The "_2" keys start the owners over on the new defaults (what they had picked before is left behind).
const STYLE_KEY = "trivially_results_retouch_2";
const TONE_KEY = "trivially_results_tone_2";
// The results screens (between games and at the end) and the intro's roulette and tutorial: everyone sees the "barras"
// style (a bar as long as the points) in the "color" tone (all in the match's colour); an owner can try "panel" (each
// player's points under the name) and the "neutro" tone (dark rows, the winners ringed in the match's colour).
export const RESULTS_STYLES = ["panel", "barras"];
const getResultsStyle = () => {
  const style = read(STYLE_KEY, "barras");
  return RESULTS_STYLES.includes(style) ? style : "barras";
};
const getResultsTone = () => (read(TONE_KEY, "color") === "neutro" ? "neutro" : "color");
export const setResultsStyle = (style) => write(STYLE_KEY, RESULTS_STYLES.includes(style) ? style : "barras");
export const setResultsTone = (tone) => write(TONE_KEY, tone === "neutro" ? "neutro" : "color");

/** The admin panel's own choice, whatever the view. */
export function useResultsChoice() {
  const style = useSyncExternalStore(subscribe, getResultsStyle, () => "barras");
  const tone = useSyncExternalStore(subscribe, getResultsTone, () => "color");
  return { style, tone };
}

const USUAL = { style: "barras", tone: "color" };
/** The results look this device shows: the owner's choice in debug view, otherwise the usual one. */
export function useResultsLook() {
  const debug = useOwnerDebug();
  const choice = useResultsChoice();
  return debug ? choice : USUAL;
}

// How a public match's scoreboard (the room's column) says who already won a game: "insignia" (the usual one, everyone's:
// the number on the player's face, with a small crown), "frase" ("· Ganó Trivia" on the line under the name) or "numeros"
// (the games won in a box beside the points). Owners try the other two from the admin panel, only in debug view; the
// badge is "neutro" (crown and number) or "color" (the number in a box).
const SCORE_KEY = "trivially_scoreboard_look_2";
const BADGE_KEY = "trivially_scoreboard_badge";
export const SCOREBOARD_LOOKS = ["frase", "numeros", "insignia"];
const getScoreboardLook = () => {
  const look = read(SCORE_KEY, "insignia");
  return SCOREBOARD_LOOKS.includes(look) ? look : "insignia";
};
export const setScoreboardLook = (look) => write(SCORE_KEY, SCOREBOARD_LOOKS.includes(look) ? look : "insignia");
const getScoreboardBadge = () => (read(BADGE_KEY, "neutro") === "color" ? "color" : "neutro");
export const setScoreboardBadge = (tone) => write(BADGE_KEY, tone === "color" ? "color" : "neutro");

/** The admin panel's own choice of badge ("neutro": crown and number; "color": the number in a box), whatever the view. */
export function useScoreboardBadgeChoice() {
  return useSyncExternalStore(subscribe, getScoreboardBadge, () => "neutro");
}

/** The badge this device shows: the owner's choice in debug view, otherwise with the crown. */
export function useScoreboardBadge() {
  const debug = useOwnerDebug();
  const choice = useScoreboardBadgeChoice();
  return debug ? choice : "neutro";
}

/** The admin panel's own choice, whatever the view. */
export function useScoreboardChoice() {
  return useSyncExternalStore(subscribe, getScoreboardLook, () => "insignia");
}

/** The scoreboard this device shows: the owner's choice in debug view, otherwise "insignia". */
export function useScoreboardLook() {
  const debug = useOwnerDebug();
  const choice = useScoreboardChoice();
  return debug ? choice : "insignia";
}

/** The Blobs' skin on this screen: the owner's choice in debug view, "sombra" for everyone else. */
export function useBlobStyle() {
  const debug = useOwnerDebug();
  const style = useBlobStyleChoice();
  return debug ? style : "sombra";
}

/** Whether the Blobs stay still on this screen: only for an owner who turned on "Reducir movimiento". */
export function useBlobsStill() {
  const owner = useIsOwner();
  const still = useBlobsStillChoice();
  return owner && still;
}
