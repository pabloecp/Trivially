// What a question of the trivia modes looks like (the `questions` table in backend/supabase/schema.sql):
//   id, type, mode, category, difficulty, language, prompt, data, active, created_at
// `data` depends on the type:
//   multiple_choice  { "options": ["…", "…", "…", "…"], "correct": 2 }                       (Opción múltiple)
//   open             { "answer": "Madrid", "aliases": ["…"], "reject": ["…"], "flag": "es" }  (Geografía; checked by
//                    game/openAnswers.js, `flag` only on flag questions)
//   location         { "name": "Francia", "map": ["France"] }   (Geografía: a pin on the map, see geo/worldMap.js)
//   year             { "year": 1492 }   (Historia: the year of the event, negative before Christ; there is no year 0)
//   minefield        { "correct": ["España", …], "wrong": ["Marruecos", …] }   (Campo de minas: the 25 cells of the
//                    board, the right answers and the mines)
//   true_false       { "correct": true }
//   audio            { "audio_url": "…", "answers": ["Titi Me Preguntó"] }
// Geografía's questions (mode "mundo") also carry data.kind (capital, flag or location) and data.country (ISO code);
// they are built from geo/countries.js (geo/geoQuestions.js). Historia's (mode "historia") from history/events.js, and
// Campo de minas' (mode "minas") from mines/boards/ (mines/minesQuestions.js).

export const QUESTION_TYPES = ["multiple_choice", "open", "true_false", "audio", "location", "year", "minefield"];
// Types the game can play so far; the others are accepted in the bank but not used yet.
export const PLAYABLE_TYPES = ["multiple_choice", "open", "location", "year", "minefield"];
export const QUESTION_DIFFICULTIES = ["facil", "media", "dificil"];
// Category ids as stored in the database, and the name players see.
export const QUESTION_CATEGORIES = {
  ciencia: "Ciencia",
  historia: "Historia",
  literatura: "Literatura",
  musica: "Música",
  arte: "Arte",
  deportes: "Deportes",
  peliculas_series: "Películas y series",
  videojuegos: "Videojuegos",
  geografia: "Geografía",
  cultura: "Cultura",
};
// Multiple-choice questions have exactly this many options (the game shows them as A–D).
export const OPTION_COUNT = 4;
// A board of Campo de minas is 5 × 5, with this many right answers at least and at most (the rest are mines).
export const MINEFIELD_CELLS = 25;
export const MINEFIELD_CORRECT = { min: 8, max: 17 };

export function categoryName(id) {
  return QUESTION_CATEGORIES[id] || id;
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
// How two answers compare when looking for repeats: no case, no accents.
const plain = (v) => v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Every problem with a question row, in Spanish; an empty list means it is valid. */
export function questionErrors(q) {
  const errors = [];
  if (!q || typeof q !== "object") return ["no es un objeto"];
  if (!QUESTION_TYPES.includes(q.type)) errors.push(`type desconocido: ${q.type}`);
  if (!(q.category in QUESTION_CATEGORIES)) errors.push(`category desconocida: ${q.category}`);
  if (!QUESTION_DIFFICULTIES.includes(q.difficulty)) errors.push(`difficulty desconocida: ${q.difficulty}`);
  if (!isText(q.language)) errors.push("falta language");
  if (!isText(q.prompt)) errors.push("falta prompt");
  if (q.mode != null && !isText(q.mode)) errors.push("mode debe ser texto o null");
  if (!q.data || typeof q.data !== "object") {
    errors.push("falta data");
  } else if (q.type === "multiple_choice") {
    const { options, correct } = q.data;
    if (!Array.isArray(options) || options.length !== OPTION_COUNT || !options.every(isText)) {
      errors.push(`data.options debe tener ${OPTION_COUNT} textos`);
    } else if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) {
      errors.push("data.options tiene opciones repetidas");
    }
    if (!Number.isInteger(correct) || correct < 0 || correct >= OPTION_COUNT) {
      errors.push(`data.correct debe ser un índice de 0 a ${OPTION_COUNT - 1}`);
    }
  } else if (q.type === "open") {
    if (!isText(q.data.answer)) errors.push("falta data.answer");
    for (const field of ["aliases", "reject"]) {
      if (q.data[field] != null && !(Array.isArray(q.data[field]) && q.data[field].every(isText))) {
        errors.push(`data.${field} debe ser una lista de textos`);
      }
    }
    if (q.data.flag != null && !/^[a-z]{2}$/.test(q.data.flag)) errors.push("data.flag debe ser un código de país en minúsculas");
  } else if (q.type === "location") {
    if (!isText(q.data.name)) errors.push("falta data.name");
    if (!Array.isArray(q.data.map) || !q.data.map.length || !q.data.map.every(isText)) {
      errors.push("data.map debe tener al menos un país del mapa");
    }
  } else if (q.type === "year") {
    const { year } = q.data;
    if (!Number.isInteger(year) || year === 0 || year < -5000 || year > new Date().getFullYear()) {
      errors.push("data.year debe ser un año entero, distinto de 0 y no futuro");
    }
  } else if (q.type === "minefield") {
    const { correct, wrong } = q.data;
    if (!Array.isArray(correct) || !correct.every(isText) || !Array.isArray(wrong) || !wrong.every(isText)) {
      errors.push("data.correct y data.wrong deben ser listas de textos");
    } else {
      if (correct.length + wrong.length !== MINEFIELD_CELLS) {
        errors.push(`el tablero debe tener ${MINEFIELD_CELLS} casillas (tiene ${correct.length + wrong.length})`);
      }
      if (correct.length < MINEFIELD_CORRECT.min || correct.length > MINEFIELD_CORRECT.max) {
        errors.push(`data.correct debe tener de ${MINEFIELD_CORRECT.min} a ${MINEFIELD_CORRECT.max} respuestas`);
      }
      const seen = new Set();
      for (const text of [...correct, ...wrong]) {
        if (seen.has(plain(text))) errors.push(`casilla repetida: ${text}`);
        seen.add(plain(text));
      }
    }
  }
  return errors;
}

/** A row from the database or the private file, in the shape the game uses. */
export function toQuestion(row) {
  return {
    id: row.id,
    type: row.type,
    mode: row.mode ?? null,
    category: row.category,
    difficulty: row.difficulty,
    language: row.language,
    prompt: row.prompt.trim(),
    data: row.data,
  };
}
