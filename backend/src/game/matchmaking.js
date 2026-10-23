// Partidas públicas ("Casual" and "Competitivo" in the Jugar sheet): players who don't know each other are put in the
// same room until it's full (2 players for "Duelo", 5 for "Todos contra todos"), and then the match starts on its own. A
// match is one game or three (MATCH_LENGTHS), each one of MATCH_VARIANTS (a game with one of its ways only: "Trivia
// Cerradas", "Rango Cifras"...; the same in both kinds), played one after another (a playlist in order, each game with
// its own rounds: matchGameRounds, 5 but for Campo de minas' 3).
// Nobody chooses them: every player votes before searching ("Vota los juegos", one vote per game, cleanVotes) and the
// roulette spins among everyone's votes (matchBallot). Before each game it shows which vote comes up, followed by a short
// tutorial of that game (the room's "intro" phase: INTRO_SPIN_MS + INTRO_TUTORIAL_MS).

export const MATCH_KINDS = ["casual", "competitivo"];
// How many games a match plays: "1 juego" or "3 juegos".
export const MATCH_LENGTHS = [1, 3];
// How many players a room needs: 2 ("Duelo") or 5 ("Todos contra todos").
export const MATCH_SIZES = [2, 5];
// Competitivo's games: Trivia, Rango and Campo de minas, the ones judged only by what you know.
export const MATCH_GAMES = ["opciones", "historia", "minas"];
// Casual plays the same ones. (The other games still have their public-match clock and bots, matchRoundMs and
// RoomManager.botMove, in case they're added here.)
export const CASUAL_GAMES = [...MATCH_GAMES];

// "Clásico", at the top of a private room's "Elige el juego": a match like Casual's (the roulette, the tutorials, the
// same clocks and games) for the room's own players, started by its host, with no search, bots or rank. Its two game
// ids are how many games each draws: "clasico" (Normal) 3, like a public match of 3 juegos, and "extendido" 5.
export const CLASSIC_GAMES = { clasico: 3, extendido: 5 };
export const CLASSIC_NAMES = { clasico: "Clásico normal", extendido: "Clásico extendido" };
export const isClassic = (game) => Object.hasOwn(CLASSIC_GAMES, game ?? "");

/** The games a public match of `kind` draws from. */
export const gamesFor = (kind) => (kind === "casual" ? CASUAL_GAMES : MATCH_GAMES);

// What the roulette actually draws: every game of MATCH_GAMES once per way of playing it, each a game of its own in a
// public match ("Trivia Cerradas" plays only four-option questions). `config` goes into that game's settings.
export const MATCH_VARIANTS = [
  { id: "trivia-cerradas", game: "opciones", config: { formats: ["opciones"] } },
  { id: "trivia-abiertas", game: "opciones", config: { formats: ["escribir"] } },
  { id: "rango-linea", game: "historia", config: { styles: ["linea"] } },
  { id: "rango-cifras", game: "historia", config: { styles: ["cifras"] } },
  { id: "minas-turnos", game: "minas", config: { styles: ["turnos"] } },
  { id: "minas-carrera", game: "minas", config: { styles: ["carrera"] } },
];
export const findVariant = (id) => MATCH_VARIANTS.find((v) => v.id === id) || null;
/** The variants a public match of `kind` draws from: those of its games. */
export const variantsFor = (kind) => MATCH_VARIANTS.filter((v) => gamesFor(kind).includes(v.game)).map((v) => v.id);
// MATCH_SIZE in the environment caps every room's size (1 fills it alone, to try it out).
const SIZE_CAP = Math.max(1, Math.min(5, Math.round(Number(process.env.MATCH_SIZE)) || 5));

/** The players a room of `size` needs, with the environment's cap. */
export const roomSize = (size) => Math.min(size, SIZE_CAP);
// Once the room is full, how long everyone sees it full before the match starts.
export const MATCH_FULL_MS = 3000;
// The roulette, and then the tutorial of the game it picked (always 5 s, so everyone can read it).
export const INTRO_SPIN_MS = 4000;
export const INTRO_TUTORIAL_MS = 5000;
export const INTRO_MS = INTRO_SPIN_MS + INTRO_TUTORIAL_MS;

