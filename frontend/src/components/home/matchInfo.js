import { translate as tr } from "../../lib/i18n.js";
// Partidas públicas ("Casual" and "Competitivo", backend/src/game/matchmaking.js; Competitivo is disabled for now): their
// names and colours, and the short tutorial each game shows after the roulette picks it (MatchIntro.jsx). A match of the
// roulette (the Clásico) plays games of 5 rounds, one after another, until someone has won two.

export const MATCH_KINDS = {
  casual: {
    id: "casual",
    get name() { return tr("Casual"); },
    color: "site",
    icon: "bolt",
    get blurb() { return tr("Juega sin presión, cuando quieras"); },
    get detail() { return tr("Para jugar sin presión"); },
    steps: [
      { icon: "shuffle", get text() { return tr("Juegos al azar, de 5 rondas cada uno"); } },
      { icon: "crown", get text() { return tr("Gana cada juego quien más puntos saque"); } },
      { icon: "bolt", get text() { return tr("Gana el primero en ganar 2 juegos"); } },
    ],
  },
  competitivo: {
    id: "competitivo",
    get name() { return tr("Competitivo"); },
    color: "accent",
    icon: "crown",
    get blurb() { return tr("Gana partidas y sube de rango"); },
    get detail() { return tr("Cada victoria cuenta para tu rango"); },
    steps: [
      { icon: "crown", get text() { return tr("Cada victoria te sube de rango"); } },
      { icon: "target", get text() { return tr("Solo preguntas medias y difíciles"); } },
      { icon: "lock", get text() { return tr("Muy pronto disponible"); } },
    ],
  },
};

// How many players a room needs (MATCH_SIZES on the server): you against one, or five in all. "Uno contra Uno" isn't
// offered for now (`hidden`, DUELS_OPEN on the server): OPEN_SIZES are the ones a player can pick.
export const MATCH_SIZES = [
  { value: 2, get label() { return tr("Uno contra Uno"); }, get hint() { return tr("1 Jugador"); }, icon: "user", hidden: true },
  { value: 5, get label() { return tr("Todos contra Todos"); }, get hint() { return tr("5 Jugadores"); }, icon: "users" },
];
export const OPEN_SIZES = MATCH_SIZES.filter((o) => !o.hidden);
// The games a public match draws from, in the roulette's order (gamesFor on the server): Trivia, Rango and Campo de
// minas, in Casual and Competitivo alike.
export const MATCH_GAMES = ["opciones", "historia", "minas"];
export const CASUAL_GAMES = MATCH_GAMES;
export const gamesFor = (kind) => (kind === "casual" ? CASUAL_GAMES : MATCH_GAMES);

// What the roulette really draws (MATCH_VARIANTS on the server): each game with one way of playing it, a game of its
// own in a public match ("Trivia Cerradas" is only four-option questions). `hint` says how it's played in a few words.
export const MATCH_VARIANTS = [
  { id: "trivia-cerradas", game: "opciones", way: "Cerradas", get hint() { return tr("Elige entre 4 opciones"); } },
  { id: "trivia-abiertas", game: "opciones", way: "Abiertas", get hint() { return tr("Escribe la respuesta"); } },
  { id: "rango-cifras", game: "historia", way: "Cifras", get hint() { return tr("Un número en una barra"); } },
  { id: "minas-carrera", game: "minas", way: "Carrera", get hint() { return tr("Todas las que puedas"); } },
  // Only searched for by name (PUBLIC_GAMES in lib/plan.js): the roulette never draws them.
  { id: "cancion", game: "musica", way: null, get hint() { return tr("Adivina el título"); }, byName: true },
  { id: "pais", game: "mundo", way: null, get hint() { return tr("Pon tu pin en el mapa"); }, byName: true },
  { id: "lluvia", game: "lluvia", way: null, get hint() { return tr("Responde antes que nadie"); }, byName: true },
];
/** A variant by its id; an older server's plain game id is that game with no way. */
export const findVariant = (id) => MATCH_VARIANTS.find((v) => v.id === id) || { id, game: id, way: null };
export const variantsFor = (kind) => MATCH_VARIANTS.filter((v) => !v.byName && gamesFor(kind).includes(v.game));

// A public match of one game ("Partida pública" with a game picked: PUBLIC_VARIANT on the server): how long it is
// and how it's played, as its card says it ("5 rondas · 10 s · Cerradas"). The times are the public clock (matchTimes).
export const PUBLIC_MATCH = {
  opciones: { rounds: "5 rondas", time: "10 s", way: "Cerradas" },
  musica: { rounds: "5 canciones", time: "15 s", way: "Cerradas y abiertas" },
  mundo: { get rounds() { return tr("5 países"); }, time: "15 s", way: "Nombre, sombra y bandera" },
  historia: { rounds: "5 rondas", time: "10 s", way: "Cifras" },
  minas: { rounds: "5 tableros", time: "30 s", way: "Carrera" },
  lluvia: { rounds: "2 lluvias", time: "30 s", way: null },
};
export const publicMatchLine = (game) => {
  const p = PUBLIC_MATCH[game];
  return p ? [p.rounds, p.time, p.way].filter(Boolean).join(" · ") : "";
};
// A new private match's settings (the server's default*Config: game/quiz.js, geo.js…), said like the summary of its
// "Ajustes" tabs, so Inicio's card has it before the match exists, even when nothing was changed.
export const PRIVATE_MATCH = {
  get opciones() { return tr("5 rondas · 15 s · Todas las categorías"); },
  get musica() { return tr("5 rondas · 15 s"); },
  get mundo() { return tr("5 rondas · 15 s"); },
  get historia() { return tr("5 rondas · 10 s · Todas las categorías"); },
  get minas() { return tr("3 rondas · Todas las categorías"); },
  get lluvia() { return tr("3 rondas · 60 s · Todas las categorías"); },
  get rey() { return tr("10 rondas · 20 s · Todas las categorías"); },
  get farsante() { return tr("8 rondas · 45 s · Todos los tipos"); },
};
export const privateMatchLine = (game) => PRIVATE_MATCH[game] || "";

