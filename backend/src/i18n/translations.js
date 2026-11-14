import { createHash } from "node:crypto";
import { COUNTRIES } from "../geo/countries.js";
import { buildGeoQuestions } from "../geo/geoQuestions.js";
import { EVENTS } from "../history/events.js";
import { FIGURES } from "../history/figures.js";
import { buildHistoryQuestions } from "../history/historyQuestions.js";
import { buildFigureQuestions } from "../history/figureQuestions.js";
import { BOARDS } from "../mines/boards/index.js";
import { buildMinesQuestions } from "../mines/minesQuestions.js";
import { HEADLINES, MOVIE_TITLES, SENTENCES } from "../farsante/content.js";
import { clear, register, registerGlobal, registered } from "./content.js";
import { COUNTRIES_EN } from "./en/countries.js";
import { EVENTS_EN } from "./en/events.js";
import { FIGURES_EN } from "./en/figures.js";
import { BOARDS_EN } from "./en/mines.js";
import { FARSANTE_EN } from "./en/farsante.js";

// Puts the English version of the content next to the Spanish one (i18n/content.js): the repo's own content (countries,
// events, figures, boards, Farsante's prompts) from i18n/en/, and Trivia's questions (private, in Supabase) from their
// English twin rows.

/** A short fingerprint of a Spanish text: its translation is only used while the original is still the same. */
export const textHash = (text) => createHash("sha1").update(String(text)).digest("hex").slice(0, 6);

// The English of a list item, if the entry at the same position was written for this very text.
const aligned = (list, index, text) => (list?.[index]?.[0] === textHash(text) ? list[index] : null);

function englishCountry(c) {
  const en = COUNTRIES_EN[c.code];
  if (!en) return c;
  const label = en.label || en.name;
  return {
    ...c,
    name: en.name,
    label,
    capital: en.capital ?? c.capital,
    capitalAliases: [...new Set([...(en.capitalAliases || []), ...c.capitalAliases])].filter((a) => a !== (en.capital ?? c.capital)),
    aliases: [...new Set([...(en.aliases || []), ...c.aliases])].filter((a) => a !== en.name),
  };
}

function pairRows(esRows, enRows) {
  esRows.forEach((row, i) => register(row, enRows[i]));
}

/** The repo's content, in both languages. */
export function registerRepoContent() {
  pairRows(buildGeoQuestions(COUNTRIES), buildGeoQuestions(COUNTRIES.map(englishCountry), "en"));

  const events = EVENTS.map((e, i) => {
    const hit = aligned(EVENTS_EN, i, e[2]);
    return hit ? [e[0], e[1], hit[1], e[3]] : e;
  });
  pairRows(buildHistoryQuestions(EVENTS), buildHistoryQuestions(events));

  const figures = FIGURES.map((f, i) => {
    const hit = aligned(FIGURES_EN, i, f[2]);
    return hit ? [f[0], f[1], hit[1], f[3], hit[2] ?? f[4] ?? ""] : f;
  });
  pairRows(buildFigureQuestions(FIGURES), buildFigureQuestions(figures));

  const boards = {};
  for (const [category, list] of Object.entries(BOARDS)) {
    boards[category] = list.map((b, i) => {
      const hit = aligned(BOARDS_EN[category], i, b[1]);
      return hit && hit[2].length === b[2].length && hit[3].length === b[3].length ? [b[0], hit[1], hit[2], hit[3]] : b;
    });
  }
  pairRows(buildMinesQuestions(BOARDS), buildMinesQuestions(boards));

  // Farsante's own prompts.
  const prompts = {};
  for (const [name, list] of [["MOVIE_TITLES", MOVIE_TITLES], ["SENTENCES", SENTENCES], ["HEADLINES", HEADLINES]]) {
    list.forEach((text, i) => {
      const hit = aligned(FARSANTE_EN[name], i, text);
      if (hit) prompts[text] = hit[1];
    });
  }
  registerGlobal(prompts);
}

/** Trivia's questions: each English twin row (data.translation_of is the id of its Spanish one) next to its original. */
export function registerTwins(esRows, twinRows) {
  const byId = new Map(esRows.map((row) => [row.id, row]));
  let linked = 0;
  for (const twin of twinRows) {
    const es = byId.get(twin.data?.translation_of);
    if (!es || es.type !== twin.type) continue;
    register(es, { ...twin, prompt: twin.prompt.trim() });
    linked += 1;
  }
  return linked;
}

/** Called once at boot, after the question bank loads. */
export function loadTranslations(esRows = [], twinRows = []) {
  clear();
  try {
    registerRepoContent();
  } catch (err) {
    console.warn(`[Idioma] No se pudo unir el contenido en inglés del repo (${err.message})`);
  }
  const twins = registerTwins(esRows, twinRows);
  console.log(`[Idioma] ${registered()} preguntas con versión en inglés (${twins} de Trivia)`);
}
