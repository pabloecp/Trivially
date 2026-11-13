// The daily challenge example numbers (the real challenge, game/daily.js, comes with the account: `user.daily`), on the
// game's card (ModeStage). Your elo is real (eloIn), and how many are playing each game comes from lib/playing.js.
const EXAMPLES = {
  // The general elo, in Inicio's boxes before a game is chosen (the Clásico itself shows your rank: RankBox).
  clasico: { elo: 1284, week: 38, daily: { goal: "Acierta 10 seguidas", how: "En cualquier juego", done: 4, of: 10 } },
  opciones: { elo: 742, week: 21, daily: { goal: "Acierta 15 preguntas", how: "En Abiertas", done: 9, of: 15 } },
  musica: { elo: 615, week: 38, daily: { goal: "Acierta 10 canciones", how: "En Cerradas", done: 4, of: 10 } },
  mundo: { elo: 803, week: 12, daily: { goal: "Pon 5 pines dentro", how: "Por bandera", done: 2, of: 5 } },
  historia: { elo: 568, week: -6, daily: { goal: "Queda a 1 de 3 cifras", how: "En cualquier partida", done: 1, of: 3 } },
  minas: { elo: 690, week: 17, daily: { goal: "Sobrevive 3 tableros", how: "En carrera", done: 0, of: 3 } },
  lluvia: { elo: 527, week: 9, daily: { goal: "Atrapa 20 preguntas", how: "En una partida", done: 11, of: 20 } },
  rey: { elo: 731, week: 26, daily: { goal: "Destrona al rey 5 veces", how: "En cualquier partida", done: 3, of: 5 } },
  farsante: { elo: 654, week: 4, daily: { goal: "Engaña a 6 jugadores", how: "Con tus respuestas", done: 2, of: 6 } },
};

/** An elo as it reads on screen, always with its thousands point: 1.284. */
export const formatElo = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** `{ elo, week, daily }` for a game (or the Clásico's, the general one), or null for what isn't one. */
export const gameStats = (game) => EXAMPLES[game] || null;

const ELO_START = 500;
const CLASSIC_ELO_GAMES = ["opciones", "historia", "minas"];

/** Your real elo in a game ("clasico": the general one, the average of its games), 500 before you have played it. Guests have none. */
export function eloIn(user, game) {
  const of = (g) => user?.elo?.[g]?.rating ?? ELO_START;
  if (game === "clasico") return Math.round(CLASSIC_ELO_GAMES.reduce((sum, g) => sum + of(g), 0) / CLASSIC_ELO_GAMES.length);
  return of(game);
}
