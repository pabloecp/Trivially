// Partidas públicas ("Casual" and "Competitivo", backend/src/game/matchmaking.js; Competitivo is disabled for now): their
// names and colours, and the short tutorial each game shows after the roulette picks it (MatchIntro.jsx). A match of the
// roulette (the Clásico) plays games of 5 rounds, one after another, until someone has won two.

export const MATCH_KINDS = {
  casual: {
    id: "casual",
    name: "Casual",
    color: "site",
    icon: "bolt",
    blurb: "Juega sin presión, cuando quieras",
    detail: "Para jugar sin presión",
    steps: [
      { icon: "shuffle", text: "Juegos al azar, de 5 rondas cada uno" },
      { icon: "crown", text: "Gana cada juego quien más puntos saque" },
      { icon: "bolt", text: "Gana el primero en ganar 2 juegos" },
    ],
  },
  competitivo: {
    id: "competitivo",
    name: "Competitivo",
    color: "accent",
    icon: "crown",
    blurb: "Gana partidas y sube de rango",
    detail: "Cada victoria cuenta para tu rango",
    steps: [
      { icon: "crown", text: "Cada victoria te sube de rango" },
      { icon: "target", text: "Solo preguntas medias y difíciles" },
      { icon: "lock", text: "Muy pronto disponible" },
    ],
  },
};

export const ROUNDS_PER_GAME = 5;
// How many players a room needs (MATCH_SIZES on the server): you against one, or five in all. "Uno contra Uno" isn't
// offered for now (`hidden`, DUELS_OPEN on the server): OPEN_SIZES are the ones a player can pick.
export const MATCH_SIZES = [
  { value: 2, label: "Uno contra Uno", hint: "1 Jugador", icon: "user", hidden: true },
  { value: 5, label: "Todos contra Todos", hint: "5 Jugadores", icon: "users" },
];
export const OPEN_SIZES = MATCH_SIZES.filter((o) => !o.hidden);
export const sizeName = (size) => (size === 2 ? "Uno contra Uno" : "Todos contra Todos");
// The games a public match draws from, in the roulette's order (gamesFor on the server): Trivia, Rango and Campo de
// minas, in Casual and Competitivo alike.
export const MATCH_GAMES = ["opciones", "historia", "minas"];
export const CASUAL_GAMES = MATCH_GAMES;
export const gamesFor = (kind) => (kind === "casual" ? CASUAL_GAMES : MATCH_GAMES);

// What the roulette really draws (MATCH_VARIANTS on the server): each game with one way of playing it, a game of its
// own in a public match ("Trivia Cerradas" is only four-option questions). `hint` says how it's played in a few words.
export const MATCH_VARIANTS = [
  { id: "trivia-cerradas", game: "opciones", way: "Cerradas", hint: "Elige entre 4 opciones" },
  { id: "trivia-abiertas", game: "opciones", way: "Abiertas", hint: "Escribe la respuesta" },
  { id: "rango-cifras", game: "historia", way: "Cifras", hint: "Un número en una barra" },
  { id: "minas-carrera", game: "minas", way: "Carrera", hint: "Todas las que puedas" },
  // Only searched for by name (PUBLIC_GAMES in lib/plan.js): the roulette never draws them.
  { id: "cancion", game: "musica", way: null, hint: "Adivina el título", byName: true },
  { id: "pais", game: "mundo", way: null, hint: "Pon tu pin en el mapa", byName: true },
  { id: "lluvia", game: "lluvia", way: null, hint: "Responde antes que nadie", byName: true },
];
/** A variant by its id; an older server's plain game id is that game with no way. */
export const findVariant = (id) => MATCH_VARIANTS.find((v) => v.id === id) || { id, game: id, way: null };
export const variantsFor = (kind) => MATCH_VARIANTS.filter((v) => !v.byName && gamesFor(kind).includes(v.game));

// A public match of one game ("Partida pública" with a game picked: PUBLIC_VARIANT on the server): how long it is
// and how it's played, as its card says it ("5 rondas · 10 s · Cerradas"). The times are the public clock (matchTimes).
export const PUBLIC_MATCH = {
  opciones: { rounds: "5 rondas", time: "10 s", way: "Cerradas" },
  musica: { rounds: "5 canciones", time: "15 s", way: "Cerradas y abiertas" },
  mundo: { rounds: "5 países", time: "15 s", way: "Nombre, sombra y bandera" },
  historia: { rounds: "5 rondas", time: "10 s", way: "Cifras" },
  minas: { rounds: "5 tableros", time: "30 s", way: "Carrera" },
  lluvia: { rounds: "2 lluvias", time: "30 s", way: null },
};
export const publicMatchLine = (game) => {
  const p = PUBLIC_MATCH[game];
  return p ? [p.rounds, p.time, p.way].filter(Boolean).join(" · ") : "";
};
export const gamesText = (rounds) => {
  const n = Math.round(rounds / ROUNDS_PER_GAME);
  return n === 1 ? "1 juego" : `${n} juegos`;
};

