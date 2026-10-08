// The boards of Campo de minas, one file per category (the ids of QUESTION_CATEGORIES). Each board is
//   [difficulty, prompt, right answers, mines]
// with difficulty 1 fácil, 2 media, 3 difícil, and 25 cells in all (questions/questionSchema.js MINEFIELD_CELLS).
// A mine must be wrong beyond doubt, and a right answer right beyond doubt: nothing that depends on how it's read.
// Keep the cells short, they share a 5 × 5 board on a phone. mines/minesQuestions.js turns them into question rows.
import ciencia from "./ciencia.js";
import historia from "./historia.js";
import literatura from "./literatura.js";
import musica from "./musica.js";
import arte from "./arte.js";
import deportes from "./deportes.js";
import peliculas_series from "./peliculas_series.js";
import videojuegos from "./videojuegos.js";
import geografia from "./geografia.js";
import cultura from "./cultura.js";

export const BOARDS = { ciencia, historia, literatura, musica, arte, deportes, peliculas_series, videojuegos, geografia, cultura };
