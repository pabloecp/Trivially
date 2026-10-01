import MusicLobbyPanel from "./music/LobbyPanel.jsx";

// Game modes shown on the Home screen. To add a new mode, add an entry here with `available: true`, a `Lobby`
// panel (shown on the room screen while the room waits in that mode) and a `path` for its in-match screens,
// and add its id to GAME_IDS in backend/src/game/roomManager.js.
export const GAME_MODES = [
  {
    id: "musica",
    name: "Adivina la canción",
    color: "green",
    icon: "music",
    tagline: "Escucha 30 segundos y escribe el título de la canción.",
    available: true,
    Lobby: MusicLobbyPanel,
    path: (room) => `/game/${room.code}`,
  },
  { id: "cultura", name: "Cultura general", color: "amber", icon: "bulb", tagline: "Preguntas de todo un poco.", available: false },
  { id: "cine", name: "Cine y series", color: "purple", icon: "film", tagline: "Adivina la película o serie.", available: false },
  { id: "mundo", name: "Geografía", color: "sky", icon: "globe", tagline: "Banderas, capitales y mucho más.", available: false },
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
