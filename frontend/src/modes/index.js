import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import GeoLobbyPanel from "./mundo/LobbyPanel.jsx";
import HistoryLobbyPanel from "./historia/LobbyPanel.jsx";
import MinesLobbyPanel from "./minas/LobbyPanel.jsx";
import RainLobbyPanel from "./lluvia/LobbyPanel.jsx";
import ReyLobbyPanel from "./rey/LobbyPanel.jsx";
import FarsanteLobbyPanel from "./farsante/LobbyPanel.jsx";
import ClassicLobbyPanel from "./clasico/LobbyPanel.jsx";
import { STYLES as MINES_STYLES } from "./minas/minesInfo.js";
import { MIN_QUESTIONS as RAIN_MIN_QUESTIONS } from "./lluvia/rainInfo.js";
import { MIN_QUESTIONS as REY_MIN_QUESTIONS } from "./rey/reyInfo.js";
import { urlCode } from "../lib/hiddenCode.js";

// The games shown on the room screen ("Elige el juego"; a game may have its own "Modos de juego" in its settings,
// variants that change its questions or rules, apart from its "Tipo de respuestas").
// "Trivia" is the main one (`kind: "main"`, its tile as wide as two): questions of every topic, each answered its own
// way. The others (`kind: "extra"`) have their own way of playing; their tiles go two by two under it. To add a game,
// add an entry here with `available: true`, a `Lobby` panel (shown on the room screen while the room waits in that
// game: the game's big coloured card with its start button and how it's played,
// and its settings beside it), a `path` for its in-match screens and `ready(room)` (false while the match can't
// start: not enough songs or questions; the server checks too), and add its id to GAME_IDS in
// backend/src/game/roomManager.js. `steps` are the three short lines of how it's played, on the card.
export const GAME_MODES = [
  {
    id: "opciones",
    name: "Trivia",
    // Under its name on its card in "¿Qué quieren jugar?".
    tagline: "Más rápido, más puntos",
    // Under its name on Inicio's card: what the game is, in one or two lines.
    description: "Responde preguntas de todo tipo. Cuanto más rápido aciertas, más puntos sumas.",
    kind: "main",
    // Sky blue (styles/quiz.css); its answers have their own four colours.
    color: "quiz",
    icon: "bulb",
    available: true,
    steps: [
      { icon: "bulb", text: "Elige las categorías" },
      { icon: "grid", text: "Responde como toque" },
      { icon: "bolt", text: "Más rápido, más puntos" },
    ],
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.quiz?.rounds || 5),
    Lobby: QuizLobbyPanel,
    path: (room) => `/quiz/${urlCode(room.code)}`,
  },
  {
    id: "musica",
    name: "Adivina la canción",
    tagline: "Escucha y adivina el título",
    description: "Suena un fragmento de una canción: adivina cuál es antes que los demás.",
    kind: "extra",
    color: "music",
    icon: "music",
    available: true,
    steps: [
      { icon: "music", text: "Escucha el fragmento" },
      { icon: "keyboard", text: "Elige o escribe el título" },
      { icon: "bolt", text: "Más rápido, más puntos" },
    ],
    // A different song for every round (older servers don't send songsReady).
    ready: (room) =>
      room.config?.formats?.length !== 0 &&
      room.config?.styles?.length !== 0 &&
      (room.songsReady == null || room.songsReady >= (room.config?.rounds || 5)),
    Lobby: MusicLobbyPanel,
    path: (room) => `/game/${urlCode(room.code)}`,
  },
  {
    id: "mundo",
    name: "Encuentra el país",
    tagline: "Ponle tu pin en el mapa",
    description: "Mira qué país te piden y ponle tu pin en el mapa. Cuanto más cerca, más puntos.",
    kind: "extra",
    color: "world",
    icon: "globe",
    available: true,
    steps: [
      { icon: "globe", text: "Mira qué país te piden" },
      { icon: "pin", text: "Ponle tu pin en el mapa" },
      { icon: "target", text: "Más cerca, más puntos" },
    ],
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.geo?.rounds || 5),
    Lobby: GeoLobbyPanel,
    // The world map (modes/mundo/Game.jsx).
    path: (room) => `/mundo/${urlCode(room.code)}`,
  },
  {
    // Rango: get as close as you can on a range. Its steps are general, in case it gets other ways of playing. The id is the old one on purpose (see GAME_IDS on the server).
    id: "historia",
    name: "Rango",
    tagline: "Más cerca, más puntos",
    description: "Mueve la barra hasta la cifra real. Exacto vale 1000; cuanto más cerca, más puntos.",
    kind: "extra",
    // Terracotta (styles/history.css).
    color: "history",
    icon: "hourglass",
    available: true,
    steps: [
      { icon: "info", text: "Lee la pregunta" },
      { icon: "target", text: "Elige en el rango" },
      { icon: "star", text: "Más cerca, más puntos" },
    ],
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.history?.rounds || 5),
    Lobby: HistoryLobbyPanel,
    // An event and a timeline (modes/historia/Game.jsx).
    path: (room) => `/historia/${urlCode(room.code)}`,
  },
  {
    id: "minas",
    name: "Campo de minas",
    tagline: "No pises la mina",
    description: "Toca todas las casillas que cumplen la consigna. Si pisas una mina, quedas fuera.",
    kind: "extra",
    // The site's violet (styles/mines.css).
    color: "mines",
    icon: "bomb",
    available: true,
    // How it's played, as a race (minesInfo.js STYLES).
    steps: MINES_STYLES[0].steps,
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.mines?.rounds || 3),
    Lobby: MinesLobbyPanel,
    // A prompt and a 5 × 5 board (modes/minas/Game.jsx).
    path: (room) => `/minas/${urlCode(room.code)}`,
  },
  {
    // Lluvia: questions fall down the screen for a whole round; each one is for whoever writes its answer first.
    id: "lluvia",
    name: "Lluvia",
    tagline: "Las preguntas caen",
    description: "Las preguntas caen por la pantalla: escribe la respuesta antes que nadie y te la llevas.",
    kind: "extra",
    // Rain blue (styles/rain.css); the questions fall in green, yellow or red by difficulty.
    color: "rain",
    icon: "rain",
    available: true,
    steps: [
      { icon: "rain", text: "Las preguntas caen" },
      { icon: "bolt", text: "Respóndelas antes que nadie" },
      { icon: "star", text: "Verde 1, amarilla 3, roja 5" },
    ],
    ready: (room) =>
      room.config?.rain?.categories?.length !== 0 &&
      room.config?.rain?.difficulties?.length !== 0 &&
      (room.questionsReady == null || room.questionsReady >= RAIN_MIN_QUESTIONS),
    Lobby: RainLobbyPanel,
    // The sky the questions fall down, and the box to write in (modes/lluvia/Game.jsx).
    path: (room) => `/lluvia/${urlCode(room.code)}`,
  },
  {
    // Rey de la colina: the king picks the question, the first to answer it takes the crown.
    id: "rey",
    name: "Rey de la colina",
    tagline: "Destrona al rey",
    description: "El rey elige la pregunta. Acierta antes que los demás y le quitas la corona.",
    kind: "extra",
    // Crown gold (styles/rey.css).
    color: "rey",
    icon: "crown",
    available: true,
    steps: [
      { icon: "crown", text: "El rey elige la pregunta" },
      { icon: "bolt", text: "El primero en acertar lo destrona" },
      { icon: "star", text: "Si nadie acierta, el rey suma" },
    ],
    ready: (room) =>
      room.config?.rey?.categories?.length !== 0 &&
      room.config?.rey?.difficulties?.length !== 0 &&
      (room.players?.filter((p) => !p.spectator).length ?? 2) >= 2 &&
      (room.questionsReady == null || room.questionsReady >= REY_MIN_QUESTIONS),
    Lobby: ReyLobbyPanel,
    // The three questions, the question and the box to write in (modes/rey/Game.jsx).
    path: (room) => `/rey/${urlCode(room.code)}`,
  },
  {
    // Farsante: everyone invents an answer, then votes for the real one (or the best one); a game for a call with friends.
    id: "farsante",
    name: "Farsante",
    tagline: "Inventa y engaña",
    description: "Cada uno inventa una respuesta falsa. Vota la verdadera y engaña a los demás con la tuya.",
    kind: "extra",
    // Leafy green (styles/farsante.css).
    color: "farsante",
    icon: "mask",
    available: true,
    steps: [
      { icon: "keyboard", text: "Inventa una respuesta" },
      { icon: "mask", text: "Mézclala con las de los demás" },
      { icon: "star", text: "Puntos por engañar o por acertar" },
    ],
    ready: (room) =>
      room.config?.farsante?.kinds?.length !== 0 && (room.players?.filter((p) => !p.spectator).length ?? 3) >= 3,
    Lobby: FarsanteLobbyPanel,
    // The prompt, the box to write in, the options to vote on (modes/farsante/Game.jsx).
    path: (room) => `/farsante/${urlCode(room.code)}`,
  },
  {
    // Not a game: where a match of several games (a public match or a Clásico) ends, on its results (who won the most
    // games, modes/playlist/Results.jsx). Nobody picks it (the rooms' own "Playlist" was removed).
    id: "playlist",
    name: "Partida",
    kind: "playlist",
    color: "playlist",
    icon: "playlist",
    path: (room) => `/playlist/${urlCode(room.code)}`,
  },
  // "Clásico" (`kind: "classic"`), above "Juego libre": games drawn by the roulette one after another (5 rounds each),
  // until someone has won `wins` of them (CLASSIC_WINS in backend/src/game/matchmaking.js). With "Partida privada" it's
  // the room's own match; with "Partida pública", the roulette's public match. Like a playlist it isn't one game: while
  // it's played the room is in each of its games, and it ends on the playlist's results screen. `fullName` is how it
  // reads out of the menu (the match history). "extendido", first to three, isn't offered anywhere for now.
  {
    id: "clasico",
    name: "Clásico",
    fullName: "Clásico",
    // Under its name, on its tile and its card.
    subtitle: "Primero en ganar dos juegos",
    kind: "classic",
    // Casual's colour and icon (components/home/matchInfo.js).
    color: "music",
    icon: "bolt",
    available: true,
    wins: 2,
    steps: [
      { icon: "shuffle", text: "La ruleta elige cada juego al azar" },
      { icon: "info", text: "Cada uno de 5 rondas, con su tutorial" },
      { icon: "crown", text: "Gana el primero en ganar 2 juegos" },
    ],
    Lobby: ClassicLobbyPanel,
    path: (room) => `/playlist/${urlCode(room.code)}`,
  },
  {
    id: "extendido",
    name: "Extendido",
    fullName: "Clásico extendido",
    subtitle: "Primero en ganar tres juegos",
    kind: "classic",
    // Competitivo's colour.
    color: "amber",
    icon: "star",
    available: true,
    wins: 3,
    steps: [
      { icon: "shuffle", text: "La ruleta elige cada juego al azar" },
      { icon: "info", text: "Cada uno de 5 rondas, con su tutorial" },
      { icon: "crown", text: "Gana el primero en ganar 3 juegos" },
    ],
    Lobby: ClassicLobbyPanel,
    path: (room) => `/playlist/${urlCode(room.code)}`,
  },
];

