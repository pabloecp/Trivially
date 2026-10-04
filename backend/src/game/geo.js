import { buildGeoQuestions, FLAG_PROMPT, GEO_KINDS, GEO_MODE } from "../geo/geoQuestions.js";
import { toQuestion } from "../questions/questionSchema.js";

// Geografía: its settings (config.geo), how a match draws its questions and how a map round is scored. Its three
// kinds of question are capitals and flags (written answer) and location (a pin on the world map).

export const GEO_GAME = GEO_MODE;
export { GEO_KINDS };
export const GEO_DIFFICULTIES = ["facil", "media", "dificil", "mixta"];
// Same limits as the steppers on screen (frontend/src/modes/mundo/geoInfo.js).
export const GEO_LIMITS = {
  rounds: { min: 5, max: 25 },
  roundMs: { min: 10000, max: 30000 },
};
// A map round always lasts 10 s, whatever the seconds chosen for written answers; its reveal stays longer on screen.
export const LOCATION_ROUND_MS = 10000;
export const LOCATION_REVEAL_MS = 6000;
// Ties for first place are settled with map rounds; after this many without a winner, the tie stands.
export const MAX_TIEBREAKS = 3;
// A pin inside the country gets all the points; outside, the points fall with the distance to its border.
export const LOCATION_MAX_POINTS = 1000;
const LOCATION_NEAR_POINTS = 800;
const LOCATION_FALLOFF_KM = 900;

export function defaultGeoConfig() {
  return { rounds: 10, roundMs: 15000, kinds: [...GEO_KINDS], difficulty: "mixta" };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));

/** Merges a settings change into the current Geografía settings, keeping every value valid. */
export function mergeGeoConfig(current, change = {}) {
  const base = { ...defaultGeoConfig(), ...current };
  const kinds = Array.isArray(change.kinds) ? GEO_KINDS.filter((k) => change.kinds.includes(k)) : base.kinds;
  if (Array.isArray(change.kinds) && !kinds.length) throw new Error("Elige al menos un tipo de pregunta");
  return {
    rounds: change.rounds != null ? clamp(change.rounds, GEO_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, GEO_LIMITS.roundMs, base.roundMs) : base.roundMs,
    kinds,
    difficulty: GEO_DIFFICULTIES.includes(change.difficulty) ? change.difficulty : base.difficulty,
  };
}

/**
 * The Geografía questions of the loaded bank (questions/questionBank.js: Supabase, the private file...). A kind the
 * bank has no questions of (Supabase not set up yet, or not uploaded) comes from geo/countries.js instead.
 */
export function geoBank(questions = []) {
  const rows = questions.filter((q) => q.mode === GEO_MODE && GEO_KINDS.includes(q.data?.kind));
  const missing = GEO_KINDS.filter((kind) => !rows.some((q) => q.data.kind === kind));
  if (!missing.length) return rows;
  return [...rows, ...buildGeoQuestions().filter((q) => missing.includes(q.data.kind)).map(toQuestion)];
}

function questionsFor(bank, { kinds, difficulty }) {
  return bank.filter((q) => kinds.includes(q.data.kind) && (difficulty === "mixta" || q.difficulty === difficulty));
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
    map: d.map || null,
  };
}

/**
 * The questions of a match: as many of each chosen kind as possible (10 rounds of three kinds = 4 + 3 + 3), never
 * two about the same country, in random order.
 */
export function pickGeoQuestions(bank, config) {
  const settings = mergeGeoConfig(config);
  const pools = shuffle(settings.kinds).map((kind) => shuffle(questionsFor(bank, { ...settings, kinds: [kind] })));
  const used = new Set();
  const picked = [];
  while (picked.length < settings.rounds && pools.some((p) => p.length)) {
    for (const pool of pools) {
      if (picked.length >= settings.rounds) break;
      while (pool.length) {
        const q = pool.pop();
        if (used.has(q.data.country)) continue;
        used.add(q.data.country);
        picked.push(q);
        break;
      }
    }
  }
  return shuffle(picked).map(toGeoTrack);
}

/**
 * The map question of a tiebreak: a country not asked in this match, of the match's difficulty (a middling one when
 * it was mixed, so somebody can find it).
 */
export function pickTiebreakQuestion(bank, config, usedCountries = []) {
  const { difficulty } = mergeGeoConfig(config);
  const used = new Set(usedCountries);
  const maps = bank.filter((q) => q.data.kind === "location" && !used.has(q.data.country));
  const level = difficulty === "mixta" ? "media" : difficulty;
  const pool = maps.filter((q) => q.difficulty === level);
  const from = pool.length ? pool : maps;
  return from.length ? toGeoTrack(from[Math.floor(Math.random() * from.length)]) : null;
}

/** Points of a pin: all of them inside the country, then fewer the further it landed. */
export function locationPoints({ inside, distanceKm }) {
  if (inside) return LOCATION_MAX_POINTS;
  return Math.round(LOCATION_NEAR_POINTS * Math.exp(-distanceKm / LOCATION_FALLOFF_KM));
}
