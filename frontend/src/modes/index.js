import MusicLobbyPanel from "./music/LobbyPanel.jsx";
import QuizLobbyPanel from "./quiz/LobbyPanel.jsx";
import GeoLobbyPanel from "./mundo/LobbyPanel.jsx";

// Game modes shown on the room screen. To add a new mode, add an entry here with `available: true`, a `Lobby`
// panel (shown on the room screen while the room waits in that mode: the mode's big coloured card with its start
// button, and its settings) and a `path` for its in-match screens, and add its id to GAME_IDS in
// backend/src/game/roomManager.js. `short` is the name in the game dock, `desc` the line under the big name and
// `popular` the game's place in the dock under the picked game, which shows only the most played ones.
export const GAME_MODES = [
  {
    id: "musica",
    name: "Adivina la canción",
    short: "Canción",
    desc: "Suena un fragmento. Gana quien escribe antes el título.",
    color: "music",
    icon: "music",
    available: true,
    popular: 1,
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
    popular: 2,
    Lobby: QuizLobbyPanel,
    path: (room) => `/quiz/${room.code}`,
  },
  {
    id: "mundo",
    name: "Geografía",
    short: "Geografía",
    desc: "Capitales, banderas y países que ubicar en el mapa.",
    color: "world",
    icon: "globe",
    available: true,
    popular: 3,
    Lobby: GeoLobbyPanel,
    // Capitals, flags and the world map (modes/mundo/Game.jsx).
    path: (room) => `/mundo/${room.code}`,
  },
  { id: "cultura", name: "Cultura general", short: "Cultura", color: "culture", icon: "bulb", available: false },
  { id: "cine", name: "Cine y series", short: "Cine", color: "cinema", icon: "film", available: false },
];

// The grey, locked tile that closes the grid (and the dock) when the number of games is odd: more are on the way.
export const SOON_TILE = { id: "soon", name: "Más juegos pronto", short: "Más juegos pronto", color: "soon", icon: "lock", placeholder: true };

// The dock's games: the most popular ones, plus the picked one if it isn't among them.
export function dockModes(current) {
  const popular = GAME_MODES.filter((m) => m.popular).sort((a, b) => a.popular - b.popular);
  const picked = GAME_MODES.find((m) => m.id === current);
  return picked && !popular.includes(picked) ? [...popular, picked] : popular;
}

export function findMode(id) {
  return GAME_MODES.find((m) => m.id === id) || null;
}

// The screen a room's players belong on: the room screen (/sala/CODE, Home with the room) while nobody is playing,
// whatever game is picked, otherwise that game's own screens.
export function roomPath(room) {
  const mode = findMode(room.game);
  return room.phase !== "lobby" && mode?.path ? mode.path(room) : `/sala/${room.code}`;
}
