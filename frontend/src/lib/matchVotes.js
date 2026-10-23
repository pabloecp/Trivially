import { useEffect, useState } from "react";
import { MATCH_VARIANTS } from "../components/home/matchInfo.js";

// Partidas públicas: the games each player votes for before searching (Casual and Competitivo, "Vota los juegos" in
// PlayPage). One vote per game the match has (1 juego: one, 3 juegos: three); a vote is a variant's id
// (MATCH_VARIANTS) or RANDOM_VOTE ("Al azar": any of them). They go with the search (store's findMatch), and the match's
// roulette spins among everyone's votes (MatchIntro). Each format (Duelo or todos contra todos, 1 or 3 juegos)
// keeps its own votes, so changing one never changes another. Kept on this device (localStorage key
// `trivially_match_votes`: { "2x1": ["trivia-cerradas"], "5x3": [...] }, players x games, only the votes that aren't
// "Al azar"), or for this visit only where the browser won't keep them.
export const RANDOM_VOTE = "azar";
const KEY = "trivially_match_votes";
const EVENT = "trivially:matchvotes";
let memory = {};

export const voteKey = (size, games) => `${size}x${games}`;
// Before a match was counted in games, a format's key had its rounds ("2x5", "5x15"): 5 was one game and 15 three.
const OLD_LENGTHS = { 5: 1, 15: 3 };

function readAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || typeof saved !== "object") return {};
    for (const [key, picks] of Object.entries(saved)) {
      const [size, rounds] = key.split("x");
      if (!OLD_LENGTHS[rounds]) continue;
      saved[voteKey(size, OLD_LENGTHS[rounds])] ??= picks;
      delete saved[key];
    }
    return saved;
  } catch {
    return memory;
  }
}

// The games voted for in this format, oldest first: known variants only, each once, at most one per vote.
function readPicks(size, games) {
  const list = readAll()[voteKey(size, games)];
  if (!Array.isArray(list)) return [];
  const known = list.filter((id, i) => MATCH_VARIANTS.some((v) => v.id === id) && list.indexOf(id) === i);
  return known.slice(-games);
}

/** Every vote of this format, the picks then "Al azar" (what a search sends; useMatchVotes's `votes`). */
export function savedVotes(size, games) {
  const picks = readPicks(size, games);
  return [...picks, ...Array(games - picks.length).fill(RANDOM_VOTE)];
}

function savePicks(size, games, picks) {
  memory = { ...readAll(), [voteKey(size, games)]: picks };
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
export function useMatchVotes(size, games) {
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

  const slots = games;
  const picks = readPicks(size, games);
  const change = (next) => savePicks(size, games, next);
  return {
    slots,
    picks,
    random: slots - picks.length,
    votes: savedVotes(size, games),
    toggle: (id) => change(picks.includes(id) ? picks.filter((p) => p !== id) : [...picks, id].slice(-slots)),
    toRandom: () => picks.length && change(picks.slice(1)),
  };
}
