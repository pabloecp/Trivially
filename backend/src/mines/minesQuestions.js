import { stableId } from "../geo/geoQuestions.js";
import { BOARDS } from "./boards/index.js";

// The Campo de minas questions, built from mines/boards/ as rows of the `questions` table (mode "minas"):
//   type "minefield"  data { correct: [...], wrong: [...] }   (the 25 cells of the board: right answers and mines)
// Where each cell lands on the board is not stored: it is shuffled for each match (game/mines.js toMinesBoard).
// `npm run mines:upload --prefix backend` copies them to Supabase. Ids are derived from the prompt, so uploading
// again updates the same rows.

export const MINES_MODE = "minas";
const DIFFICULTY = { 1: "facil", 2: "media", 3: "dificil" };

export function buildMinesQuestions(boards = BOARDS) {
  const rows = [];
  for (const [category, list] of Object.entries(boards)) {
    for (const [level, prompt, correct, wrong] of list) {
      rows.push({
        id: stableId(`minas:${prompt}`),
        type: "minefield",
        mode: MINES_MODE,
        category,
        difficulty: DIFFICULTY[level],
        language: "es",
        prompt,
        data: { correct, wrong },
        active: true,
      });
    }
  }
  return rows;
}
