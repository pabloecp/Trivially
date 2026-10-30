// Your elo in each game (and how much it moved this week), how many people are playing it right now, and its daily
// challenge, on the game's card (ModeStage). None of these systems exists yet: these are example numbers, always the
// same, until the server sends the real ones.
const EXAMPLES = {
  opciones: { elo: 742, week: 21, online: 1284, daily: { goal: "Acierta 15 preguntas", how: "En Abiertas", done: 9, of: 15 } },
  musica: { elo: 615, week: 38, online: 436, daily: { goal: "Acierta 10 canciones", how: "En Cerradas", done: 4, of: 10 } },
  mundo: { elo: 803, week: 12, online: 352, daily: { goal: "Pon 5 pines dentro", how: "Por bandera", done: 2, of: 5 } },
  historia: { elo: 568, week: -6, online: 219, daily: { goal: "Queda a 1 de 3 cifras", how: "En cualquier partida", done: 1, of: 3 } },
  minas: { elo: 690, week: 17, online: 187, daily: { goal: "Sobrevive 3 tableros", how: "En carrera", done: 0, of: 3 } },
  lluvia: { elo: 527, week: 9, online: 164, daily: { goal: "Atrapa 20 preguntas", how: "En una partida", done: 11, of: 20 } },
  rey: { elo: 731, week: 26, online: 96, daily: { goal: "Destrona al rey 5 veces", how: "En cualquier partida", done: 3, of: 5 } },
  farsante: { elo: 654, week: 4, online: 73, daily: { goal: "Engaña a 6 jugadores", how: "Con tus respuestas", done: 2, of: 6 } },
};

/** `{ elo, week, online, daily }` for a game, or null for what isn't one (a playlist, a Clásico). */
export const gameStats = (game) => EXAMPLES[game] || null;
