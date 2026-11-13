import { useSyncExternalStore } from "react";
import { useApp } from "./store.jsx";

// What only owners have: the "Vista" switch of the owner panel (the owner's own tools, "debug", or the site as any
// player sees it). It lives in this browser only; the server checks the account before doing anything with it.
const VIEW_KEY = "trivially_owner_view";
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

// "Animaciones" (Ajustes): the Blobs stay still (no jumps nor looks), for this device. Anyone can turn it on.
const STILL_KEY = "trivially_blobs_still";
export const setBlobsStill = (still) => write(STILL_KEY, still ? "1" : "0");
export const useBlobsStillChoice = () => useSyncExternalStore(subscribe, () => read(STILL_KEY, "0") === "1", () => false);

// Adivina la canción · Letra with Cerradas: everyone sees "normal" (three lines of lyrics over the options); an owner,
// in debug view, can try "grandes" (only the last two lines, so the four options are as big as Trivia's), from the
// admin panel. Only on this device.
const LYRICS_VIEW_KEY = "trivially_lyrics_view";
const getLyricsView = () => (read(LYRICS_VIEW_KEY, "normal") === "grandes" ? "grandes" : "normal");
export const setLyricsView = (view) => write(LYRICS_VIEW_KEY, view === "grandes" ? "grandes" : "normal");
/** The admin panel's own choice, whatever the view. */
export const useLyricsViewChoice = () => useSyncExternalStore(subscribe, getLyricsView, () => "normal");

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

// The results screens an owner sees (between games and at the end of a match), to try the new designs in real matches:
// "actual" (the usual one), "barras" (a bar per player beside the podium, in the match's colour or neutral) or "panel"
// (the usual one, with each player's points under their name and their games won on the right). Only in debug view;
// everyone else, and the owner in "Usuario normal", sees "actual".
// The "_2" keys start the owners over on the new defaults (what they had picked before is left behind).
const STYLE_KEY = "trivially_results_retouch_2";
const TONE_KEY = "trivially_results_tone_2";
// The results screen at the end, and the tone of the card before each game (MatchIntro): everyone sees the "barras"
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

/** Letra with Cerradas on this screen: the owner's choice in debug view, "normal" for everyone else. */
export function useLyricsView() {
  const debug = useOwnerDebug();
  const choice = useLyricsViewChoice();
  return debug ? choice : "normal";
}

/** Whether the Blobs stay still on this screen: whoever turned on "Animaciones: Quietos" in "Ajustes". */
export function useBlobsStill() {
  return useBlobsStillChoice();
}
