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
const STYLE_KEY = "trivially_results_retouch";
const TONE_KEY = "trivially_results_tone";
// The results screens (between games and at the end) and the intro's roulette and tutorial: everyone sees the "panel"
// style (each player's points under the name) in the "neutro" tone (dark rows, the winners ringed in the match's
// colour); an owner can try "barras" (a bar as long as the points) and the "color" tone (all in the match's colour).
export const RESULTS_STYLES = ["panel", "barras"];
const getResultsStyle = () => {
  const style = read(STYLE_KEY, "panel");
  return RESULTS_STYLES.includes(style) ? style : "panel";
};
const getResultsTone = () => (read(TONE_KEY, "neutro") === "color" ? "color" : "neutro");
export const setResultsStyle = (style) => write(STYLE_KEY, RESULTS_STYLES.includes(style) ? style : "panel");
export const setResultsTone = (tone) => write(TONE_KEY, tone === "color" ? "color" : "neutro");

/** The admin panel's own choice, whatever the view. */
export function useResultsChoice() {
  const style = useSyncExternalStore(subscribe, getResultsStyle, () => "panel");
  const tone = useSyncExternalStore(subscribe, getResultsTone, () => "neutro");
  return { style, tone };
}

const USUAL = { style: "panel", tone: "neutro" };
/** The results look this device shows: the owner's choice in debug view, otherwise the usual one. */
export function useResultsLook() {
  const debug = useOwnerDebug();
  const choice = useResultsChoice();
  return debug ? choice : USUAL;
}

// How a public match's scoreboard (the room's column) says who already won a game: "frase" (the usual one, everyone's:
// "· Ganó Trivia" on the line under the name), "numeros" (the games won in a box beside the points) or "insignia" (the
// number on the player's face). Owners try the other two from the admin panel, only in debug view.
const SCORE_KEY = "trivially_scoreboard_look";
export const SCOREBOARD_LOOKS = ["frase", "numeros", "insignia"];
const getScoreboardLook = () => {
  const look = read(SCORE_KEY, "frase");
  return SCOREBOARD_LOOKS.includes(look) ? look : "frase";
};
export const setScoreboardLook = (look) => write(SCORE_KEY, SCOREBOARD_LOOKS.includes(look) ? look : "frase");

/** The admin panel's own choice, whatever the view. */
export function useScoreboardChoice() {
  return useSyncExternalStore(subscribe, getScoreboardLook, () => "frase");
}

/** The scoreboard this device shows: the owner's choice in debug view, otherwise "frase". */
export function useScoreboardLook() {
  const debug = useOwnerDebug();
  const choice = useScoreboardChoice();
  return debug ? choice : "frase";
}
