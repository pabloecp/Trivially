// Partidas públicas ("Casual" and "Competitivo", backend/src/game/matchmaking.js): their names and colours, the
// lengths to choose from, and the short tutorial each game shows after the roulette picks it (MatchIntro.jsx).

export const MATCH_KINDS = {
  casual: {
    id: "casual",
    name: "Casual",
    color: "music",
    icon: "bolt",
    blurb: "Partidas rápidas con gente de todas partes",
    detail: "Preguntas de todos los niveles",
  },
  competitivo: {
    id: "competitivo",
    name: "Competitivo",
    color: "amber",
    icon: "crown",
    blurb: "Para los que juegan en serio",
    detail: "Solo preguntas de nivel medio y difícil",
  },
};

export const MATCH_ROUNDS = [5, 15];
export const ROUNDS_PER_GAME = 5;
// How many players a room needs (MATCH_SIZES on the server): you against one, or five in all.
export const MATCH_SIZES = [
  { value: 2, label: "Duelo", hint: "2 jugadores", icon: "user" },
  { value: 5, label: "Todos contra todos", hint: "5 jugadores", icon: "users" },
];
export const sizeName = (size) => (size === 2 ? "Duelo" : `${size} jugadores`);
// The games a public match draws from, in the roulette's order.
export const MATCH_GAMES = ["opciones", "historia", "minas"];

export const gamesText = (rounds) => {
  const n = Math.round(rounds / ROUNDS_PER_GAME);
  return n === 1 ? "1 juego" : `${n} juegos`;
};

// What to do in each game, short enough to read in the 5 s the tutorial lasts.
export const TUTORIALS = {
  opciones: [
    { icon: "bulb", text: "Te haremos una pregunta de cualquier tema" },
    { icon: "grid", text: "Elige una de las 4 opciones o escribe la respuesta" },
    { icon: "bolt", text: "Acierta rápido: hasta 1000 puntos por ronda" },
  ],
  historia: [
    { icon: "info", text: "Te diremos un suceso o una pregunta con cifra" },
    { icon: "target", text: "Marca el año o el número en la línea" },
    { icon: "star", text: "Más cerca, más puntos: el exacto vale 1000" },
  ],
  minas: [
    { icon: "grid", text: "Un tema y un tablero de 25 respuestas" },
    { icon: "check", text: "Toca las correctas: cada acierto vale más" },
    { icon: "bomb", text: "Si pisas una mina, quedas fuera de la ronda" },
  ],
};
