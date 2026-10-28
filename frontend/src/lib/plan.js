import { useCallback, useEffect, useState } from "react";
import { findMode, isGameTile } from "../modes/index.js";

// "Vas a jugar": what the next match is and who it's for, as "¿Qué quieren jugar?" sets it. `audience` is "publica"
// ("Partida pública": a public match of that game) or "grupo" ("Partida privada": a match of your own, or of your group,
// started by you or its leader). In a private match the game is the room's (its host changes it); in a group on Inicio
// the plan is the group's (its leader's, group.plan); alone it's this device's own, kept in localStorage.

// The games a public match can be searched for by name (PUBLIC_GAMES on the server): Rey de la colina and Farsante need
// people who know each other.
export const PUBLIC_GAMES = ["opciones", "musica", "mundo", "historia", "minas", "lluvia"];
export const isPublicGame = (game) => PUBLIC_GAMES.includes(game);

export const AUDIENCES = [
  { value: "publica", label: "Partida pública", icon: "globe" },
  { value: "grupo", label: "Partida privada", icon: "users" },
];
export const audienceName = (audience) => AUDIENCES.find((a) => a.value === audience)?.label || AUDIENCES[1].label;

const KEY = "trivially_plan";
const DEFAULT = { audience: "publica", game: "opciones" };

function readPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    const game = findMode(saved?.game) ? saved.game : DEFAULT.game;
    const audience = AUDIENCES.some((a) => a.value === saved?.audience) ? saved.audience : DEFAULT.audience;
    return { audience, game: audience === "publica" && !isPublicGame(game) ? DEFAULT.game : game };
  } catch {
    return DEFAULT;
  }
}

function savePlan(plan) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {}
}

// Every screen of the tab shares it (the bar and "¿Qué quieren jugar?" are apart).
let current = readPlan();
const listeners = new Set();

/** This device's plan, for when there's no room yet. */
export function useLocalPlan() {
  const [plan, setPlan] = useState(current);
  useEffect(() => {
    listeners.add(setPlan);
    return () => listeners.delete(setPlan);
  }, []);
  const update = useCallback((change) => {
    current = { ...current, ...change };
    // A game that can't be public takes the public side back to Trivia.
    if (current.audience === "publica" && !isPublicGame(current.game)) current.game = DEFAULT.game;
    savePlan(current);
    listeners.forEach((fn) => fn(current));
  }, []);
  return [plan, update];
}

/** Keeps this device's plan in step with the room's or the group's, so leaving them finds what was being played. */
export function rememberPlan(plan) {
  if (!plan?.game || !isGameTile(findMode(plan.game) || {})) return;
  const audience = AUDIENCES.some((a) => a.value === plan.audience) ? plan.audience : "grupo";
  if (current.game === plan.game && current.audience === audience) return;
  current = { game: plan.game, audience };
  savePlan(current);
  listeners.forEach((fn) => fn(current));
}
