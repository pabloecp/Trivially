import { buildHistoryQuestions, HISTORY_MODE } from "../history/historyQuestions.js";
import { QUESTION_CATEGORIES, toQuestion } from "../questions/questionSchema.js";

// Historia: its settings (config.history), how a match draws its events, the range of years each one is shown with
// and how a year is scored. Players choose a year on a timeline: the exact year gets every point, and the closer
// a guess lands, the more it gets.

export const HISTORY_GAME = HISTORY_MODE;
// The four ages, by the event's year. The event that opens an age belongs to it (476, 1492, 1789).
export const HISTORY_ERAS = ["antigua", "media", "moderna", "contemporanea"];
export const HISTORY_LEVELS = ["facil", "media", "dificil"];
// Older clients send one `difficulty`, "mixta" being all three.
export const HISTORY_DIFFICULTIES = [...HISTORY_LEVELS, "mixta"];
// The topics of the events (the ids of QUESTION_CATEGORIES, the same "Temas" as Trivia).
const TOPICS = Object.keys(QUESTION_CATEGORIES);
// Same limits as the settings on screen (frontend/src/modes/historia/historyInfo.js).
export const HISTORY_LIMITS = {
  rounds: { min: 5, max: 25 },
  roundMs: { min: 10000, max: 30000 },
};
// The reveal waits the same as every mode's (game/scoring.js).
export { REVEAL_MS as HISTORY_REVEAL_MS } from "./scoring.js";
// The timeline of each age: how many years it covers, and the round number its ends fall on.
const TIMELINES = {
  antigua: { span: 1500, round: 100 },
  media: { span: 750, round: 50 },
  moderna: { span: 300, round: 20 },
  contemporanea: { span: 150, round: 10 },
};
// The exact year gets all the points; otherwise they fall with the distance, faster in the ages whose dates are better
// known (10 years off is a good guess for Roman times, a poor one for the 20th century). The pace doesn't depend on
// how long the timeline is: a longer one only leaves more room to miss.
export const YEAR_MAX_POINTS = 1000;
const YEAR_NEAR_POINTS = 800;
const YEAR_FALLOFF = { antigua: 150, media: 75, moderna: 30, contemporanea: 15 };

export function eraOf(year) {
  if (year <= 476) return "antigua";
  if (year < 1492) return "media";
  if (year < 1789) return "moderna";
  return "contemporanea";
}

export function defaultHistoryConfig() {
  return { rounds: 5, roundMs: 10000, eras: [...HISTORY_ERAS], categories: [...TOPICS], difficulties: [...HISTORY_LEVELS] };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));

const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);
// A single difficulty of an older client as the list of levels it means.
const levelsOf = (difficulty) => (difficulty === "mixta" ? [...HISTORY_LEVELS] : HISTORY_LEVELS.includes(difficulty) ? [difficulty] : null);

/**
 * Merges a settings change into the current Historia settings, keeping every value valid. Any list may be left empty
 * (the match then has no events and can't start).
 */
export function mergeHistoryConfig(current, change = {}) {
  const base = { ...defaultHistoryConfig(), ...current };
  const baseLevels = levelsOf(current?.difficulty) && !current?.difficulties ? levelsOf(current.difficulty) : base.difficulties;
  return {
    rounds: change.rounds != null ? clamp(change.rounds, HISTORY_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, HISTORY_LIMITS.roundMs, base.roundMs) : base.roundMs,
    eras: pickList(change.eras, HISTORY_ERAS, base.eras),
    categories: pickList(change.categories, TOPICS, base.categories),
    difficulties: pickList(change.difficulties, HISTORY_LEVELS, levelsOf(change.difficulty) || baseLevels),
  };
}

/**
 * The Historia questions: the events of history/events.js (the source of truth, with their topics) plus any other
 * Historia rows of the loaded bank (questions/questionBank.js: Supabase...), so an event added to the list is played
 * before it is uploaded, and a row only in the database is still played. Where both have the same id, the list wins.
 */
export function historyBank(questions = []) {
  const built = buildHistoryQuestions().map(toQuestion);
  const known = new Set(built.map((q) => q.id));
  const extra = questions.filter((q) => q.mode === HISTORY_MODE && q.type === "year" && !known.has(q.id));
  return [...built, ...extra];
}

