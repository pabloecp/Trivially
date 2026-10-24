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
