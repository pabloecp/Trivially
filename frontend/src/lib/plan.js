import { useCallback, useEffect, useState } from "react";
import { findMode, isGameTile } from "../modes/index.js";

// "Vas a jugar": what the next match is and who it's for, as "¿Qué quieren jugar?" sets it. `audience` is "publica"
// ("Partida pública": a public match of that game) or "grupo" ("Partida privada": a match of your own, or of your group,
// started by you or its leader). In a private match the game is the room's (its host changes it); in a group on Inicio
// the plan is the group's (its leader's, group.plan); alone it's this device's own, kept in localStorage.

// The games a public match can be searched for by name (PUBLIC_GAMES on the server): Rey de la colina and Farsante need
// people who know each other. The Clásico can be public too: with "Partida pública" it's the roulette's public match.
export const PUBLIC_GAMES = ["opciones", "musica", "mundo", "historia", "minas", "lluvia"];
export const CLASSIC = "clasico";
export const isPublicGame = (game) => PUBLIC_GAMES.includes(game) || game === CLASSIC;
// What "Vas a jugar" can be: a game, or the Clásico.
const plannable = (game) => game === CLASSIC || isGameTile(findMode(game) || {});

export const AUDIENCES = [
  { value: "publica", label: "Partida pública", icon: "globe" },
  { value: "grupo", label: "Partida privada", icon: "users" },
];
export const audienceOf = (audience) => AUDIENCES.find((a) => a.value === audience) || AUDIENCES[1];
export const audienceName = (audience) => audienceOf(audience).label;

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

// Every screen of the tab shares it (the bar and "¿Qué quieren jugar?" are apart). It's read the first time it's used,
// not when this file loads: the games (modes/index.js, which imports this file through its screens) may not be there
// yet, and the plan saved would be lost to Trivia on every reload.
let current = null;
const listeners = new Set();
const currentPlan = () => (current ||= readPlan());

/** This device's plan, for when there's no room yet. */
export function useLocalPlan() {
  const [plan, setPlan] = useState(currentPlan);
  useEffect(() => {
    listeners.add(setPlan);
    return () => listeners.delete(setPlan);
  }, []);
  const update = useCallback((change) => {
    current = { ...currentPlan(), ...change };
    // A game that can't be public takes the public side back to Trivia.
    if (current.audience === "publica" && !isPublicGame(current.game)) current.game = DEFAULT.game;
    savePlan(current);
    listeners.forEach((fn) => fn(current));
  }, []);
  return [plan, update];
}

/** Keeps this device's plan in step with the room's or the group's, so leaving them finds what was being played. */
export function rememberPlan(plan) {
  if (!plan?.game || !plannable(plan.game)) return;
  const audience = AUDIENCES.some((a) => a.value === plan.audience) ? plan.audience : "grupo";
  const now = currentPlan();
  if (now.game === plan.game && now.audience === audience) return;
  current = { game: plan.game, audience };
  savePlan(current);
  listeners.forEach((fn) => fn(current));
}
