// Encuentra el país's settings and labels (same ids and limits as backend/src/game/geo.js).

// The way of playing ("Modos de juego"): a pin on the world map, the only one. The settings show it ticked and locked;
// nothing about it is stored.
export const STYLES = [{ id: "location", label: "Ubicación", hint: "Pin en el mapa · 10 s", icon: "pin" }];

// The difficulties a match can mix (GEO_LEVELS on the server), any of them ticked. The harder, the deeper the mode's
// blue (colours in styles/geo.css).
export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", hint: "Los más conocidos", color: "world-light", stars: 1 },
  { id: "media", label: "Media", hint: "Un poco de todo", color: "world", stars: 2 },
  { id: "dificil", label: "Difícil", hint: "Solo expertos", color: "world-deep", stars: 3 },
];

export const ROUNDS_LIMITS = { min: 5, max: 25, step: 5 };
// A map round always lasts 10 s.
export const LOCATION_SECONDS = 10;

export function geoConfig(room) {
  const geo = room?.config?.geo || {};
  return {
    rounds: geo.rounds || 5,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked. An older room had only
    // one, `difficulty` ("mixta" being the three).
    difficulties:
      geo.difficulties ??
      (DIFFICULTIES.some((d) => d.id === geo.difficulty) ? [geo.difficulty] : DIFFICULTIES.map((d) => d.id)),
  };
}
