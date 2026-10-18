import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import GeoLobbyPanel from "./mundo/LobbyPanel.jsx";
import HistoryLobbyPanel from "./historia/LobbyPanel.jsx";
import MinesLobbyPanel from "./minas/LobbyPanel.jsx";
import PlaylistLobbyPanel from "./playlist/LobbyPanel.jsx";
import { STYLES as MINES_STYLES } from "./minas/minesInfo.js";
import { urlCode } from "../lib/hiddenCode.js";

// The games shown on the room screen ("Elige el juego"; a game may have its own "Modos de Juego" in its settings).
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
    // Rango: get as close as you can on a range. Its steps are general, since "Línea del tiempo" (an event's year) is
    // only its first way of playing. The id is the old one on purpose (see GAME_IDS on the server).
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
    // How it's played by turns; the lobby shows the steps of the ticked ways (minesInfo.js STYLES).
    steps: MINES_STYLES[0].steps,
    ready: (room) =>
      room.config?.mines?.styles?.length !== 0 &&
      (room.questionsReady == null || room.questionsReady >= (room.config?.mines?.rounds || 5)),
    Lobby: MinesLobbyPanel,
    // A prompt and a 5 × 5 board (modes/minas/Game.jsx).
    path: (room) => `/minas/${urlCode(room.code)}`,
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
];


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
  return room.phase !== "lobby" && mode?.path ? mode.path(room) : `/sala/${urlCode(room.code)}`;
}
