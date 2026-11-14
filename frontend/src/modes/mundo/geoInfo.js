import { translate as tr } from "../../lib/i18n.js";
// Encuentra el país's settings and labels (same ids and limits as backend/src/game/geo.js).

// The ways of giving the country to find ("Modos de juego", GEO_STYLES on the server): every round is a pin on the
// world map, and the country comes by its name, its silhouette or its flag. Any of them ticked (all by default): the
// rounds are shared between them.
export const STYLES = [
  { id: "nombre", get label() { return tr("Nombre"); }, get hint() { return tr("Te decimos qué país es"); }, icon: "pin" },
  { id: "sombra", get label() { return tr("Sombra"); }, get hint() { return tr("Solo ves la forma del país"); }, icon: "shape" },
  { id: "bandera", get label() { return tr("Bandera"); }, get hint() { return tr("Solo ves su bandera"); }, icon: "flag" },
];

// The difficulties a match can mix (GEO_LEVELS on the server), any of them ticked. The harder, the deeper the mode's
// blue (colours in styles/geo.css).
export const DIFFICULTIES = [
  { id: "facil", get label() { return tr("Fácil"); }, get hint() { return tr("Los más conocidos"); }, color: "world-light", stars: 1 },
  { id: "media", get label() { return tr("Media"); }, get hint() { return tr("Un poco de todo"); }, color: "world", stars: 2 },
  { id: "dificil", get label() { return tr("Difícil"); }, get hint() { return tr("Solo expertos"); }, color: "world-deep", stars: 3 },
];

export const ROUNDS_LIMITS = { min: 5, max: 25, step: 5 };
// Seconds to put the pin, like Adivina la canción's (GEO_LIMITS.roundMs on the server); 15 in a new room.
export const SECONDS_LIMITS = { min: 15, max: 35, step: 5 };
export const LOCATION_SECONDS = 15;

/** The way a round gives its country (a round from before the ways existed is by name). */
export const styleOf = (id) => STYLES.find((st) => st.id === id) || STYLES[0];

export function geoConfig(room) {
  const geo = room?.config?.geo || {};
  return {
    rounds: geo.rounds || 5,
    roundMs: geo.roundMs || LOCATION_SECONDS * 1000,
    // Empty lists are kept: they show unticked, and the match can't start until one is ticked.
    styles: geo.styles ?? STYLES.map((st) => st.id),
    // An older room had only one difficulty, `difficulty` ("mixta" being the three).
    difficulties:
      geo.difficulties ??
      (DIFFICULTIES.some((d) => d.id === geo.difficulty) ? [geo.difficulty] : DIFFICULTIES.map((d) => d.id)),
  };
}
