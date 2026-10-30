// A match of several games played as one (a public match or a Clásico): its games ("items", each a game id and that
// game's settings) are kept in `room.playlist` when it starts, and `room.run` keeps them in play order, which one is on
// and how many games each player won: whoever wins the most games wins (points across all of them break a tie). The
// rooms' own "Playlist" (games chosen and shared by players) no longer exists.

// Where a public match's results show (`room.game` once it ends); nobody picks it.
export const PLAYLIST_GAME = "playlist";
// The games' names for the messages.
export const GAME_NAMES = {
  opciones: "Trivia",
  musica: "Adivina la canción",
  mundo: "Encuentra el país",
  historia: "Rango",
  minas: "Campo de minas",
  lluvia: "Lluvia",
};
// Where each game keeps its settings in room.config (Adivina la canción's are at the top of it).
const CONFIG_KEY = { opciones: "quiz", mundo: "geo", historia: "history", minas: "mines", lluvia: "rain", musica: null };

/** The room's settings with an item's in place of its game's: what the room plays while the item is on. */
export function configWithItem(base, item) {
  const key = CONFIG_KEY[item.game];
  return key ? { ...base, [key]: item.config } : { ...base, ...item.config };
}

/** A new run, about to play its first item. `savedConfig` is the room's own settings, put back at the end. */
export function newRun(playlist, savedConfig) {
  return {
    name: playlist.name,
    order: playlist.order,
    // A single match (RoomManager.startMixed): each game's rounds one game after the other. There is no screen between
    // games; the match ends on its results.
    mixed: true,
    items: [...playlist.items],
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

/** A playlist's games in order, each with whoever scored the most in it (nobody when nobody scored). */
function itemResults(run) {
  return run.items
    .map((item, i) => ({ item, points: run.itemPoints?.[i] }))
    .filter(({ points }) => points)
    .map(({ item, points }) => {
      const top = Math.max(0, ...Object.values(points));
      return { variant: item.variant || item.game, winners: top > 0 ? Object.keys(points).filter((id) => points[id] === top) : [] };
    });
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
    // A public match: ranked by games won (then points); one of the roulette, how many it takes to win it.
    bestOf: Boolean(run.gameWins),
    winsToWin: run.winsToWin || null,
    index: run.index,
    total: run.items.length,
    games: run.items.map((item) => item.game),
    played: run.games,
    // Each game's variant and its winners (all of them on a tie): a match decided by games won keeps them as it goes
    // (gameResults); a playlist works them out from the points scored in each of its games (itemPoints).
    results: run.gameResults || itemResults(run),
    finished: run.finished,
    standings,
    winnerId: run.finished ? playlistWinner(standings) : null,
  };
}