// Casual only: when the room hasn't filled after BOT_WAIT_MS, bots take the empty seats, one every BOT_GAP_MS or so
// (as if people were arriving), and play by themselves (RoomManager.scheduleBots). Competitivo waits for people.
export const BOT_WAIT_MS = 1000;
export const BOT_GAP_MS = [700, 1600];
// Two words, like game bots: a first name and a nickname, in Spanish or English ("Andrea Galaxy", "Leo Tormenta").
const BOT_FIRST = [
  "Andrea", "Leo", "Sofía", "Max", "Lucía", "Diego", "Emma", "Mateo", "Valeria", "Nico", "Camila", "Bruno",
  "Olivia", "Hugo", "Mía", "Iker", "Zoe", "Tomás", "Ava", "Gael", "Noah", "Daniela", "Liam", "Renata",
];
const BOT_LAST = [
  "Galaxy", "Tormenta", "Nova", "Thunder", "Pixel", "Cometa", "Blaze", "Rayo", "Storm", "Shadow", "Luna", "Fénix",
  "Spark", "Volcán", "Frost", "Turbo", "Eclipse", "Neón", "Rocket", "Tigre", "Ninja", "Trueno", "Comet", "Ciclón",
];
const BOT_COLORS = ["#FF2D55", "#FF8A00", "#2BD94F", "#0A9BFF", "#A63DFF", "#FF5FB8"];

