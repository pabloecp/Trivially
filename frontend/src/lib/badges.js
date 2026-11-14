import { translate as tr } from "../lib/i18n.js";
// The profile's badges ("Insignias"): ten, hard to get, each won by a feat from what the account already keeps (its
// stats, daily challenges and Clásico rank). The ids, goals and rules are the server's (backend game/badges.js), which
// checks them again before a badge is worn; here is how each one looks (a tag, like "Owner", in its own colour and
// icon) and how it's told. A won badge can be worn beside the name, one at a time.

// The games a win counts for in "Todoterreno" (every game in "Juego libre").
const BADGE_GAMES = ["opciones", "musica", "mundo", "historia", "minas", "lluvia", "rey", "farsante"];

export const BADGES = [
  { id: "campeon", get name() { return tr("Campeón"); }, icon: "crown", color: "#FFD60A", edge: "#9E8400", ink: "#0a0b0c", get how() { return tr("Gana 100 partidas."); }, goal: 100, progress: (u) => u.stats?.wins || 0 },
  { id: "enciclopedia", get name() { return tr("Enciclopedia"); }, icon: "bulb", color: "#2F6BFF", edge: "#1A3C99", ink: "#ffffff", get how() { return tr("Llega a 1000 aciertos."); }, goal: 1000, progress: (u) => u.stats?.correctAnswers || 0 },
  { id: "imparable", get name() { return tr("Imparable"); }, icon: "flame", color: "#FF5A1F", edge: "#B32F00", ink: "#0a0b0c", get how() { return tr("Acierta 15 seguidas en una partida."); }, goal: 15, progress: (u) => u.stats?.bestStreak || 0 },
  { id: "veterano", get name() { return tr("Veterano"); }, icon: "hourglass", color: "#00A2FF", edge: "#0A62A8", ink: "#0a0b0c", get how() { return tr("Juega 100 partidas."); }, goal: 100, progress: (u) => u.stats?.gamesPlayed || 0 },
  { id: "constante", get name() { return tr("Constante"); }, icon: "calendar", color: "#1FD24A", edge: "#12801F", ink: "#0a0b0c", get how() { return tr("Completa 30 retos del día."); }, goal: 30, progress: (u) => u.dailyDone || 0 },
  {
    id: "todoterreno",
    get name() { return tr("Todoterreno"); },
    icon: "grid",
    color: "#00D1C1",
    edge: "#007A71",
    ink: "#0a0b0c",
    get how() { return tr("Gana contra alguien en cada uno de los 8 juegos."); },
    goal: BADGE_GAMES.length,
    progress: (u) => BADGE_GAMES.filter((g) => (u.stats?.winsByGame?.[g] || 0) > 0).length,
  },
  { id: "leyenda", get name() { return tr("Leyenda"); }, icon: "verified", color: "#A63DFF", edge: "#6418A8", ink: "#ffffff", get how() { return tr("Llega a Leyenda en el Clásico."); }, goal: 1500, unit: "puntos", progress: (u) => u.rank?.best || 0 },
  {
    id: "perfeccion",
    get name() { return tr("Perfección"); },
    icon: "check",
    color: "#FFFFFF",
    edge: "#AEB3BF",
    ink: "#0a0b0c",
    get how() { return tr("Acierta todas las rondas de un Clásico."); },
    goal: 1,
    progress: (u) => u.stats?.perfectGames || 0,
  },
  { id: "record", get name() { return tr("Récord"); }, icon: "target", color: "#FF3D5E", edge: "#A3122F", ink: "#ffffff", get how() { return tr("Haz 15,000 puntos en una sola partida."); }, goal: 15000, unit: "puntos", progress: (u) => u.stats?.bestScore || 0 },
  {
    id: "melomano",
    get name() { return tr("Melómano"); },
    icon: "music",
    color: "#FF2FC0",
    edge: "#A3157A",
    ink: "#0a0b0c",
    get how() { return tr("Adivina 500 canciones en Adivina la canción."); },
    goal: 500,
    progress: (u) => Object.values(u.stats?.artistHits || {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
  },
];

export const badgeById = (id) => BADGES.find((b) => b.id === id) || null;

/** Each badge with how far `user` is: { ...badge, have, earned }. `have` never passes the goal. */
export function badgeProgress(user) {
  return BADGES.map((b) => {
    const value = user && !user.isGuest ? b.progress(user) : 0;
    return { ...b, have: Math.min(value, b.goal), earned: value >= b.goal };
  });
}