/** The events that match the settings. `ignore` leaves one filter out (to count what each chip would add). */
function questionsFor(bank, config, ignore = null) {
  const { eras, categories, difficulties } = mergeHistoryConfig(config);
  return bank.filter(
    (q) =>
      (ignore === "eras" || eras.includes(eraOf(q.data.year))) &&
      (ignore === "categories" || categories.includes(q.category)) &&
      (ignore === "difficulties" || difficulties.includes(q.difficulty))
  );
}

/** How many events a match with these settings can draw from (it needs one per round). */
export function countHistoryQuestions(bank, config) {
  return questionsFor(bank, config).length;
}

/** For the settings' chips: how many events each topic, age and difficulty has with the other settings. */
export function historyCounts(bank, config) {
  const tally = (ignore, key) => {
    const out = {};
    for (const q of questionsFor(bank, config, ignore)) out[key(q)] = (out[key(q)] || 0) + 1;
    return out;
  };
  return {
    categories: tally("categories", (q) => q.category),
    eras: tally("eras", (q) => eraOf(q.data.year)),
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

/** How a year is written: 44 a. C. for the negative ones. */
export function yearLabel(year) {
  return year < 0 ? `${-year} a. C.` : String(year);
}

/** Years between two years, knowing there is no year 0 (from 1 a. C. to 1 d. C. is one year). */
export function yearsApart(a, b) {
  const gap = Math.abs(a - b);
  return a < 0 !== b < 0 ? gap - 1 : gap;
}

/**
 * The timeline of an event: its age's `span` of years between two round numbers, with the year inside and never at
 * either end, drawn at random so where the year sits says nothing. A recent event's timeline can reach the next round
 * year after today (2030); the years still to come show but can't be chosen (placeYear). Year 0 doesn't exist, so it
 * is never an end.
 */
export function yearRange(year, random = Math.random) {
  const { span, round: step } = TIMELINES[eraOf(year)];
  const limit = Math.ceil(currentYear() / step) * step;
  const options = [];
  for (let min = Math.floor((year - span) / step) * step + step; min < year; min += step) {
    const max = min + span;
    if (max <= limit && min !== 0 && max !== 0) options.push({ min, max });
  }
  const pick = options.length ? options[Math.floor(random() * options.length)] : { min: limit - span, max: limit };
  return { ...pick, span };
}

export function currentYear() {
  return new Date().getFullYear();
}

/** Points of a guess `diff` years away from an event of that age. */
export function yearPoints(diff, era) {
  if (diff === 0) return YEAR_MAX_POINTS;
  return Math.round(YEAR_NEAR_POINTS * Math.exp(-diff / YEAR_FALLOFF[era]));
}

/** An event as a round of the room (these objects stay on the server; see RoomManager.publicState). */
export function toHistoryTrack(q) {
  const year = q.data.year;
  const { min, max } = yearRange(year);
  return { id: q.id, prompt: q.prompt, year, era: eraOf(year), difficulty: q.difficulty, min, max };
}

/**
 * The events of a match: the chosen ages share the rounds as evenly as they can (10 rounds of four ages = 3 + 3 + 2 +
 * 2), never two events of the same year, in random order.
 */
export function pickHistoryQuestions(bank, config) {
  const settings = mergeHistoryConfig(config);
  const pools = shuffle(settings.eras).map((era) => shuffle(questionsFor(bank, { ...settings, eras: [era] })));
  const years = new Set();
  const picked = [];
  while (picked.length < settings.rounds && pools.some((p) => p.length)) {
    for (const pool of pools) {
      if (picked.length >= settings.rounds) break;
      while (pool.length) {
        const q = pool.pop();
        if (years.has(q.data.year)) continue;
        years.add(q.data.year);
        picked.push(q);
        break;
      }
    }
  }
  return shuffle(picked).map(toHistoryTrack);
}

/**
 * The event of a tiebreak: one not asked in this match, from the chosen ages and topics, of a middling difficulty when
 * the match had it, else of the one it had.
 */
export function pickHistoryTiebreak(bank, config, usedIds = []) {
  const settings = mergeHistoryConfig(config);
  const used = new Set(usedIds);
  const left = questionsFor(bank, { ...settings, difficulties: [...HISTORY_LEVELS] }).filter((q) => !used.has(q.id));
  const level = settings.difficulties.includes("media") ? "media" : settings.difficulties[0];
  const pool = left.filter((q) => q.difficulty === level);
  const from = pool.length ? pool : left;
  return from.length ? toHistoryTrack(from[Math.floor(Math.random() * from.length)]) : null;
}