/** A bot for a room: a name nobody there has, a colour, and how good it is (`skill`, 0.15–0.45: they lose more than win). */
export function newBot(takenNames, random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  let name = `${pick(BOT_FIRST)} ${pick(BOT_LAST)}`;
  for (let i = 0; i < 20 && takenNames.has(name); i += 1) name = `${pick(BOT_FIRST)} ${pick(BOT_LAST)}`;
  return {
    // Like a guest's id: nothing a player sees says it's a bot.
    id: `gst_${Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
    name,
    avatar: BOT_COLORS[Math.floor(random() * BOT_COLORS.length)],
    isGuest: true,
    bot: true,
    skill: 0.15 + random() * 0.3,
  };
}

/** A request to find a match (`{ kind, gameCount, size }`), or an error in Spanish when it isn't one. */
export function cleanMatchRequest(input) {
  const kind = MATCH_KINDS.includes(input?.kind) ? input.kind : null;
  // Older clients send the length in rounds: 5 was one game and 15 three.
  const gameCount = input?.gameCount == null && input?.rounds != null ? Number(input.rounds) / 5 : Number(input?.gameCount);
  // Older clients don't send it: 5 players.
  const size = input?.size == null ? 5 : Number(input.size);
  if (!kind) throw new Error("Elige Casual o Competitivo");
  if (!MATCH_LENGTHS.includes(gameCount)) throw new Error("Elige 1 o 3 juegos");
  if (!MATCH_SIZES.includes(size)) throw new Error("Elige Duelo o Todos contra todos");
  return { kind, gameCount, size };
}

function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The games of a match, in random order: all of `pool` shuffled (the kind's games, gamesFor), so the caller takes the
 * first ones that can be played, all different. With `count`, only that many.
 */
export function pickMatchGames(count, random = Math.random, pool = MATCH_GAMES) {
  const games = shuffle(pool, random);
  return count == null ? games : games.slice(0, count);
}

// "Vota los juegos": a vote is a variant's id (MATCH_VARIANTS) or RANDOM_VOTE, "Al azar" (any of them, decided when the
// roulette lands on it).
export const RANDOM_VOTE = "azar";

/** A player's votes for a match of `kind` and `gameCount` games: one per game, a missing or unknown one being "Al azar". */
export function cleanVotes(input, kind, gameCount) {
  const known = variantsFor(kind);
  const list = Array.isArray(input) ? input : [];
  return Array.from({ length: gameCount }, (_, i) => (known.includes(list[i]) ? list[i] : RANDOM_VOTE));
}

/** A bot's votes, like a person's: now and then "Al azar", otherwise games it picks, never the same one twice. */
export function botVotes(kind, gameCount, random = Math.random) {
  const picks = shuffle(variantsFor(kind), random);
  return Array.from({ length: gameCount }, (_, i) => (random() < 0.3 ? RANDOM_VOTE : picks[i % picks.length]));
}

/**
 * The roulette's cards for a match: every vote of every player (`[{ id, name, avatar, votes }]`), one card each (two
 * players voting for the same game get a card each, so it comes up more often), in random order. The order stays for
 * the whole match: each game's roulette spins among the cards still left (RoomManager.introBallot).
 */
export function matchBallot(players, random = Math.random) {
  const cards = players.flatMap((p) => p.votes.map((variant) => ({ userId: p.id, name: p.name, avatar: p.avatar, variant })));
  return shuffle(cards, random).map((card, i) => ({ id: `v${i}`, ...card }));
}

// How many rounds each game has in a public match or a Clásico: GAME_ROUNDS, but Campo de minas' boards are long (3 of
// them) and Lluvia's rounds are whole showers (two are as long as the other games' five rounds).
export const GAME_ROUNDS = 5;
export const MINES_MATCH_ROUNDS = 3;
export const RAIN_MATCH_ROUNDS = 2;

/** A game's rounds in a public match or a Clásico. */
export function matchGameRounds(game) {
  if (game === "minas") return MINES_MATCH_ROUNDS;
  if (game === "lluvia") return RAIN_MATCH_ROUNDS;
  return GAME_ROUNDS;
}

/**
 * A game's settings in a public match or a Clásico, as a playlist item's config (before the game's own merge*Config
 * cleans it): its rounds (matchGameRounds) and every category. Competitivo leaves out the easy questions; `easy` puts
 * them back (when the medium and hard ones aren't enough).
 */
export function matchItemConfig(game, kind, { easy = false, variant = null } = {}) {
  const difficulties = kind === "competitivo" && !easy ? ["media", "dificil"] : ["facil", "media", "dificil"];
  return { rounds: matchGameRounds(game), difficulties, ...matchTimes(game), ...(findVariant(variant)?.config || {}) };
}

// A public match's clock, the same for everyone: 10 s a question (Trivia, Rango), 15 s a song or a country (the audio
// and the map need a moment more), 10 s a turn in Campo de minas and 30 s for a whole round of it played as a race, and
// 30 s a shower of Lluvia (RAIN_MATCH_ROUNDS of them).
export const MATCH_QUESTION_MS = 10000;
export const MATCH_SLOW_MS = 15000;
export const MATCH_TURN_MS = 10000;
export const MATCH_RACE_MS = 30000;
export const MATCH_RAIN_MS = 30000;

/** A game's times in a public match, put in its settings as they are (Trivia's own settings start at 15 s). */
export function matchTimes(game) {
  if (game === "minas") return { turnMs: MATCH_TURN_MS, roundMs: MATCH_RACE_MS };
  return { roundMs: matchRoundMs(game) };
}

/** How long a round (or a turn of Campo de minas, or a whole race of it) lasts in a public match. */
export function matchRoundMs(game, race = false) {
  if (game === "minas") return race ? MATCH_RACE_MS : MATCH_TURN_MS;
  if (game === "musica" || game === "mundo") return MATCH_SLOW_MS;
  if (game === "lluvia") return MATCH_RAIN_MS;
  return MATCH_QUESTION_MS;
}

/**
 * What a public match shows of itself: its kind, how many games it plays (`gameCount`) and which ones once drawn
 * (`games`), how full it is and when it starts once full.
 */
export function publicMatchmaking(info, connected) {
  return {
    kind: info.kind,
    gameCount: info.gameCount,
    size: info.size,
    // What was chosen (2 or 5), even when MATCH_SIZE lowers what fills it.
    versus: info.versus,
    count: connected,
    games: info.games || null,
    startsAt: info.startsAt || null,
  };
}
