import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import GeoLobbyPanel from "./mundo/LobbyPanel.jsx";
import HistoryLobbyPanel from "./historia/LobbyPanel.jsx";
import MinesLobbyPanel from "./minas/LobbyPanel.jsx";
import RainLobbyPanel from "./lluvia/LobbyPanel.jsx";
import ReyLobbyPanel from "./rey/LobbyPanel.jsx";
import FarsanteLobbyPanel from "./farsante/LobbyPanel.jsx";
import PlaylistLobbyPanel from "./playlist/LobbyPanel.jsx";
import ClassicLobbyPanel from "./clasico/LobbyPanel.jsx";
import { STYLES as MINES_STYLES } from "./minas/minesInfo.js";
import { MIN_QUESTIONS as RAIN_MIN_QUESTIONS } from "./lluvia/rainInfo.js";
import { MIN_QUESTIONS as REY_MIN_QUESTIONS } from "./rey/reyInfo.js";
import { urlCode } from "../lib/hiddenCode.js";

// The games shown on the room screen ("Elige el juego"; a game may have its own "Modos de juego" in its settings,
// variants that change its questions or rules, apart from its "Tipo de respuestas").
// "Trivia" is the main one (`kind: "main"`, its tile as wide as two): questions of every topic, each answered its own
// way. The others (`kind: "extra"`) have their own way of playing; their tiles go two by two under it. The "Playlist"
// (`kind: "playlist"`) isn't a game but several of them one after another, each with its settings: it has no tile, but
// its own bar under the games ("Crear una playlist", PlaylistEntry in pages/Home.jsx). To add a game,
// add an entry here with `available: true`, a `Lobby` panel (shown on the room screen while the room waits in that
// game: the game's big coloured card with its start button and how it's played,
// and its settings beside it), a `path` for its in-match screens and `ready(room)` (false while the match can't
// start: not enough songs or questions; the server checks too), and add its id to GAME_IDS in
// backend/src/game/roomManager.js. `steps` are the three short lines of how it's played, on the card.
export const GAME_MODES = [
  {
    id: "opciones",
    name: "Trivia",
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
      room.config?.formats?.length !== 0 && (room.songsReady == null || room.songsReady >= (room.config?.rounds || 5)),
    Lobby: MusicLobbyPanel,
    path: (room) => `/game/${urlCode(room.code)}`,
  },
  {
    id: "mundo",
    name: "Encuentra el país",
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
    // Not a game of its own: the room plays the playlist's games one after another (backend/src/game/playlist.js).
    // While one of them is played the room is in that game, so its screens are the game's; only the end of the
    // playlist (who won the most games) has a screen of its own.
    id: "playlist",
    name: "Playlist",
    kind: "playlist",
    // Orange (styles/playlist.css).
    color: "playlist",
    icon: "playlist",
    available: true,
    steps: [
      { icon: "list", text: "Elige los juegos y su orden" },
      { icon: "grid", text: "Cada uno con sus ajustes" },
      { icon: "crown", text: "Gana quien sume más puntos" },
    ],
    // At least one game, and every game playable with its settings (the server says why one isn't: playlistStatus).
    ready: (room) => {
      const items = room.playlist?.items || [];
      return items.length > 0 && items.every((i) => !room.playlistStatus?.[i.id]?.problem);
    },
    Lobby: PlaylistLobbyPanel,
    path: (room) => `/playlist/${urlCode(room.code)}`,
  },
  // "Clásico" (`kind: "classic"`), above "Elige el juego": a match like Casual's for the room's own players, its games
  // drawn by the roulette (`games` of them, 5 rounds each; CLASSIC_GAMES in backend/src/game/matchmaking.js). Like a
  // playlist it isn't one game: while it's played the room is in each of its games, and it ends on the playlist's
  // results screen. `fullName` is how it reads out of the menu (the match history).
  {
    id: "clasico",
    name: "Normal",
    fullName: "Clásico normal",
    // Under its name, on its tile and its card.
    subtitle: "3 juegos",
    kind: "classic",
    // Casual's colour and icon (components/home/matchInfo.js).
    color: "music",
    icon: "bolt",
    available: true,
    games: 3,
    steps: [
      { icon: "shuffle", text: "La ruleta elige 3 juegos" },
      { icon: "info", text: "Cada uno con su tutorial" },
      { icon: "star", text: "Gana quien sume más puntos" },
    ],
    Lobby: ClassicLobbyPanel,
    path: (room) => `/playlist/${urlCode(room.code)}`,
  },
  {
    id: "extendido",
    name: "Extendido",
    fullName: "Clásico extendido",
    subtitle: "5 juegos",
    kind: "classic",
    // Competitivo's colour.
    color: "amber",
    icon: "star",
    available: true,
    games: 5,
    steps: [
      { icon: "shuffle", text: "La ruleta elige 5 juegos" },
      { icon: "info", text: "Cada uno con su tutorial" },
      { icon: "star", text: "Gana quien sume más puntos" },
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

// The screen a room's players belong on: the room screen (/sala/CODE, Home with the room) while nobody is playing,
// whatever game is picked, otherwise that game's own screens.
// `_hidden` only makes callers re-run it when the code is hidden or shown (the addresses read it themselves).
export function roomPath(room, _hidden) {
  const mode = findMode(room.game);
  // A public match's roulette and tutorial ("intro") are on the room screen too, beside the room's column.
  return room.phase !== "lobby" && room.phase !== "intro" && mode?.path ? mode.path(room) : `/sala/${urlCode(room.code)}`;
}
