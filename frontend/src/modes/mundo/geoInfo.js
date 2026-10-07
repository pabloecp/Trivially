// Geografía's settings and labels (same ids and limits as backend/src/game/geo.js).

export const KINDS = [
  { id: "capital", label: "Capitales", hint: "Escribe la capital", icon: "landmark" },
  { id: "flag", label: "Banderas", hint: "¿De qué país es?", icon: "flag" },
  { id: "location", label: "Ubicación", hint: "Pin en el mapa · 10 s", icon: "pin" },
];

// The harder, the deeper the mode's blue; mixed takes the site's accent (colours in styles/geo.css).
export const DIFFICULTIES = [
  { id: "mixta", label: "Mixta", hint: "Las tres mezcladas", color: "accent", stars: 0 },
  { id: "facil", label: "Fácil", hint: "Los más conocidos", color: "world-light", stars: 1 },
  { id: "media", label: "Media", hint: "Un poco de todo", color: "world", stars: 2 },
  { id: "dificil", label: "Difícil", hint: "Solo expertos", color: "world-deep", stars: 3 },
];

export function findKind(id) {
  return KINDS.find((k) => k.id === id) || KINDS[0];
}

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

export const ROUNDS_LIMITS = { min: 5, max: 25, step: 5 };
export const SECONDS_LIMITS = { min: 15, max: 35, step: 5 };
// Map rounds always last 10 s and their reveal 6 s; a written answer's reveal 3 s.
export const LOCATION_SECONDS = 10;
const COUNTDOWN_S = 3;
const LOCATION_REVEAL_S = 3;
const REVEAL_S = 3;

export function geoConfig(room) {
  const geo = room?.config?.geo || {};
  return {
    rounds: geo.rounds || 5,
    roundMs: geo.roundMs || 15000,
    kinds: geo.kinds ?? KINDS.map((k) => k.id),
    difficulty: geo.difficulty || "mixta",
  };
}

/** About how long a match lasts, in minutes (the kinds share the rounds evenly). */
export function matchMinutes({ rounds, roundMs, kinds }) {
  const maps = kinds.includes("location") ? rounds / kinds.length : 0;
  const written = rounds - maps;
  const seconds = written * (COUNTDOWN_S + roundMs / 1000 + REVEAL_S) + maps * (COUNTDOWN_S + LOCATION_SECONDS + LOCATION_REVEAL_S);
  return Math.max(1, Math.round(seconds / 60));
}