// What to do in each variant, short enough to read in the 5 s the tutorial lasts.
export const VARIANT_TUTORIALS = {
  "trivia-cerradas": [
    { icon: "bulb", text: "Te haremos una pregunta de cualquier tema" },
    { icon: "grid", text: "Elige la correcta entre 4 opciones" },
    { icon: "bolt", text: "Acierta rápido: hasta 1000 puntos por ronda" },
  ],
  "trivia-abiertas": [
    { icon: "bulb", text: "Te haremos una pregunta de cualquier tema" },
    { icon: "keyboard", text: "Escribe la respuesta: no hace falta que sea exacta" },
    { icon: "bolt", text: "Acierta rápido: hasta 1000 puntos por ronda" },
  ],
  "rango-cifras": [
    { icon: "info", text: "Te haremos una pregunta cuya respuesta es un número" },
    { icon: "target", text: "Marca el número en la barra" },
    { icon: "star", text: "Más cerca, más puntos: el exacto vale 1000" },
  ],
  "minas-carrera": [
    { icon: "grid", text: "Un tema y un tablero de 25 respuestas" },
    { icon: "bolt", text: "Carrera: toca todas las correctas que puedas, rápido" },
    { icon: "bomb", text: "Si pisas una mina, quedas fuera de la ronda" },
  ],
  cancion: [
    { icon: "music", text: "Escucha un trozo de una canción" },
    { icon: "grid", text: "Elige entre 4 o escribe su título" },
    { icon: "bolt", text: "Acierta rápido: hasta 1000 puntos por ronda" },
  ],
  pais: [
    { icon: "globe", text: "Te diremos un país, su sombra o su bandera" },
    { icon: "pin", text: "Pon tu pin en el mapa y confírmalo" },
    { icon: "star", text: "Dentro del país vale 1000; más cerca, más puntos" },
  ],
  lluvia: [
    { icon: "rain", text: "Caen preguntas por la pantalla" },
    { icon: "keyboard", text: "Escribe la respuesta antes que nadie" },
    { icon: "star", text: "Fáciles 1 punto, medias 3 y difíciles 5" },
  ],
};

// What to do in each game (an older server's intro, without its variant).
export const TUTORIALS = {
  opciones: [
    { icon: "bulb", text: "Te haremos una pregunta de cualquier tema" },
    { icon: "grid", text: "Elige una de las 4 opciones o escribe la respuesta" },
    { icon: "bolt", text: "Acierta rápido: hasta 1000 puntos por ronda" },
  ],
  historia: [
    { icon: "info", text: "Te haremos una pregunta cuya respuesta es un número" },
    { icon: "target", text: "Marca el número en la barra" },
    { icon: "star", text: "Más cerca, más puntos: el exacto vale 1000" },
  ],
  minas: [
    { icon: "grid", text: "Un tema y un tablero de 25 respuestas" },
    { icon: "bolt", text: "Carrera: toca todas las correctas que puedas, rápido" },
    { icon: "bomb", text: "Si pisas una mina, quedas fuera de la ronda" },
  ],
  musica: [
    { icon: "music", text: "Escucha un trozo de una canción" },
    { icon: "grid", text: "Elige entre 4 o escribe su título" },
    { icon: "bolt", text: "Acierta rápido: hasta 1000 puntos por ronda" },
  ],
  mundo: [
    { icon: "globe", text: "Te diremos un país, su sombra o su bandera" },
    { icon: "pin", text: "Pon tu pin en el mapa y confírmalo" },
    { icon: "star", text: "Dentro del país vale 1000; más cerca, más puntos" },
  ],
  lluvia: [
    { icon: "rain", text: "Caen preguntas por la pantalla" },
    { icon: "keyboard", text: "Escribe la respuesta antes que nadie" },
    { icon: "star", text: "Fáciles 1 punto, medias 3 y difíciles 5" },
  ],
};
