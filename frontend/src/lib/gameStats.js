// Your elo in each game and how many people are playing it right now, on the game's card (ModeStage). Neither system
// exists yet: these are example numbers, always the same, until the server sends the real ones.
const EXAMPLES = {
  opciones: { elo: 742, online: 1284 },
  musica: { elo: 615, online: 436 },
  mundo: { elo: 803, online: 352 },
  historia: { elo: 568, online: 219 },
  minas: { elo: 690, online: 187 },
  lluvia: { elo: 527, online: 164 },
  rey: { elo: 731, online: 96 },
  farsante: { elo: 654, online: 73 },
};

/** `{ elo, online }` for a game, or null for what isn't one (a playlist, a Clásico). */
export const gameStats = (game) => EXAMPLES[game] || null;
