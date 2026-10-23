import { useEffect, useState } from "react";
import { MATCH_VARIANTS, ROUNDS_PER_GAME } from "../components/home/matchInfo.js";

// Partidas públicas: the games each player votes for before searching (Casual and Competitivo, "Elegir juegos" in
// PlayPage). One vote per game the match has (1 juego: one, 3 juegos: three); a vote is a variant's id
// (MATCH_VARIANTS) or RANDOM_VOTE ("Al azar": any of them). Each format (Duelo or todos contra todos, 1 or 3 juegos)
// keeps its own votes, so changing one never changes another. Kept on this device (localStorage key
// `trivially_match_votes`: { "2x5": ["trivia-cerradas"], "5x15": [...] }, only the votes that aren't "Al azar"), or
// for this visit only where the browser won't keep them.
export const RANDOM_VOTE = "azar";
const KEY = "trivially_match_votes";
const EVENT = "trivially:matchvotes";
let memory = {};

export const voteKey = (size, rounds) => `${size}x${rounds}`;
export const voteSlots = (rounds) => Math.max(1, Math.round(rounds / ROUNDS_PER_GAME));

function readAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return memory;
  }
}

// The games voted for in this format, oldest first: known variants only, each once, at most one per vote.
function readPicks(size, rounds) {
  const list = readAll()[voteKey(size, rounds)];
  if (!Array.isArray(list)) return [];
  const known = list.filter((id, i) => MATCH_VARIANTS.some((v) => v.id === id) && list.indexOf(id) === i);
  return known.slice(-voteSlots(rounds));
}

function savePicks(size, rounds, picks) {
  memory = { ...readAll(), [voteKey(size, rounds)]: picks };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/**
 * This format's votes. `picks`: the games voted for, oldest first; `random`: how many votes are "Al azar" (all of them
 * until the player picks); `votes`: every vote, the picks then "Al azar". `toggle(id)` takes a game's vote back, or
 * gives it one: when every vote is already on a game, the oldest moves to this one. `toRandom()` moves the oldest
 * vote on a game to "Al azar". Read on every render, so switching formats shows that format's votes at once.
 */
export function useMatchVotes(size, rounds) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const sync = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const slots = voteSlots(rounds);
  const picks = readPicks(size, rounds);
  const change = (next) => savePicks(size, rounds, next);
  return {
    slots,
    picks,
    random: slots - picks.length,
    votes: [...picks, ...Array(slots - picks.length).fill(RANDOM_VOTE)],
    toggle: (id) => change(picks.includes(id) ? picks.filter((p) => p !== id) : [...picks, id].slice(-slots)),
    toRandom: () => picks.length && change(picks.slice(1)),
  };
}
