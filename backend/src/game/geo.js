import { COUNTRIES } from "../geo/countries.js";
import { buildGeoQuestions, FLAG_PROMPT, GEO_KINDS, GEO_MODE } from "../geo/geoQuestions.js";
import { hasShape } from "../geo/shapes.js";
import { toQuestion } from "../questions/questionSchema.js";

// ISO code → the country's names in the map file.
const MAP_NAMES = new Map(COUNTRIES.filter((c) => c.map.length).map((c) => [c.code, c.map]));

// Encuentra el país: its settings (config.geo), how a match draws its countries and how a map round is scored. Every
// round is a pin on the world map; what changes is how the country is given ("Modos de juego", `styles`): by its name
// ("nombre"), its silhouette ("sombra") or its flag ("bandera"). The bank also has capitals and flags as written
// answers, but those are Trivia's: game/quiz.js takes them from geoBank().

export const GEO_GAME = GEO_MODE;
// How a round gives the country to find, any of them ticked (all by default): the rounds are shared between them.
export const GEO_STYLES = ["nombre", "sombra", "bandera"];
// What a silhouette round asks (a flag round asks FLAG_PROMPT): never the country's name.
export const SHAPE_PROMPT = "¿De qué país es esta silueta?";
// The difficulties a match can mix, any of them ticked (all by default), like Trivia's.
export const GEO_LEVELS = ["facil", "media", "dificil"];
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
  return { rounds: 5, roundMs: LOCATION_ROUND_MS, styles: [...GEO_STYLES], difficulties: [...GEO_LEVELS] };
}

// A single difficulty of an older client (or room) as the list of levels it means.
const levelsOf = (difficulty) => (difficulty === "mixta" ? [...GEO_LEVELS] : GEO_LEVELS.includes(difficulty) ? [difficulty] : null);

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));
const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);

/**
 * Merges a settings change into the current Encuentra el país settings, keeping every value valid. The ways of giving
 * the country and the difficulties can be left all unticked: the match then has no questions and can't start. A room
 * from before the ways existed gets all three, like a new one. The `kinds` an older client may send are dropped: every
 * round is a map round. `roundMs` goes in steps of 5 s.
 */
