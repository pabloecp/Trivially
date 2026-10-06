import { stableId } from "../geo/geoQuestions.js";
import { EVENTS } from "./events.js";

// The Historia questions, built from history/events.js as rows of the `questions` table (mode "historia"):
//   type "year"  data { year }   (the year of the event; negative before Christ)
// The range of years players choose from is not stored: it is drawn for each match (game/history.js yearRange).
// `npm run history:upload --prefix backend` copies them to Supabase. Ids are derived from the event's text, so
// uploading again updates the same rows.

export const HISTORY_MODE = "historia";
const DIFFICULTY = { 1: "facil", 2: "media", 3: "dificil" };

export function buildHistoryQuestions(events = EVENTS) {
  return events.map(([year, level, text]) => ({
    id: stableId(`historia:${text}`),
    type: "year",
    mode: HISTORY_MODE,
    category: "historia",
    difficulty: DIFFICULTY[level],
    language: "es",
    prompt: text,
    data: { year },
    active: true,
  }));
}
