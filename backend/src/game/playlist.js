// Playlists: several games of the room played one after another, each with its own settings ("Campo de minas" with
// only easy boards about history, then "Adivina la canción" with the Spanish songs, then "Campo de minas" again...).
// The room's playlist (`room.playlist`) is made in its own panel, like a game's settings: a name, the order to play it
// in ("orden": each game whole, as listed; "aleatorio": one match with every game's rounds mixed at random) and its items, each a game id and that game's
// settings. While it is played, `room.run` keeps the items in play order, which one is on and how many games each
// player won: whoever wins the most games wins the playlist (points across all of them break a tie).

export const PLAYLIST_GAME = "playlist";
// The games a playlist can have, and their names for the messages.
export const PLAYLIST_GAMES = ["opciones", "musica", "mundo", "historia", "minas", "lluvia"];
export const GAME_NAMES = {
  opciones: "Trivia",
  musica: "Adivina la canción",
  mundo: "Encuentra el país",
  historia: "Rango",
  minas: "Campo de minas",
  lluvia: "Lluvia",
};
export const PLAYLIST_ORDERS = ["orden", "aleatorio"];
export const PLAYLIST_LIMITS = { items: 10, name: 40 };
const DEFAULT_NAME = "Mi playlist";
// Where each game keeps its settings in room.config (Adivina la canción's are at the top of it).
const CONFIG_KEY = { opciones: "quiz", mundo: "geo", historia: "history", minas: "mines", lluvia: "rain", musica: null };

export function emptyPlaylist() {
  return { name: DEFAULT_NAME, order: "orden", items: [] };
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * A playlist as the room keeps it, from whatever a client sent (an edit, or a JSON someone imported): a name of at most
 * PLAYLIST_LIMITS.name letters, a known order and at most PLAYLIST_LIMITS.items items of known games. Each item keeps
 * its id when it is a short unique one (so the panel can keep it selected) and gets its settings from
 * `cleanConfig(game, config)`, which keeps every value valid (the game's own limits and lists).
 */
export function cleanPlaylist(input, cleanConfig) {
  const name = String(input?.name ?? "").replace(/\s+/g, " ").trim().slice(0, PLAYLIST_LIMITS.name) || DEFAULT_NAME;
  const order = PLAYLIST_ORDERS.includes(input?.order) ? input.order : "orden";
  const seen = new Set();
  const items = (Array.isArray(input?.items) ? input.items : [])
    .filter((item) => PLAYLIST_GAMES.includes(item?.game))
    .slice(0, PLAYLIST_LIMITS.items)
    .map((item) => {
      let id = typeof item.id === "string" && /^[a-z0-9_-]{1,24}$/i.test(item.id) ? item.id : "";
      if (!id || seen.has(id)) id = randomId();
      seen.add(id);
      const config = item.config && typeof item.config === "object" && !Array.isArray(item.config) ? item.config : {};
      return { id, game: item.game, config: cleanConfig(item.game, config) };
    });
  return { name, order, items };
}

/** The room's settings with an item's in place of its game's: what the room plays while the item is on. */
export function configWithItem(base, item) {
  const key = CONFIG_KEY[item.game];
  return key ? { ...base, [key]: item.config } : { ...base, ...item.config };
}

/** The items in the order they are played: as listed, or shuffled. */
export function playOrder(items, order, random = Math.random) {
  const out = [...items];
  if (order !== "aleatorio") return out;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A mixed playlist's rounds: each game's rounds (`perItem[i]`, in the order each was drawn) put together in a random
 * order, every round of every game played once: [{ item: i, track }]. Two of one game can come in a row.
 */
export function mixRounds(perItem, random = Math.random) {
  const slots = perItem.flatMap((tracks, i) => tracks.map(() => i));
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const next = perItem.map(() => 0);
  return slots.map((i) => ({ item: i, track: perItem[i][next[i]++] }));
}

/** A new playlist run, about to play its first item. `savedConfig` is the room's own settings, put back at the end. */
export function newRun(playlist, savedConfig, random = Math.random) {
  return {
    name: playlist.name,
    order: playlist.order,
    // Every playlist is a single match (RoomManager.startMixed): "orden" plays each game's rounds one game after the
    // other, "aleatorio" mixes them. There is no screen between games; the match ends on the playlist's results.
    mixed: true,
    items: playOrder(playlist.items, playlist.order, random),
    index: 0,
    // Per player (even one who left): name, avatar, games played and won, and points across them.
    standings: {},
    // Each game played: which one, and who won it (null for a tie or nobody scoring).
    games: [],
    finished: false,
    savedConfig,
  };
}

/**
 * A finished game of the run: everyone who played it adds it to their tally, its winner a win. Their rounds of it
 * (RoomManager.recordRound) are kept too, one after another, for "Tu playlist" on the final screen, with their best
 * streak.
 */
export function recordGame(run, game, ranked, winnerId) {
  for (const p of ranked) {
    const entry = run.standings[p.id] || (run.standings[p.id] = { wins: 0, points: 0, played: 0 });
    entry.name = p.name;
    entry.avatar = p.avatar;
    entry.isGuest = Boolean(p.isGuest);
    entry.played += 1;
    entry.points += p.score || 0;
    // A public match counts each of its games (run.gameWins); any other run is one game, won by its winner.
    if (run.gameWins) entry.wins = run.gameWins[p.id] || 0;
    else if (p.id === winnerId) entry.wins += 1;
    entry.rounds = [...(entry.rounds || []), ...(p.rounds || []).map((r) => ({ ...r }))];
    entry.bestStreak = Math.max(entry.bestStreak || 0, p.bestStreak || 0);
  }
  const winner = ranked.find((p) => p.id === winnerId);
  run.games.push({ game, winnerId: winnerId || null, winnerName: winner?.name || null });
}

/** The run's tally by position: the most games won first, then the most points. */
export function rankedStandings(run) {
  return Object.entries(run.standings)
    .map(([id, e]) => ({
      id,
      name: e.name,
      avatar: e.avatar,
      isGuest: Boolean(e.isGuest),
      wins: e.wins,
      points: e.points,
      played: e.played,
      rounds: (e.rounds || []).map(({ questionId, ...round }) => round),
      bestStreak: e.bestStreak || 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points);
}

/**
 * Who wins the playlist: whoever won the most games, and between those with as many, whoever has the most points.
 * Nobody (null) while nobody has won a game, or when the first two have as many wins and points.
 */
export function playlistWinner(ranked) {
  const [first, second] = ranked;
  if (!first || first.wins === 0) return null;
  if (second && second.wins === first.wins && second.points === first.points) return null;
  return first.id;
}

/** How a run goes out to the players (its items' settings and the room's own ones stay on the server). */
export function publicRun(run) {
  const standings = rankedStandings(run);
  return {
    name: run.name,
    order: run.order,
    mixed: Boolean(run.mixed),
    // A Clásico's game id ("clasico" or "extendido"): it's played like a playlist, but it's a match.
    classic: run.classic || null,
    // A public match: ranked by games won (then points), and whether its decider is being (or was) played.
    bestOf: Boolean(run.gameWins),
    decider: run.deciderIndex ?? null,
    index: run.index,
    total: run.items.length,
    games: run.items.map((item) => item.game),
    played: run.games,
    finished: run.finished,
    standings,
    winnerId: run.finished ? playlistWinner(standings) : null,
  };
}
