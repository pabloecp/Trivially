import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import GeoLobbyPanel from "./mundo/LobbyPanel.jsx";
import HistoryLobbyPanel from "./historia/LobbyPanel.jsx";

// Game modes shown on the room screen. "Trivia" is the main one (`kind: "main"`, its tile as wide as two): questions
// of every topic, each answered its own way. The others (`kind: "extra"`) have their own way of playing; their tiles
// go two by two under it. To add a mode, add an entry here with `available: true`, a `Lobby` panel (shown on the room
// screen while the room waits in that mode: the mode's big coloured card with its start button and how it's played,
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
      { icon: "bulb", text: "Elige los temas" },
      { icon: "grid", text: "Responde como toque" },
      { icon: "bolt", text: "Más rápido, más puntos" },
    ],
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.quiz?.rounds || 5),
    Lobby: QuizLobbyPanel,
    path: (room) => `/quiz/${room.code}`,
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
      { icon: "keyboard", text: "Escribe el título" },
      { icon: "bolt", text: "Más rápido, más puntos" },
    ],
    // A different song for every round (older servers don't send songsReady).
    ready: (room) => room.songsReady == null || room.songsReady >= (room.config?.rounds || 5),
    Lobby: MusicLobbyPanel,
    path: (room) => `/game/${room.code}`,
  },
  {
    id: "mundo",
    name: "Encuentra el país",
    kind: "extra",
    color: "world",
    icon: "globe",
    available: true,
    steps: [
      { icon: "pin", text: "Encuentra el país en el mapa" },
      { icon: "landmark", text: "Capitales y banderas" },
      { icon: "target", text: "Más cerca, más puntos" },
    ],
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.geo?.rounds || 5),
    Lobby: GeoLobbyPanel,
    // Capitals, flags and the world map (modes/mundo/Game.jsx).
    path: (room) => `/mundo/${room.code}`,
  },
  {
    id: "historia",
    name: "Línea del tiempo",
    kind: "extra",
    // Terracotta (styles/history.css).
    color: "history",
    icon: "hourglass",
    available: true,
    steps: [
      { icon: "scroll", text: "Lee el acontecimiento" },
      { icon: "calendar", text: "Elige el año" },
      { icon: "target", text: "Más cerca, más puntos" },
    ],
    ready: (room) => room.questionsReady == null || room.questionsReady >= (room.config?.history?.rounds || 5),
    Lobby: HistoryLobbyPanel,
    // An event and a timeline (modes/historia/Game.jsx).
    path: (room) => `/historia/${room.code}`,
  },
];


// The grey, locked tile that closes the grid when a row would be left half empty: more are on the way.
export const SOON_TILE = { id: "soon", name: "Más modos pronto", color: "soon", icon: "lock", placeholder: true };

export function findMode(id) {
  return GAME_MODES.find((m) => m.id === id) || null;
}

// The screen a room's players belong on: the room screen (/sala/CODE, Home with the room) while nobody is playing,
// whatever game is picked, otherwise that game's own screens.
export function roomPath(room) {
  const mode = findMode(room.game);
  return room.phase !== "lobby" && mode?.path ? mode.path(room) : `/sala/${room.code}`;
}
