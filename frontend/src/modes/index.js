import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import MusicStartButton from "./music/StartButton.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import QuizStartButton from "./quiz/StartButton.jsx";

// Game modes shown on the Home screen. To add a new mode, add an entry here with `available: true`, a `Lobby`
// panel (shown on the room screen while the room waits in that mode) and a `path` for its in-match screens,
// and add its id to GAME_IDS in backend/src/game/roomManager.js.
export const GAME_MODES = [
  {
    id: "musica",
    name: "Adivina la canción",
    color: "green",
    icon: "music",
    available: true,
    Lobby: MusicLobbyPanel,
    Start: MusicStartButton,
    path: (room) => `/game/${room.code}`,
  },
  {
    id: "opciones",
    name: "Opción múltiple",
    // Sky blue (styles/quiz.css); its answers have their own four colours.
    color: "quiz",
    icon: "grid",
    available: true,
    Lobby: QuizLobbyPanel,
    Start: QuizStartButton,
    path: (room) => `/quiz/${room.code}`,
  },
  { id: "cultura", name: "Cultura general", color: "amber", icon: "bulb", available: false },
  { id: "cine", name: "Cine y series", color: "purple", icon: "film", available: false },
  { id: "mundo", name: "Geografía", color: "sky", icon: "globe", available: false },
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
