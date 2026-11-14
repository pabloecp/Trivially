// The game's content (questions, boards, events, countries...) is written in Spanish. Every player sees it in their own
// language, even in the same room: the server keeps the Spanish as the original and, for each question, a small map
// "Spanish text -> English text" (`localize` swaps them in what goes out to a player). The map of a question is built by
// pairing its Spanish row with its English one (`register`). A question with no English version goes out in Spanish.
// Answers that are written are accepted in either language (`otherAnswers`).

export const LANGS = ["es", "en"];

/** The language a player asks for: English or, for anything else, the game's own Spanish. */
export const normalizeLang = (lang) => (lang === "en" ? "en" : "es");

// Category names, as players read them (QUESTION_CATEGORIES in questions/questionSchema.js).
export const CATEGORY_EN = {
  Ciencia: "Science",
  Historia: "History",
  Literatura: "Literature",
  "Música": "Music",
  Arte: "Art",
  Deportes: "Sports",
  "Películas y series": "Movies and series",
  Videojuegos: "Video games",
  "Geografía": "Geography",
  Cultura: "Culture",
};

// row id -> { map, alt, altWritten }
const registry = new Map();
// Texts that are not a question's (Farsante's prompts...): the same translation wherever they appear.
export const globalMap = {};
export function registerGlobal(map) {
  Object.assign(globalMap, map);
}

/** Every text that differs between the Spanish value and the English one, paired by position. */
function pair(es, en, out) {
  if (typeof es === "string" && typeof en === "string") {
    if (es !== en) out[es] = en;
  } else if (Array.isArray(es) && Array.isArray(en)) {
    es.forEach((item, i) => pair(item, en[i], out));
  } else if (es && en && typeof es === "object" && typeof en === "object") {
    for (const key of Object.keys(es)) pair(es[key], en[key], out);
  }
  return out;
}

const list = (v) => (Array.isArray(v) ? v : []);

/** Links a Spanish question row to its English version (same shape: prompt, data). */
export function register(esRow, enRow) {
  if (!esRow?.id || !enRow) return;
  const map = pair({ prompt: esRow.prompt, data: stripTexts(esRow.data) }, { prompt: enRow.prompt, data: stripTexts(enRow.data) }, {});
  const entry = { map, alt: null, altWritten: null };
  const es = esRow.data || {};
  const en = enRow.data || {};
  if (esRow.type === "open") {
    entry.alt = { answer: en.answer, aliases: list(en.aliases), reject: list(en.reject) };
  } else if (esRow.type === "multiple_choice" && list(en.options).length === list(es.options).length && Number.isInteger(es.correct)) {
    entry.altWritten = {
      answer: en.options[es.correct],
      aliases: list(en.aliases),
      reject: en.options.filter((_, i) => i !== es.correct),
    };
  }
  registry.set(esRow.id, entry);
}

// The parts of `data` that are text players read: everything but the numbers, flags and codes.
function stripTexts(data) {
  if (!data || typeof data !== "object") return data;
  const { correct, image, credit, flag, kind, country, map, year, value, aliases, reject, ...rest } = data;
  // A minefield has its right and wrong cells as lists in `correct` and `wrong`.
  if (Array.isArray(correct)) rest.correct = correct;
  return rest;
}

export function clear() {
  registry.clear();
  for (const key of Object.keys(globalMap)) delete globalMap[key];
}

export const registered = () => registry.size;

const baseId = (id) => (typeof id === "string" ? id.replace(/:escribir$/, "") : id);

/** The Spanish-to-English map of a question (by the id of a round's question; a written copy shares its original's). */
export function mapFor(id) {
  return registry.get(baseId(id))?.map || null;
}

/** The English way of answering a round's question in writing, to accept besides the Spanish one. */
export function otherAnswers(id) {
  const entry = registry.get(baseId(id));
  if (!entry) return [];
  const written = typeof id === "string" && id.endsWith(":escribir");
  const alt = written ? entry.altWritten : entry.alt;
  return alt?.answer ? [alt] : [];
}

/** `value` with every text that has an English version swapped (deeply; numbers and structure stay as they are). */
export function localize(value, ...maps) {
  const usable = [...maps.filter(Boolean), globalMap];
  const swap = (text) => {
    for (const map of usable) if (Object.prototype.hasOwnProperty.call(map, text)) return map[text];
    return CATEGORY_EN[text] ?? text;
  };
  const walk = (v) => {
    if (typeof v === "string") return swap(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v)) out[key] = walk(v[key]);
      return out;
    }
    return v;
  };
  return walk(value);
}
