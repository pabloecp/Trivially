import { translate as tr } from "../../lib/i18n.js";
// Difficulty levels of "Trivia" (same ids as QUIZ_DIFFICULTIES in backend/src/game/quiz.js). The harder, the
// deeper the blue; mixed takes the butter accent (colours in styles/quiz.css).
export const DIFFICULTIES = [
  { id: "mixta", get label() { return tr("Mixta"); }, get hint() { return tr("Las tres mezcladas"); }, color: "quiz-accent", stars: 0 },
  { id: "facil", get label() { return tr("Fácil"); }, get hint() { return tr("Para calentar"); }, color: "quiz-light", stars: 1 },
  { id: "media", get label() { return tr("Media"); }, get hint() { return tr("Un poco de todo"); }, color: "quiz", stars: 2 },
  { id: "dificil", get label() { return tr("Difícil"); }, get hint() { return tr("Solo expertos"); }, color: "quiz-deep", stars: 3 },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

// The topics (QUESTION_CATEGORIES in backend/src/questions/questionSchema.js), in the order they show.
export const TOPICS = [
  { id: "cultura", get label() { return tr("Cultura"); } },
  { id: "ciencia", get label() { return tr("Ciencia"); } },
  { id: "historia", get label() { return tr("Historia"); } },
  { id: "geografia", get label() { return tr("Geografía"); } },
  { id: "literatura", get label() { return tr("Literatura"); } },
  { id: "arte", get label() { return tr("Arte"); } },
  { id: "musica", get label() { return tr("Música"); } },
  { id: "peliculas_series", get label() { return tr("Películas y series"); } },
  { id: "videojuegos", get label() { return tr("Videojuegos"); } },
  { id: "deportes", get label() { return tr("Deportes"); } },
];

// The ways of answering, "Tipo de respuestas" (QUIZ_FORMATS on the server; not a modo de juego): closed questions, one of four to choose, or open ones,
// the answer written. Adivina la canción uses the same two.
export const FORMATS = [
  { id: "opciones", get label() { return tr("Cerradas"); }, get hint() { return tr("Elige una de cuatro opciones"); } },
  { id: "escribir", get label() { return tr("Abiertas"); }, get hint() { return tr("Escribe la respuesta"); } },
];

// The modes of play, "Modos de juego" (QUIZ_STYLES on the server): they change which questions are asked. Clásico, the
// text ones; Imágenes, those that come with a picture (the flags, a film's scene...). Both ticked by default.
export const STYLES = [
  { id: "clasico", get label() { return tr("Clásico"); }, get hint() { return tr("Preguntas de texto"); } },
  { id: "imagenes", get label() { return tr("Imágenes"); }, get hint() { return tr("Cada pregunta trae una imagen"); } },
];

// The difficulties a match can mix (QUIZ_LEVELS on the server), any of them ticked.
export const LEVELS = DIFFICULTIES.filter((d) => d.id !== "mixta");

// Same limits as QUIZ_LIMITS on the server.
export const QUESTIONS_LIMITS = { min: 5, max: 25, step: 5 };
export const SECONDS_LIMITS = { min: 15, max: 35, step: 5 };

export function quizConfig(room) {
  const quiz = room?.config?.quiz || {};
  return {
    rounds: quiz.rounds || 5,
    roundMs: quiz.roundMs || 15000,
    difficulties: quiz.difficulties || LEVELS.map((d) => d.id),
    categories: quiz.categories || TOPICS.map((t) => t.id),
    formats: quiz.formats || FORMATS.map((f) => f.id),
    styles: quiz.styles || STYLES.map((st) => st.id),
  };
}

// The four answers always keep the same colour and letter, like the buttons of a game show.
export const OPTION_LETTERS = ["A", "B", "C", "D"];