// What to do in each variant, short enough to read in the 5 s the tutorial lasts.
export const VARIANT_TUTORIALS = {
  "trivia-cerradas": [
    { icon: "bulb", get text() { return tr("Te haremos una pregunta de cualquier tema"); } },
    { icon: "grid", get text() { return tr("Elige la correcta entre 4 opciones"); } },
    { icon: "bolt", get text() { return tr("Acierta rápido: hasta 1000 puntos por ronda"); } },
  ],
  "trivia-abiertas": [
    { icon: "bulb", get text() { return tr("Te haremos una pregunta de cualquier tema"); } },
    { icon: "keyboard", get text() { return tr("Escribe la respuesta: no hace falta que sea exacta"); } },
    { icon: "bolt", get text() { return tr("Acierta rápido: hasta 1000 puntos por ronda"); } },
  ],
  "rango-cifras": [
    { icon: "info", get text() { return tr("Te haremos una pregunta cuya respuesta es un número"); } },
    { icon: "target", get text() { return tr("Marca el número en la barra"); } },
    { icon: "star", get text() { return tr("Más cerca, más puntos: el exacto vale 1000"); } },
  ],
  "minas-carrera": [
    { icon: "grid", get text() { return tr("Un tema y un tablero de 25 respuestas"); } },
    { icon: "bolt", get text() { return tr("Carrera: toca todas las correctas que puedas, rápido"); } },
    { icon: "bomb", get text() { return tr("Si pisas una mina, quedas fuera de la ronda"); } },
  ],
  cancion: [
    { icon: "music", get text() { return tr("Escucha un trozo de una canción"); } },
    { icon: "grid", get text() { return tr("Elige entre 4 o escribe su título"); } },
    { icon: "bolt", get text() { return tr("Acierta rápido: hasta 1000 puntos por ronda"); } },
  ],
  pais: [
    { icon: "globe", get text() { return tr("Te diremos un país, su sombra o su bandera"); } },
    { icon: "pin", get text() { return tr("Pon tu pin en el mapa y confírmalo"); } },
    { icon: "star", get text() { return tr("Dentro del país vale 1000, y más cerca, más puntos"); } },
  ],
  lluvia: [
    { icon: "rain", get text() { return tr("Caen preguntas por la pantalla"); } },
    { icon: "keyboard", get text() { return tr("Escribe la respuesta antes que nadie"); } },
    { icon: "star", get text() { return tr("Fáciles 1 punto, medias 3 y difíciles 5"); } },
  ],
};

// What to do in each game (an older server's intro, without its variant).
export const TUTORIALS = {
  opciones: [
    { icon: "bulb", get text() { return tr("Te haremos una pregunta de cualquier tema"); } },
    { icon: "grid", get text() { return tr("Elige una de las 4 opciones o escribe la respuesta"); } },
    { icon: "bolt", get text() { return tr("Acierta rápido: hasta 1000 puntos por ronda"); } },
  ],
  historia: [
    { icon: "info", get text() { return tr("Te haremos una pregunta cuya respuesta es un número"); } },
    { icon: "target", get text() { return tr("Marca el número en la barra"); } },
    { icon: "star", get text() { return tr("Más cerca, más puntos: el exacto vale 1000"); } },
  ],
  minas: [
    { icon: "grid", get text() { return tr("Un tema y un tablero de 25 respuestas"); } },
    { icon: "bolt", get text() { return tr("Carrera: toca todas las correctas que puedas, rápido"); } },
    { icon: "bomb", get text() { return tr("Si pisas una mina, quedas fuera de la ronda"); } },
  ],
  musica: [
    { icon: "music", get text() { return tr("Escucha un trozo de una canción"); } },
    { icon: "grid", get text() { return tr("Elige entre 4 o escribe su título"); } },
    { icon: "bolt", get text() { return tr("Acierta rápido: hasta 1000 puntos por ronda"); } },
  ],
  mundo: [
    { icon: "globe", get text() { return tr("Te diremos un país, su sombra o su bandera"); } },
    { icon: "pin", get text() { return tr("Pon tu pin en el mapa y confírmalo"); } },
    { icon: "star", get text() { return tr("Dentro del país vale 1000, y más cerca, más puntos"); } },
  ],
  lluvia: [
    { icon: "rain", get text() { return tr("Caen preguntas por la pantalla"); } },
    { icon: "keyboard", get text() { return tr("Escribe la respuesta antes que nadie"); } },
    { icon: "star", get text() { return tr("Fáciles 1 punto, medias 3 y difíciles 5"); } },
  ],
};
