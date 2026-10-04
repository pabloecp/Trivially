// What a question of the trivia modes looks like (the `questions` table in backend/supabase/schema.sql):
//   id, type, mode, category, difficulty, language, prompt, data, active, created_at
// `data` depends on the type. Only multiple_choice is played so far:
//   multiple_choice  { "options": ["…", "…", "…", "…"], "correct": 2 }
//   open             { "answers": ["Madrid"], "aliases": ["madrid españa"], "match": "fuzzy" }
//   true_false       { "correct": true }
//   audio            { "audio_url": "…", "answers": ["Titi Me Preguntó"] }

export const QUESTION_TYPES = ["multiple_choice", "open", "true_false", "audio"];
// Types the game can play so far; the others are accepted in the bank but not used yet.
export const PLAYABLE_TYPES = ["multiple_choice"];
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

export function categoryName(id) {
  return QUESTION_CATEGORIES[id] || id;
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;

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
