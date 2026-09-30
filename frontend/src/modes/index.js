// Game modes shown on the Home screen. To add a new mode, add an entry here with `available: true`
// and a `path` for its screens, and add its id to GAME_IDS in backend/src/game/roomManager.js.
export const GAME_MODES = [
  {
    id: "musica",
    name: "Adivina la canción",
    color: "green",
    icon: "music",
    available: true,
    path: (room) => (room.phase === "lobby" ? `/lobby/${room.code}` : `/game/${room.code}`),
  },
  { id: "cultura", name: "Cultura general", color: "amber", icon: "bulb", available: false },
  { id: "cine", name: "Cine y series", color: "purple", icon: "film", available: false },
  { id: "mundo", name: "Geografía", color: "sky", icon: "globe", available: false },
];

export function findMode(id) {
  return GAME_MODES.find((m) => m.id === id) || null;
}

// The screen a room's players belong on: Home while the party picks a game, otherwise that game's own screens.
export function roomPath(room) {
  const mode = findMode(room.game);
  return mode?.path ? mode.path(room) : "/";
}