// The menu's games, without the playlist and the Clásicos (which have places of their own above and beside them).
export const isGameTile = (mode) => mode.kind === "main" || mode.kind === "extra";


// The grey, locked tile that closes the grid when a row would be left half empty: more are on the way.
export const SOON_TILE = { id: "soon", name: "Más juegos pronto", color: "soon", icon: "lock", placeholder: true };

export function findMode(id) {
  return GAME_MODES.find((m) => m.id === id) || null;
}

// A match with a roulette before each game (public, or a Clásico), played without changing the address.
export const isInlineMatch = (room) => Boolean(room?.matchmaking || room?.run?.classic) && isGameTile(findMode(room.game) || {});

// Inicio's address: "/" without a sala, and with one (made when a game is chosen, or joined) its own, /grupo/CODE,
// which is also its invite link. Both are the same screen (RoomScreen, App.jsx), so going from one to the other
// changes nothing on the page. `groupCode` is this tab's group's (tabGroupCode).
export const homePath = (groupCode) => (groupCode ? `/grupo/${urlCode(groupCode)}` : "/");

// The screen a room's players belong on. While it waits (a private match before it starts, the search for a public
// one) it's Inicio itself, on Inicio's address (`home`, homePath): the same screen (HomeFrame), so nothing says you
// went somewhere else. Once it plays, that game's own screens.
// `_hidden` only makes callers re-run it when the code is hidden or shown (the addresses read it themselves).
export function roomPath(room, _hidden, home = "/") {
  if (waitsOnInicio(room)) return home;
  const mode = findMode(room.game);
  // A public match or a Clásico never leaves the room's address: the intro and every game's screens take turns on
  // /sala/CODE (RoomScreen, App.jsx). Its end is still the playlist's results screen.
  if (isInlineMatch(room) && room.phase !== "finished") return `/sala/${urlCode(room.code)}`;
  // A public match's roulette and tutorial ("intro") are on the room screen too, beside the room's column.
  return room.phase !== "intro" && mode?.path ? mode.path(room) : `/sala/${urlCode(room.code)}`;
}

/** Whether a room waits on Inicio (`roomPath` is Inicio's address): for its players there's nowhere to go back from. */
export const waitsOnInicio = (room) => room?.phase === "lobby";
