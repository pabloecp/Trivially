import { QUESTION_CATEGORIES } from "../questions/questionSchema.js";
import { sameQuestion, toQuizTrack } from "./quiz.js";
import { rainPool } from "./rain.js";

// Rey de la colina: its settings (config.rey), how a match draws its questions and what each one is worth. One player
// is the king. Each round the king picks, among three questions (one of each difficulty when all are ticked), the one
// the others have to answer by writing. The first to get it right takes the crown (the round ends at once); when
// nobody does (everyone fails or the time runs out), the king keeps it and scores the question's points: the harder
// the question they picked, the more it's worth. Whoever has the most points when the rounds are over wins.
// The questions are Trivia's written ones (the same pool as Lluvia's, without flags).

export const REY_GAME = "rey";
export const REY_CATEGORIES = Object.keys(QUESTION_CATEGORIES);
export const REY_LEVELS = ["facil", "media", "dificil"];
export const REY_POINTS = { facil: 1, media: 3, dificil: 5 };
// Same limits as the settings on screen (frontend/src/modes/rey/reyInfo.js).
export const REY_LIMITS = {
  rounds: { min: 5, max: 20 },
  roundMs: { min: 15000, max: 35000 },
};
// How long the king has to pick a question (if they don't, one of the three is picked for them).
export const REY_PICK_MS = 10000;
// A match needs at least this many different questions (with fewer, the rounds ask some again).
export const REY_MIN_QUESTIONS = 12;
export const REY_OFFERS = 3;
export const REY_REVEAL_MS = 4000;

export function defaultReyConfig() {
  return { rounds: 10, roundMs: 20000, categories: [...REY_CATEGORIES], difficulties: [...REY_LEVELS] };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));
const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);

/** Merges a settings change into the current ones, keeping every value valid (a list can be left empty: no match). */
export function mergeReyConfig(current, change = {}) {
  const base = { ...defaultReyConfig(), ...current };
  return {
    rounds: change.rounds != null ? clamp(change.rounds, REY_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, REY_LIMITS.roundMs, base.roundMs) : base.roundMs,
    categories: pickList(change.categories, REY_CATEGORIES, base.categories),
    difficulties: pickList(change.difficulties, REY_LEVELS, base.difficulties),
  };
}

/** The questions Rey de la colina can ask: Lluvia's (Trivia's written ones, without flags). */
export const reyPool = rainPool;

function questionsFor(pool, config, ignore = null) {
  const { categories, difficulties } = mergeReyConfig(config);
  return pool.filter(
    (q) => (ignore === "categories" || categories.includes(q.category)) && (ignore === "difficulties" || difficulties.includes(q.difficulty))
  );
}

/** How many different questions a match with these settings can draw from. */
export function countReyQuestions(pool, config) {
  return new Set(questionsFor(pool, config).map(sameQuestion)).size;
}

/** For the settings' chips: how many questions each category and difficulty has with the other settings. */
export function reyCounts(pool, config) {
  const tally = (ignore, key) => {
    const out = {};
    for (const q of questionsFor(pool, config, ignore)) out[key(q)] = (out[key(q)] || 0) + 1;
    return out;
  };
  return { categories: tally("categories", (q) => q.category), difficulties: tally("difficulties", (q) => q.difficulty) };
}

function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Every round's three questions to pick from, drawn when the match starts: one of each ticked difficulty (with fewer
 * ticked, the offers repeat them), never two about the same thing in a round, and not asked before in the match while
 * there are others. A round is `{ id, roundMs, offers: [track, track, track] }`; the picked offer becomes the round
 * (see RoomManager.reyPick).
 */
export function pickReyRounds(pool, config, random = Math.random) {
  const settings = mergeReyConfig(config);
  const matching = questionsFor(pool, settings);
  const levels = settings.difficulties.filter((level) => matching.some((q) => q.difficulty === level));
  if (!levels.length) return [];
  const decks = new Map(levels.map((level) => [level, shuffle(matching.filter((q) => q.difficulty === level), random)]));
  const used = new Set();
  const rounds = [];
  for (let r = 0; r < settings.rounds; r += 1) {
    const inRound = new Set();
    const offers = [];
    for (let i = 0; i < REY_OFFERS; i += 1) {
      const first = levels[i % levels.length];
      let question = null;
      for (const level of [first, ...levels.filter((l) => l !== first)]) {
        const deck = decks.get(level);
        question = deck.find((q) => !used.has(sameQuestion(q)) && !inRound.has(sameQuestion(q))) || deck.find((q) => !inRound.has(sameQuestion(q)));
        if (question) break;
      }
      if (!question) continue;
      used.add(sameQuestion(question));
      inRound.add(sameQuestion(question));
      offers.push({ ...toQuizTrack(question), points: REY_POINTS[question.difficulty] || 1 });
    }
    // Easiest first, so the three always read the same way on screen.
    offers.sort((a, b) => REY_LEVELS.indexOf(a.difficulty) - REY_LEVELS.indexOf(b.difficulty));
    rounds.push({ id: `rey-${r + 1}`, type: "open", text: "", roundMs: settings.roundMs, offers });
  }
  return rounds;
}
