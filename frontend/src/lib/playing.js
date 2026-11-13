import { useEffect, useState } from "react";
import { api } from "./api.js";

// "N jugando ahora" on a game's card (ModeStage): PLAYING_BASE plus the people really in a room of that game right now,
// which the server counts (GET /api/playing, RoomManager.playingByGame). Asked once for every card on screen and again
// every REFRESH_MS while one is showing.
export const PLAYING_BASE = 500;
const REFRESH_MS = 30_000;

let games = {};
let askedAt = 0;
let asking = null;
const listeners = new Set();

function refresh() {
  if (asking || Date.now() - askedAt < REFRESH_MS - 1000) return;
  asking = api("/api/playing")
    .then((data) => {
      games = data?.games || {};
    })
    // Without an answer the last numbers stay: the card shows the base alone at worst.
    .catch(() => {})
    .finally(() => {
      askedAt = Date.now();
      asking = null;
      listeners.forEach((fn) => fn(games));
    });
}

/** How many are playing `game` now, as the card shows it: the base plus the real ones. */
export function usePlaying(game) {
  const [now, setNow] = useState(games);
  useEffect(() => {
    listeners.add(setNow);
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    return () => {
      listeners.delete(setNow);
      clearInterval(timer);
    };
  }, []);
  return PLAYING_BASE + (Number(now[game]) || 0);
}