export function mergeGeoConfig(current, change = {}) {
  const base = { ...defaultGeoConfig(), ...current };
  const baseLevels = !Array.isArray(current?.difficulties) && levelsOf(current?.difficulty) ? levelsOf(current.difficulty) : base.difficulties;
  const difficulties = Array.isArray(change.difficulties)
    ? GEO_LEVELS.filter((d) => change.difficulties.includes(d))
    : levelsOf(change.difficulty) || baseLevels;
  const baseStyles = Array.isArray(base.styles) ? GEO_STYLES.filter((st) => base.styles.includes(st)) : [...GEO_STYLES];
  return {
    rounds: change.rounds != null ? clamp(change.rounds, GEO_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs:
      change.roundMs != null
        ? Math.round(clamp(change.roundMs, GEO_LIMITS.roundMs, base.roundMs) / 5000) * 5000
        : clamp(base.roundMs, GEO_LIMITS.roundMs, LOCATION_ROUND_MS),
    styles: pickList(change.styles, GEO_STYLES, baseStyles),
    difficulties,
  };
}

/**
 * The geography questions of the loaded bank (questions/questionBank.js: Supabase, the private file...), of every kind:
 * this game plays the "location" and "flag" ones on the map, and Trivia the written ones (capitals, flags). A kind
 * the bank has no questions of (Supabase not set up yet, or not uploaded) comes from geo/countries.js instead.
 */
export function geoBank(questions = []) {
  const rows = questions.filter((q) => q.mode === GEO_MODE && GEO_KINDS.includes(q.data?.kind));
  const missing = GEO_KINDS.filter((kind) => !rows.some((q) => q.data.kind === kind));
  if (!missing.length) return rows;
  return [...rows, ...buildGeoQuestions().filter((q) => missing.includes(q.data.kind)).map(toQuestion)];
}

// The country's names in the map file, or null when it isn't drawn (Tuvalu): then it can't be a map round.
const mapOf = (q) => (q.data.map?.length ? q.data.map : MAP_NAMES.get(q.data.country) || null);

// The questions a way of giving the country plays: the bank's map questions by name or by silhouette (with their
// difficulty; a country too small to have a shape is never a silhouette), and the bank's flag questions, with the
// flag's difficulty, as map rounds.
function questionsOf(bank, style) {
  if (style === "bandera") return bank.filter((q) => q.data.kind === "flag" && q.data.flag && mapOf(q));
  const maps = bank.filter((q) => q.data.kind === "location" && mapOf(q));
  return style === "sombra" ? maps.filter((q) => hasShape(mapOf(q))) : maps;
}

// For each ticked way, its questions in these difficulties.
function poolsFor(bank, { styles, difficulties }) {
  return styles.map((style) => ({ style, questions: questionsOf(bank, style).filter((q) => difficulties.includes(q.difficulty)) }));
}

/**
 * How many rounds a match with these settings can draw (it needs one per round): the countries the ticked ways can
 * ask, since a match never asks the same country twice.
 */
export function countGeoQuestions(bank, config) {
  const countries = new Set();
  for (const { questions } of poolsFor(bank, mergeGeoConfig(config))) for (const q of questions) countries.add(q.data.country);
  return countries.size;
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

/**
 * A question as a map round given in one way (`style`): the country to find, by its name, its silhouette or its flag.
 * The flag (its ISO code) is only kept on the flag rounds.
 */
export function toMapRound(q, style) {
  const track = toGeoTrack(q);
  return {
    ...track,
    kind: "location",
    style,
    prompt: style === "sombra" ? SHAPE_PROMPT : style === "bandera" ? FLAG_PROMPT : track.prompt,
    answer: track.name,
    aliases: [],
    reject: [],
    flag: style === "bandera" ? track.flag : null,
    map: mapOf(q),
  };
}

/**
 * The countries of a match, in random order, never the same one twice. The ticked ways share the rounds as evenly as
 * they can (5 rounds of the three = 2 + 2 + 1), like Campo de minas' boards.
 */
export function pickGeoQuestions(bank, config) {
  const settings = mergeGeoConfig(config);
  const pools = shuffle(poolsFor(bank, settings)).map(({ style, questions }) => ({ style, questions: shuffle(questions) }));
  const used = new Set();
  const picked = [];
  while (picked.length < settings.rounds && pools.some((p) => p.questions.length)) {
    for (const pool of pools) {
      if (picked.length >= settings.rounds) break;
      // This way's next country that the match hasn't asked yet.
      let q = pool.questions.pop();
      while (q && used.has(q.data.country)) q = pool.questions.pop();
      if (!q) continue;
      used.add(q.data.country);
      picked.push(toMapRound(q, pool.style));
    }
  }
  return shuffle(picked);
}

/**
 * The map question of a tiebreak: a country not asked in this match, given in one of the match's ways, of one of its
 * difficulties (a middling one when it's ticked, so somebody can find it).
 */
export function pickTiebreakQuestion(bank, config, usedCountries = []) {
  const { styles, difficulties } = mergeGeoConfig(config);
  const used = new Set(usedCountries);
  const level = difficulties.includes("media") || !difficulties.length ? "media" : difficulties[0];
  for (const style of shuffle(styles.length ? styles : ["nombre"])) {
    const questions = questionsOf(bank, style).filter((q) => !used.has(q.data.country));
    const pool = questions.filter((q) => q.difficulty === level);
    const from = pool.length ? pool : questions;
    if (from.length) return toMapRound(from[Math.floor(Math.random() * from.length)], style);
  }
  return null;
}

/** Points of a pin: all of them inside the country, then fewer the further it landed. */
export function locationPoints({ inside, distanceKm }) {
  if (inside) return LOCATION_MAX_POINTS;
  return Math.round(LOCATION_NEAR_POINTS * Math.exp(-distanceKm / LOCATION_FALLOFF_KM));
}
