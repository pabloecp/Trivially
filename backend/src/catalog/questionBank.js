import { readFileSync } from "node:fs";

// Open-answer question banks (src/catalog/questions/*.json), one per game. Keys are the game ids of GAME_IDS.
const FILES = { mundo: "geografia.json" };

const cache = new Map();

export function loadQuestions(game) {
  if (!FILES[game]) return [];
  if (!cache.has(game)) {
    cache.set(game, JSON.parse(readFileSync(new URL(`./questions/${FILES[game]}`, import.meta.url), "utf8")));
  }
  return cache.get(game);
}

export function isQuestionGame(game) {
  return Boolean(FILES[game]);
}

/** `count` different random questions of the game's bank (fewer if the bank is smaller). */
export function pickQuestions(game, count) {
  const pool = [...loadQuestions(game)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
