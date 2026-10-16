// Encuentra el país's settings and labels (same ids and limits as backend/src/game/geo.js).

// The way of playing ("Modos de juego"): a pin on the world map, the only one. The settings show it ticked and locked;
// nothing about it is stored.
export const STYLES = [{ id: "location", label: "Ubicación", hint: "Pin en el mapa", icon: "pin" }];

// The difficulties a match can mix (GEO_LEVELS on the server), any of them ticked. The harder, the deeper the mode's
// blue (colours in styles/geo.css).
export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", hint: "Los más conocidos", color: "world-light", stars: 1 },
  { id: "media", label: "Media", hint: "Un poco de todo", color: "world", stars: 2 },
  { id: "dificil", label: "Difícil", hint: "Solo expertos", color: "world-deep", stars: 3 },
];

export const ROUNDS_LIMITS = { min: 5, max: 25, step: 5 };
// Seconds to put the pin, like Adivina la canción's (GEO_LIMITS.roundMs on the server); 15 in a new room.
export const SECONDS_LIMITS = { min: 15, max: 35, step: 5 };
export const LOCATION_SECONDS = 15;

export function geoConfig(room) {
  const geo = room?.config?.geo || {};
  return {
    rounds: geo.rounds || 5,
    roundMs: geo.roundMs || LOCATION_SECONDS * 1000,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked. An older room had only
    // one, `difficulty` ("mixta" being the three).
    difficulties:
      geo.difficulties ??
      (DIFFICULTIES.some((d) => d.id === geo.difficulty) ? [geo.difficulty] : DIFFICULTIES.map((d) => d.id)),
  };
}
