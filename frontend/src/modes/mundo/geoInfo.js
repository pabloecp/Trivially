// Encuentra el país's settings and labels (same ids and limits as backend/src/game/geo.js).

// The ways of giving the country to find ("Modos de juego", GEO_STYLES on the server): every round is a pin on the
// world map, and the country comes by its name, its silhouette or its flag. Any of them ticked (all by default): the
// rounds are shared between them.
export const STYLES = [
  { id: "nombre", label: "Nombre", hint: "Te decimos qué país es", icon: "pin" },
  { id: "sombra", label: "Sombra", hint: "Solo ves la forma del país", icon: "shape" },
  { id: "bandera", label: "Bandera", hint: "Solo ves su bandera", icon: "flag" },
];

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

/** The way a round gives its country (a round from before the ways existed is by name). */
export const styleOf = (id) => STYLES.find((st) => st.id === id) || STYLES[0];

export function geoConfig(room) {
  const geo = room?.config?.geo || {};
  return {
    rounds: geo.rounds || 5,
    // Empty lists are kept: they show unticked, and the match can't start until one is ticked.
    styles: geo.styles ?? STYLES.map((st) => st.id),
    // An older room had only one difficulty, `difficulty` ("mixta" being the three).
    difficulties:
      geo.difficulties ??
      (DIFFICULTIES.some((d) => d.id === geo.difficulty) ? [geo.difficulty] : DIFFICULTIES.map((d) => d.id)),
  };
}
