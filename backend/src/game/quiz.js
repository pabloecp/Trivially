import { categoryName, QUESTION_CATEGORIES } from "../questions/questionSchema.js";
import { toGeoTrack } from "./geo.js";

// "Trivia", the main mode: its settings (config.quiz) and how a match draws its questions. A match mixes the two ways
// of answering: four options and a written answer (capitals, flags...). The host picks the topics (`categories`), the
// ways of answering (`formats`) and the difficulties (`difficulties`): each is a list of the chosen ones, all of them
// by default. Every four-option question of the bank can also be asked written, without its options, so one added for
// "Opciones" shows up in "Escribir" too. (The years on a timeline are Línea del tiempo's, a mode of its own.)

export const QUIZ_MODE = "opciones";
export const QUIZ_LEVELS = ["facil", "media", "dificil"];
// Older clients send one `difficulty`, "mixta" being all three.
export const QUIZ_DIFFICULTIES = [...QUIZ_LEVELS, "mixta"];
// The ways of answering, and the question types each one plays: choosing one of four ("opciones") or writing
// ("escribir").
export const QUIZ_FORMATS = ["opciones", "escribir"];
const FORMAT_OF_TYPE = { multiple_choice: "opciones", open: "escribir" };
const TOPICS = Object.keys(QUESTION_CATEGORIES);
// Same limits as the settings on screen (frontend/src/modes/quiz/quizInfo.js).
export const QUIZ_LIMITS = {
  rounds: { min: 5, max: 20 },
  roundMs: { min: 15000, max: 35000 },
};
// The same wait between rounds as every mode (game/scoring.js).
export { REVEAL_MS as QUIZ_REVEAL_MS } from "./scoring.js";

export function defaultQuizConfig() {
  return { rounds: 5, roundMs: 15000, difficulties: [...QUIZ_LEVELS], categories: [...TOPICS], formats: [...QUIZ_FORMATS] };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));
const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);

// A single difficulty of an older client as the list of levels it means.
const levelsOf = (difficulty) => (difficulty === "mixta" ? [...QUIZ_LEVELS] : QUIZ_LEVELS.includes(difficulty) ? [difficulty] : null);

/**
 * Merges a settings change into the current settings, keeping every value valid. Any list may be left empty (the
 * match then has no questions and can't start).
 */
export function mergeQuizConfig(current, change = {}) {
  const base = { ...defaultQuizConfig(), ...current };
  const baseLevels = levelsOf(current?.difficulty) && !current?.difficulties ? levelsOf(current.difficulty) : base.difficulties;
  const difficulties = pickList(change.difficulties, QUIZ_LEVELS, levelsOf(change.difficulty) || baseLevels);
  const formats = pickList(change.formats, QUIZ_FORMATS, base.formats);
  return {
    rounds: change.rounds != null ? clamp(change.rounds, QUIZ_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, QUIZ_LIMITS.roundMs, base.roundMs) : base.roundMs,
    difficulties,
    categories: pickList(change.categories, TOPICS, base.categories),
    formats,
  };
}

// Four-option questions that only make sense with the options in view ("¿Cuál de estos…?", "todas las anteriores").
const NEEDS_OPTIONS = /\b(de (los|las) siguientes|de (estos|estas|ellos|ellas)|cu[aá]l(es)? de|ninguna|todas las anteriores|todos los anteriores|ambas)\b/i;

/**
 * A four-option question as a written one: the right option is the answer and the other three are rejected (so the
 * typo tolerance never accepts a wrong option). It keeps the id of the original with ":escribir" after it, and
 * `baseId` says they are the same question (a match never asks both).
 */
function asWritten(q) {
  const { options, correct } = q.data;
  const answer = options[correct];
  if (NEEDS_OPTIONS.test(q.prompt) || NEEDS_OPTIONS.test(answer)) return null;
  return {
    ...q,
    id: `${q.id}:escribir`,
    baseId: q.id,
    type: "open",
    data: { answer, aliases: [], reject: options.filter((_, i) => i !== correct) },
  };
}

/**
 * Every question this mode can ask: the bank's own (for any mode, or this one), each four-option one also as a
 * written question, plus Encuentra el país's capitals and flags (`geoQuestions`), which that mode also plays on its
 * own.
 */
export function quizPool(bank = [], geoQuestions = []) {
  const own = bank.filter((q) => FORMAT_OF_TYPE[q.type] && (q.mode == null || q.mode === QUIZ_MODE));
  const written = own.filter((q) => q.type === "multiple_choice").map(asWritten).filter(Boolean);
  const capitals = geoQuestions.filter((q) => q.type === "open");
  return [...own, ...written, ...capitals];
}

/** What makes two pool entries the same question: a country, or the id of the question they come from. */
const sameQuestion = (q) => (q.data?.country ? `country:${q.data.country}` : q.baseId || q.id);

export const formatOf = (q) => FORMAT_OF_TYPE[q.type];

/** The questions that match the settings. `ignore` leaves one filter out (to count what each chip would add). */
function questionsFor(pool, config, ignore = null) {
  const { difficulties, categories, formats } = mergeQuizConfig(config);
  return pool.filter(
    (q) =>
      (ignore === "difficulties" || difficulties.includes(q.difficulty)) &&
      (ignore === "categories" || categories.includes(q.category)) &&
      (ignore === "formats" || formats.includes(formatOf(q)))
  );
}

/** How many different questions a match with these settings can draw from (it needs one per round). */
export function countQuestions(pool, config) {
  return new Set(questionsFor(pool, config).map(sameQuestion)).size;
}

/**
 * For the settings' chips: how many questions each topic, way of answering and difficulty has with the other
 * settings.
 */
export function questionCounts(pool, config) {
  const tally = (ignore, key) => {
    const out = {};
    for (const q of questionsFor(pool, config, ignore)) out[key(q)] = (out[key(q)] || 0) + 1;
    return out;
  };
  return {
    categories: tally("categories", (q) => q.category),
    formats: tally("formats", formatOf),
    difficulties: tally("difficulties", (q) => q.difficulty),
  };
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A question as a round of the room (these objects stay on the server; see RoomManager.publicQuestion). `type` says
 * how it's answered: "choice" (options shuffled, `answer` is the right one's position) or "open" (written, checked by
 * isCorrectOpenAnswer).
 */
export function toQuizTrack(q) {
  const category = categoryName(q.category);
  if (q.type === "open") {
    const track = toGeoTrack(q);
    return { ...track, type: "open", text: track.prompt, category };
  }
  const order = shuffle(q.data.options.map((_, i) => i));
  return {
    id: q.id,
    type: "choice",
    text: q.prompt,
    category,
    difficulty: q.difficulty,
    options: order.map((i) => q.data.options[i]),
    answer: order.indexOf(q.data.correct),
  };
}

/**
 * The questions of a match: the kinds of question (four options, a written answer) share the rounds as evenly as they
 * can (10 rounds = 5 + 5), never two about the same country or the same question, in random order.
 */
export function pickQuizQuestions(pool, config) {
  const settings = mergeQuizConfig(config);
  const matching = questionsFor(pool, settings);
  const pools = shuffle(Object.keys(FORMAT_OF_TYPE))
    .map((type) => shuffle(matching.filter((q) => q.type === type)))
    .filter((p) => p.length);
  const seen = new Set();
  const picked = [];
  while (picked.length < settings.rounds && pools.some((p) => p.length)) {
    for (const p of pools) {
      if (picked.length >= settings.rounds) break;
      while (p.length) {
        const q = p.pop();
        const key = sameQuestion(q);
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(q);
        break;
      }
    }
  }
  return shuffle(picked).map(toQuizTrack);
}
