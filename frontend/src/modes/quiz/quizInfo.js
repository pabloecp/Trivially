// Difficulty levels of "Trivia" (same ids as QUIZ_DIFFICULTIES in backend/src/game/quiz.js). The harder, the
// deeper the blue; mixed takes the butter accent (colours in styles/quiz.css).
export const DIFFICULTIES = [
  { id: "mixta", label: "Mixta", hint: "Las tres mezcladas", color: "quiz-accent", stars: 0 },
  { id: "facil", label: "Fácil", hint: "Para calentar", color: "quiz-light", stars: 1 },
  { id: "media", label: "Media", hint: "Un poco de todo", color: "quiz", stars: 2 },
  { id: "dificil", label: "Difícil", hint: "Solo expertos", color: "quiz-deep", stars: 3 },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

// The topics (QUESTION_CATEGORIES in backend/src/questions/questionSchema.js), in the order they show.
export const TOPICS = [
  { id: "cultura", label: "Cultura" },
  { id: "ciencia", label: "Ciencia" },
  { id: "historia", label: "Historia" },
  { id: "geografia", label: "Geografía" },
  { id: "literatura", label: "Literatura" },
  { id: "arte", label: "Arte" },
  { id: "musica", label: "Música" },
  { id: "peliculas_series", label: "Películas y series" },
  { id: "videojuegos", label: "Videojuegos" },
  { id: "deportes", label: "Deportes" },
];

// The ways of answering (QUIZ_FORMATS on the server): choosing (one of four, or the year on a timeline) or writing.
export const FORMATS = [
  { id: "opciones", label: "Opciones", hint: "Elige una de cuatro o el año en la línea del tiempo" },
  { id: "escribir", label: "Escribir", hint: "Escribe la respuesta" },
];

// The difficulties a match can mix (QUIZ_LEVELS on the server), any of them ticked.
export const LEVELS = DIFFICULTIES.filter((d) => d.id !== "mixta");

// Same limits as QUIZ_LIMITS on the server.
export const QUESTIONS_LIMITS = { min: 5, max: 20, step: 5 };
export const SECONDS_LIMITS = { min: 15, max: 35, step: 5 };
export const QUIZ_REVEAL_S = 3;

export function quizConfig(room) {
  const quiz = room?.config?.quiz || {};
  return {
    rounds: quiz.rounds || 5,
    roundMs: quiz.roundMs || 15000,
    difficulties: quiz.difficulties || LEVELS.map((d) => d.id),
    categories: quiz.categories || TOPICS.map((t) => t.id),
    formats: quiz.formats || FORMATS.map((f) => f.id),
  };
}

// The four answers always keep the same colour and letter, like the buttons of a game show.
export const OPTION_LETTERS = ["A", "B", "C", "D"];
