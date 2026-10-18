import { stableId } from "../geo/geoQuestions.js";
import { FIGURES } from "./figures.js";
import { HISTORY_MODE } from "./historyQuestions.js";

// The questions of Rango's "Cifras" mode, built from history/figures.js as rows of the `questions` table (mode
// "historia"):
//   type "number"  data { value, unit }   (the answer, a whole number not below 0, and what is written after it)
// The bar players choose on is not stored: it is drawn for each match (game/history.js figureRange).
// `npm run history:upload --prefix backend` copies them to Supabase with the events; the file is played even before
// that (game/history.js historyBank). Ids are derived from the text, so uploading again updates the same rows.

const DIFFICULTY = { 1: "facil", 2: "media", 3: "dificil" };

export function buildFigureQuestions(figures = FIGURES) {
  return figures.map(([value, level, text, topic, unit = ""]) => ({
    id: stableId(`cifras:${text}`),
    type: "number",
    mode: HISTORY_MODE,
    category: topic,
    difficulty: DIFFICULTY[level],
    language: "es",
    prompt: text,
    data: { value, unit },
    active: true,
  }));
}
