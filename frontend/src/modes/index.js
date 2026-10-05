import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import GeoLobbyPanel from "./mundo/LobbyPanel.jsx";

// Game modes shown on the room screen. To add a new mode, add an entry here with `available: true`, a `Lobby`
// panel (shown on the room screen while the room waits in that mode: the mode's big coloured card with its start
// button, and its settings) and a `path` for its in-match screens, and add its id to GAME_IDS in
// backend/src/game/roomManager.js. `short` is the name in the game dock, `desc` the line under the big name.
export const GAME_MODES = [
  {
    id: "musica",
    name: "Adivina la canción",
    short: "Canción",
    desc: "Suena un fragmento. Gana quien escribe antes el título.",
    color: "music",
    icon: "music",
    available: true,
    Lobby: MusicLobbyPanel,
    path: (room) => `/game/${room.code}`,
  },
  {
    id: "opciones",
    name: "Opción múltiple",
    short: "Opciones",
    desc: "Cuatro respuestas y solo una vale. Piensa rápido.",
    // Sky blue (styles/quiz.css); its answers have their own four colours.
    color: "quiz",
    icon: "grid",
    available: true,
    Lobby: QuizLobbyPanel,
    path: (room) => `/quiz/${room.code}`,
  },
  { id: "cultura", name: "Cultura general", short: "Cultura", color: "culture", icon: "bulb", available: false },
  { id: "cine", name: "Cine y series", short: "Cine", color: "cinema", icon: "film", available: false },
  {
    id: "mundo",
    name: "Geografía",
    short: "Geografía",
    desc: "Capitales, banderas y países que ubicar en el mapa.",
    color: "world",
    icon: "globe",
    available: true,
    Lobby: GeoLobbyPanel,
    // Capitals, flags and the world map (modes/mundo/Game.jsx).
    path: (room) => `/mundo/${room.code}`,
  },
];

export function findMode(id) {
  return GAME_MODES.find((m) => m.id === id) || null;
}

// The screen a room's players belong on: the room screen (/sala/CODE, Home with the room) while nobody is playing,
// whatever game is picked, otherwise that game's own screens.
export function roomPath(room) {
  const mode = findMode(room.game);
  return room.phase !== "lobby" && mode?.path ? mode.path(room) : `/sala/${room.code}`;
}
