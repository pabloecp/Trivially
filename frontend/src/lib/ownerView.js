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
