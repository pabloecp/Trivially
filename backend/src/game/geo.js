import { COUNTRIES } from "../geo/countries.js";
import { buildGeoQuestions, FLAG_PROMPT, GEO_KINDS, GEO_MODE } from "../geo/geoQuestions.js";
import { toQuestion } from "../questions/questionSchema.js";

// ISO code → the country's names in the map file.
const MAP_NAMES = new Map(COUNTRIES.filter((c) => c.map.length).map((c) => [c.code, c.map]));

// Encuentra el país: its settings (config.geo), how a match draws its countries and how a map round is scored. Its only
// way of playing is "location" (a pin on the world map). The bank also has capitals and flags (written answers), but
// they are Trivia's: game/quiz.js takes them from geoBank().

export const GEO_GAME = GEO_MODE;
// The difficulties a match can mix, any of them ticked (all by default), like Trivia's.
export const GEO_LEVELS = ["facil", "media", "dificil"];
// Older clients send one `difficulty`, "mixta" being all three.
export const GEO_DIFFICULTIES = [...GEO_LEVELS, "mixta"];
// Same limits as the sliders on screen (frontend/src/modes/mundo/geoInfo.js).
export const GEO_LIMITS = {
  rounds: { min: 5, max: 25 },
  // Seconds to put the pin, like Adivina la canción's: 15–35 s in steps of 5.
  roundMs: { min: 15000, max: 35000 },
};
// A map round lasts config.geo.roundMs (15 s in a new room); its reveal waits the same as every mode's (game/scoring.js).
export const LOCATION_ROUND_MS = 15000;
export { REVEAL_MS as LOCATION_REVEAL_MS } from "./scoring.js";
// Ties for first place are settled with map rounds; after this many without a winner, the tie stands.
export const MAX_TIEBREAKS = 3;
// A pin inside the country gets all the points; outside, the points fall with the distance to its border.
export const LOCATION_MAX_POINTS = 1000;
const LOCATION_NEAR_POINTS = 800;
const LOCATION_FALLOFF_KM = 900;

export function defaultGeoConfig() {
  return { rounds: 5, roundMs: LOCATION_ROUND_MS, difficulties: [...GEO_LEVELS] };
}

// A single difficulty of an older client (or room) as the list of levels it means.
const levelsOf = (difficulty) => (difficulty === "mixta" ? [...GEO_LEVELS] : GEO_LEVELS.includes(difficulty) ? [difficulty] : null);

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));

/**
 * Merges a settings change into the current Encuentra el país settings, keeping every value valid. The difficulties
 * can be left all unticked: the match then has no questions and can't start. The `kinds` an older client may send are
 * dropped: every round is a map round. `roundMs` goes in steps of 5 s.
 */
export function mergeGeoConfig(current, change = {}) {
  const base = { ...defaultGeoConfig(), ...current };
  const baseLevels = !Array.isArray(current?.difficulties) && levelsOf(current?.difficulty) ? levelsOf(current.difficulty) : base.difficulties;
  const difficulties = Array.isArray(change.difficulties)
    ? GEO_LEVELS.filter((d) => change.difficulties.includes(d))
    : levelsOf(change.difficulty) || baseLevels;
  return {
    rounds: change.rounds != null ? clamp(change.rounds, GEO_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs:
      change.roundMs != null
        ? Math.round(clamp(change.roundMs, GEO_LIMITS.roundMs, base.roundMs) / 5000) * 5000
        : clamp(base.roundMs, GEO_LIMITS.roundMs, LOCATION_ROUND_MS),
    difficulties,
  };
}

/**
 * The geography questions of the loaded bank (questions/questionBank.js: Supabase, the private file...), of every kind:
 * this game plays the "location" ones and Trivia the written ones (capitals, flags). A kind the bank has no questions
 * of (Supabase not set up yet, or not uploaded) comes from geo/countries.js instead.
 */
export function geoBank(questions = []) {
  const rows = questions.filter((q) => q.mode === GEO_MODE && GEO_KINDS.includes(q.data?.kind));
  const missing = GEO_KINDS.filter((kind) => !rows.some((q) => q.data.kind === kind));
  if (!missing.length) return rows;
  return [...rows, ...buildGeoQuestions().filter((q) => missing.includes(q.data.kind)).map(toQuestion)];
}

// The map questions of the bank in these difficulties.
function questionsFor(bank, { difficulties }) {
  return bank.filter((q) => q.data.kind === "location" && difficulties.includes(q.difficulty));
}

/** How many questions a match with these settings can draw from (it needs one per round). */
export function countGeoQuestions(bank, config) {
  return questionsFor(bank, mergeGeoConfig(config)).length;
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A question as a round of the room (these objects stay on the server; see RoomManager.publicState). */
export function toGeoTrack(q) {
  const d = q.data;
  return {
    id: q.id,
    kind: d.kind,
    difficulty: q.difficulty,
    country: d.country,
    name: d.name,
    prompt: d.kind === "flag" ? FLAG_PROMPT : q.prompt,
    answer: d.kind === "location" ? d.name : d.answer,
    aliases: d.aliases || [],
    reject: d.reject || [],
    flag: d.flag || null,
    // Capitals and flags too: their reveal shows the country on the map.
    map: d.map || MAP_NAMES.get(d.country) || null,
  };
}

/** The countries of a match, in random order, never the same one twice. */
export function pickGeoQuestions(bank, config) {
  const settings = mergeGeoConfig(config);
  const used = new Set();
  const picked = [];
  for (const q of shuffle(questionsFor(bank, settings))) {
    if (picked.length >= settings.rounds) break;
    if (used.has(q.data.country)) continue;
    used.add(q.data.country);
    picked.push(q);
  }
  return picked.map(toGeoTrack);
}

/**
 * The map question of a tiebreak: a country not asked in this match, of one of the match's difficulties (a middling
 * one when it's ticked, so somebody can find it).
 */
export function pickTiebreakQuestion(bank, config, usedCountries = []) {
  const { difficulties } = mergeGeoConfig(config);
  const used = new Set(usedCountries);
  const maps = bank.filter((q) => q.data.kind === "location" && !used.has(q.data.country));
  const level = difficulties.includes("media") || !difficulties.length ? "media" : difficulties[0];
  const pool = maps.filter((q) => q.difficulty === level);
  const from = pool.length ? pool : maps;
  return from.length ? toGeoTrack(from[Math.floor(Math.random() * from.length)]) : null;
}

/** Points of a pin: all of them inside the country, then fewer the further it landed. */
export function locationPoints({ inside, distanceKm }) {
  if (inside) return LOCATION_MAX_POINTS;
  return Math.round(LOCATION_NEAR_POINTS * Math.exp(-distanceKm / LOCATION_FALLOFF_KM));
}
