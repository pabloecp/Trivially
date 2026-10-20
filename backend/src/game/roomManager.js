import { cachedDefaultPlaylists, isDefaultSpotify } from "../catalog/defaultPlaylists.js";
import { SONG_DIFFICULTIES, SONG_GENRES, SONG_LANGUAGES, filterSongs, songCounts } from "../catalog/songFilters.js";
import { hasRole } from "../auth/roles.js";
import { CHAT_LINK_ERROR, hasLink, NAME_LINK_ERROR } from "../moderation/links.js";
import { hydrateSong } from "../catalog/catalogProvider.js";
import { cleanTitle, displayTitle } from "../catalog/trackResolver.js";
import { applyMatchStats } from "../db/store.js";
import { isCorrectAnswer, normalizeAnswer, songKey } from "./answers.js";
import {
  countQuestions,
  defaultQuizConfig,
  mergeQuizConfig,
  pickQuizQuestions,
  questionCounts,
  QUIZ_REVEAL_MS,
  quizPool,
} from "./quiz.js";
import { isCorrectOpenAnswer } from "./openAnswers.js";
import {
  countGeoQuestions,
  defaultGeoConfig,
  GEO_GAME,
  geoBank,
  LOCATION_REVEAL_MS,
  locationPoints,
  MAX_TIEBREAKS,
  mergeGeoConfig,
  pickGeoQuestions,
  pickTiebreakQuestion,
} from "./geo.js";
import {
  countHistoryQuestions,
  currentYear,
  historyCounts,
  defaultHistoryConfig,
  figureLabel,
  figurePoints,
  figureTolerance,
  HISTORY_GAME,
  HISTORY_REVEAL_MS,
  historyBank,
  mergeHistoryConfig,
  pickHistoryQuestions,
  pickHistoryTiebreak,
  yearLabel,
  yearPoints,
  yearsApart,
} from "./history.js";
import {
  countMinesQuestions,
  defaultMinesConfig,
  hitPoints,
  MINES_FIRST_TURN_EXTRA_MS,
  MINES_GAME,
  MINES_REVEAL_MS,
  mergeMinesConfig,
  minesBank,
  minesCounts,
  pickMinesQuestions,
} from "./mines.js";
import {
  cleanPlaylist,
  configWithItem,
  mixRounds,
  emptyPlaylist,
  GAME_NAMES,
  newRun,
  PLAYLIST_GAME,
  publicRun,
  recordGame,
} from "./playlist.js";
import {
  BOT_GAP_MS,
  BOT_WAIT_MS,
  cleanMatchRequest,
  INTRO_MS,
  INTRO_SPIN_MS,
  INTRO_TUTORIAL_MS,
  MATCH_FULL_MS,
  roomSize,
  matchItemConfig,
  matchRoundMs,
  matchTimes,
  newBot,
  pickMatchGames,
  publicMatchmaking,
} from "./matchmaking.js";
import { categoryName } from "../questions/questionSchema.js";
import { flagToken, flagUrl } from "../geo/flags.js";
import { locate } from "../geo/worldMap.js";
import { COUNTDOWN_MS, REVEAL_MS, ROUND_MS, scoreAnswer } from "./scoring.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// A room's code: this many characters of CODE_CHARS (no I, O, 0 or 1, easy to confuse), ~33 million codes.
export const ROOM_CODE_LENGTH = 5;
// Games the host can move a room into (ids match frontend/src/modes/index.js). `null` is the Home screen.
// "opciones" (Trivia, QUIZ_GAME) is the main mode: questions of every topic, each answered its own way (four
// options, a written answer or a year on a timeline). The extras: "musica" (Adivina la canción), "mundo" (Encuentra el país,
// GEO_GAME: countries pinned on the world map), "historia" (Rango, HISTORY_GAME:
// getting as close as you can on a range; for now only "Línea del tiempo", an event's year) and "minas" (Campo de minas, MINES_GAME: a prompt and a 5 × 5 board of
// answers, some right and some mines, picked one per turn). The question games keep their questions in room.tracks,
// in place of songs. "playlist" isn't a game of its own: it's where the room makes a playlist of them (game/playlist.js),
// and while one is played the room is in each of its games in turn.
export const GAME_IDS = ["musica", "opciones", "mundo", "historia", "minas", PLAYLIST_GAME];
// "Trivia": its settings live in config.quiz and its questions take the place of songs in room.tracks.
export const QUIZ_GAME = "opciones";
// The games that ask questions instead of playing songs.
const QUESTION_GAMES = [QUIZ_GAME, GEO_GAME, HISTORY_GAME, MINES_GAME];
// Custom playlists from an owner's Spotify go in config.playlistIds with this prefix ("sp:<spotify playlist id>").
export const SPOTIFY_PREFIX = "sp:";
// Rounds are chosen this many rounds ahead, so their audio and cover are downloaded before they start.
const LOOKAHEAD = 2;
// How long a dropped player keeps their seat (and host role) so a reload or network blip doesn't kick them.
const RECONNECT_GRACE_MS = 20000;
// A player can suggest a game this often, and a suggestion stays on the host's screen this long.
export const SUGGEST_COOLDOWN_MS = 5000;
const SUGGESTION_TTL_MS = 60000;
// The room's chat: how long a message can be, how many the room keeps (the newest), and how often one player can send.
export const CHAT_MAX_LENGTH = 200;
const CHAT_KEEP = 40;
const CHAT_GAP_MS = 700;
// A player can ask to use another device as the central one this often, and a room keeps this many requests at once.
export const CENTRAL_ASK_GAP_MS = 5000;
const CENTRAL_REQUESTS_KEEP = 5;
// What the host's friends can do from their friends list: join straight away, ask to join, or nothing (only the code).
export const JOIN_MODES = ["abierta", "solicitud", "invitacion"];
// A friend's request to join stays this long, and the same friend can ask again after this wait.
const JOIN_REQUEST_TTL_MS = 60000;
export const JOIN_ASK_GAP_MS = 10000;
const JOIN_REQUESTS_KEEP = 8;

export function assertGame(game) {
  if (game === null || GAME_IDS.includes(game)) return game;
  throw new Error("Ese juego no está disponible");
}

/** A player's name can't carry a link (moderation/links.js): the Jugar sheet says so and they write another. */
function assertNameWithoutLink(user) {
  if (hasLink(user?.name)) throw new Error(NAME_LINK_ERROR);
}

/** A player's rounds as they go out to the players: without the questions' ids. */
// After this many rounds in a row without answering, a match stops waiting for the player (markIdle).
export const IDLE_ROUNDS = 3;

export function publicRounds(rounds = []) {
  return rounds.map(({ questionId, ...round }) => round);
}

export function createRoomCode(existing) {
  let code = "";
  do {
    code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (existing.has(code));
  return code;
}

// Acts whose own name has a comma, an "&" or a "+": one artist, never split ("Tyler, The Creator", "Jesse & Joy").
const ONE_ARTIST = [
  "Tyler, The Creator",
  "Earth, Wind & Fire",
  "Crosby, Stills, Nash & Young",
  "Crosby, Stills & Nash",
  "Emerson, Lake & Palmer",
  "Jesse & Joy",
  "Chino & Nacho",
  "Wisin & Yandel",
  "Jowell & Randy",
  "Zion & Lennox",
  "Alexis & Fido",
  "Angel & Khriz",
  "Baby Rasta & Gringo",
  "Hector & Tito",
  "Rakim & Ken-Y",
  "R.K.M & Ken-Y",
  "Simon & Garfunkel",
  "Hall & Oates",
  "Daryl Hall & John Oates",
  "Mumford & Sons",
  "Kool & The Gang",
  "Sly & The Family Stone",
  "Bob Marley & The Wailers",
  "Florence + The Machine",
  "Macklemore & Ryan Lewis",
  "Sam & Dave",
  "Ike & Tina Turner",
  "Brooks & Dunn",
  "Dan + Shay",
  "Chase & Status",
  "Above & Beyond",
];
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ONE_ARTIST_RE = new RegExp(`(?:^|(?<=[\\s,&]))(?:${ONE_ARTIST.map(escapeRe).join("|")})(?=$|[\\s,&])`, "gi");

// A song's artists, written the same way whatever the source: "Tainy, Alvaro Diaz", "Bad Bunny & Drake" or
// "ROSALÍA feat. The Weeknd" give each one apart ("tainy", "alvaro diaz"), but "Tyler, The Creator" stays one. The
// first one is the main artist.
export function artistsOf(name = "") {
  return String(name)
    .replace(ONE_ARTIST_RE, (act) => act.replace(/[,&+]/g, "\u0001"))
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\s+x\s+|\bwith\b)\s*/i)
    .map((a) => normalizeAnswer(a.replace(/\u0001/g, " ")))
    .filter(Boolean);
}

/** A list of artists as people read it: "Peso Pluma, Gabito Ballesteros & Junior H". The last one goes after "&", so
 *  a name with a comma in it stays readable as one: "Tyler, The Creator & Kali Uchis". */
export function joinArtists(list) {
  const names = (list || []).filter(Boolean);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : names[0] || "";
}

/** Every artist of a song (the full list from Spotify), else its credit as it is. */
export function artistLine(song) {
  if (Array.isArray(song?.artists) && song.artists.length) return joinArtists(song.artists);
  // The search box's list already carries them as one line.
  return (typeof song?.artists === "string" && song.artists) || song?.artistName || "";
}

// A song's artists to compare them: each name of its list whole ("Tyler, The Creator" is one), else split from its credit.
function artistKeys(song) {
  return Array.isArray(song?.artists) && song.artists.length ? song.artists.map((a) => normalizeAnswer(a)) : artistsOf(song?.artistName);
}

// Adivina la canción's ways of answering ("Modos"): closed questions, four songs to choose from ("opciones"), and open
// ones, the title typed in the search box ("escribir"). Both are ticked in a new room; the rounds are shared evenly.
export const MUSIC_FORMATS = ["opciones", "escribir"];
// Same limits as its settings on screen: 5–25 rounds, 15–35 seconds to guess.
const MUSIC_LIMITS = { rounds: { min: 5, max: 25 }, roundMs: { min: 15000, max: 35000 } };
const clampTo = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));

// A new room plays the whole catalog (`useCatalog`, every language, genre and difficulty ticked) and no Spotify
// playlists; `playlistIds` are the ticked Spotify ones ("sp:<id>"). With `useCatalog` false only those play.
function defaultConfig() {
  return {
    rounds: 5,
    roundMs: ROUND_MS,
    useCatalog: true,
    languages: [...SONG_LANGUAGES],
    genres: [...SONG_GENRES],
    difficulties: [...SONG_DIFFICULTIES],
    playlistIds: [],
    formats: [...MUSIC_FORMATS],
    quiz: defaultQuizConfig(),
    geo: defaultGeoConfig(),
    history: defaultHistoryConfig(),
    mines: defaultMinesConfig(),
  };
}

function publicPlayer(player, phase, room) {
  const showAnswer = phase === "reveal" || phase === "finished";
  const isHost = Boolean(room && room.hostId === player.id);
  const canEditConfig = isHost || Boolean(room?.coHosts?.includes(player.id));
  // Campo de minas: while a round is played, "answered" means picked a cell in this turn (never, in a race: there are
  // no turns to wait for).
  const mines = room?.game === MINES_GAME;
  const field = mines ? player.minefield : null;
  const race = mines && room.tracks?.[room.currentRound]?.style === "carrera";
  const answered =
    mines && phase === "playing" ? Boolean(field && !field.out && !race && field.pickedTurn === room.turn) : Boolean(player.lastAnswer);
  return {
    // Campo de minas: why the player is out of the round ("mina" or "tiempo"), or null while still in, and how many
    // right answers they found in it.
    ...(mines ? { out: field?.out || null, hits: field?.hits || 0 } : {}),
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    isGuest: Boolean(player.isGuest),
    // Never whether it's a bot (RoomManager.addBot): to the players, bots are like any other guest.
    status: player.status,
    score: player.score,
    correct: player.correct,
    streak: player.streak,
    bestStreak: player.bestStreak,
    answered,
    // Hasn't answered in IDLE_ROUNDS rounds in a row: rounds no longer wait for them (it ends when they answer).
    idle: Boolean(player.idle),
    lastPoints: player.lastPoints || 0,
    lastAnswer: showAnswer ? player.lastAnswer : null,
    connected: player.connected,
    // Joined in the middle of a match: watches it and joins the room's next one.
    spectator: Boolean(player.spectator),
    isHost,
    canEditConfig,
  };
}

export class RoomManager {
  constructor({ catalog, store, questions = [], resolver = null, reconnectGraceMs = RECONNECT_GRACE_MS }) {
    this.catalog = catalog;
    // The trivia question bank (backend/src/questions/questionBank.js loadQuestions).
    this.questions = questions;
    // Geografía's part of it (filled in from geo/countries.js for any kind the bank lacks).
    this.geoQuestions = geoBank(questions);
    // Historia's (from history/events.js when the bank has none).
    this.historyQuestions = historyBank(questions);
    // Trivia's: the bank's own plus Geografía's written questions.
    this.quizQuestions = quizPool(questions, this.geoQuestions);
    // Campo de minas' (from mines/boards/ when the bank has none).
    this.minesQuestions = minesBank(questions);
    this.resolver = resolver;
    this.store = store;
    this.reconnectGraceMs = reconnectGraceMs;
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  get(code) {
    return this.rooms.get(code.toUpperCase());
  }

  /**
   * The room a code opens, checked before asking for a name (the Jugar sheet's "Tengo un código"): it throws when no
   * room has that code, or when the host took this player out of it.
   */
  findToJoin(code, userId = null) {
    const room = this.get(String(code || ""));
    if (!room) throw new Error("No hay ninguna sala con ese código");
    if (userId && room.blocked?.has(userId)) throw new Error("El anfitrión te bloqueó de esta sala");
    // A public match (findMatch) is only entered by searching for one; its players can come back to it (a reload).
    if (room.matchmaking && !room.players.has(userId)) throw new Error("Esa sala es de una partida pública: búscala desde Jugar");
    return room;
  }

  /** Connected players of a room (the ones a public match counts to be full). */
  connectedCount(room) {
    let n = 0;
    for (const p of room.players.values()) if (p.connected) n += 1;
    return n;
  }

  /**
   * "Casual" or "Competitivo" (`{ kind, rounds }`): the player goes into a public room of that kind and length that is
   * still waiting for players, or a new one. Nobody is its host: nobody picks the game, changes the settings, pauses or
   * ends it. When it has its size of players (2 or 5) it starts by itself (checkMatchFull).
   */
  findMatch(user, input) {
    const { kind, rounds, size } = cleanMatchRequest(input);
    assertNameWithoutLink(user);
    let room = [...this.rooms.values()].find(
      (r) =>
        r.matchmaking &&
        r.phase === "lobby" &&
        !r.matchmaking.startsAt &&
        r.matchmaking.kind === kind &&
        r.matchmaking.rounds === rounds &&
        r.matchmaking.versus === size &&
        !r.blocked?.has(user.id) &&
        this.connectedCount(r) < r.matchmaking.size
    );
    if (room) {
      this.addPlayer(room, user);
    } else {
      room = this.create({ host: user, game: null });
      room.hostId = null;
      room.joinMode = "invitacion";
      room.matchmaking = { kind, rounds, versus: size, size: roomSize(size), games: null, startsAt: null, timer: null, botTimer: null };
      if (kind === "casual") this.scheduleBotArrival(room, BOT_WAIT_MS);
    }
    this.checkMatchFull(room);
    return room;
  }

  /**
   * Casual: after `delay`, a bot takes an empty seat, and then another one every second or so until the room is full
   * (which starts it, checkMatchFull). Players who arrive meanwhile take seats as usual.
   */
  scheduleBotArrival(room, delay) {
    const info = room.matchmaking;
    clearTimeout(info.botTimer);
    info.botTimer = setTimeout(() => {
      info.botTimer = null;
      if (this.rooms.get(room.code) !== room || room.phase !== "lobby" || info.startsAt) return;
      if (this.connectedCount(room) >= room.matchmaking.size) return;
      this.addBot(room);
      this.checkMatchFull(room);
      this.onPhaseChange?.(room);
      if (this.connectedCount(room) < room.matchmaking.size) {
        const [min, max] = BOT_GAP_MS;
        this.scheduleBotArrival(room, min + Math.random() * (max - min));
      }
    }, delay);
    info.botTimer.unref?.();
  }

  /** A bot in the room: a player with no connection who answers by itself while a round is played (scheduleBots). */
  addBot(room) {
    const bot = newBot(new Set([...room.players.values()].map((p) => p.name)));
    room.players.set(bot.id, {
      ...bot,
      score: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      answerTimes: [],
      lastAnswer: null,
      lastPoints: 0,
      connected: true,
      socketId: null,
      status: "conectado",
    });
    return bot;
  }

  /** Whether someone (not a bot) is still connected: a room with only bots left is closed. */
  hasPeople(room) {
    for (const p of room.players.values()) if (p.connected && !p.bot) return true;
    return false;
  }

  /**
   * The bots' moves for the round (or turn) being played: each one answers after a while, sometimes right and sometimes
   * not, as good as its `skill`. In a race of Campo de minas they keep picking until they step on a mine. Called each
   * time a round or turn starts playing, and when a paused match goes on.
   */
  scheduleBots(room) {
    this.clearBotMoves(room);
    if (room.phase !== "playing" || room.paused) return;
    const bots = [...room.players.values()].filter((p) => p.bot && this.isPlaying(room, p.id));
    if (!bots.length) return;
    const round = room.currentRound;
    const turn = room.turn;
    const still = () => this.rooms.get(room.code) === room && room.phase === "playing" && !room.paused && room.currentRound === round && room.turn === turn;
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        if (!still()) return;
        fn();
      }, ms);
      t.unref?.();
      room.botTimers.push(t);
    };
    const left = Math.max(1000, (room.phaseEndsAt || Date.now()) - Date.now());
    for (const bot of bots) {
      const move = () => {
        let again = false;
        try {
          again = this.botMove(room, bot);
        } catch {
          // A move that isn't allowed any more (someone took the cell first...) is just skipped.
        }
        this.onPhaseChange?.(room);
        if (again) later(move, 2000 + Math.random() * 3500);
      };
      // Not too quick: people usually answer first.
      later(move, left * (0.35 + Math.random() * 0.5));
    }
  }

  clearBotMoves(room) {
    for (const t of room.botTimers || []) clearTimeout(t);
    room.botTimers = [];
  }

  /** One move of a bot in the round being played. Returns true when it may move again (a race of Campo de minas). */
  botMove(room, bot) {
    const track = room.tracks[room.currentRound];
    if (!track) return false;
    const right = Math.random() < bot.skill;
    if (this.isChoiceRound(room)) {
      const others = track.options.map((_, i) => i).filter((i) => i !== track.answer);
      this.submitAnswer(room, bot.id, right ? track.answer : others[Math.floor(Math.random() * others.length)]);
      return false;
    }
    if (this.isYearRound(room)) {
      // Closer the better it is: off by up to a share of the line, the exact answer now and then.
      const exact = Math.random() < bot.skill * 0.12;
      const reach = (track.max - track.min) * (1 - bot.skill) * 0.6;
      const off = exact ? 0 : Math.round((Math.random() * 2 - 1) * reach);
      if (track.kind === "cifras") {
        const snap = track.snap || 1;
        const value = Math.min(track.max, Math.max(track.min, Math.round((track.value + off) / snap) * snap));
        this.placeYear(room, bot.id, { value, lock: true });
      } else {
        let year = Math.min(track.max, currentYear(), Math.max(track.min, track.year + off));
        if (year === 0) year = 1;
        this.placeYear(room, bot.id, { year, lock: true });
      }
      return false;
    }
    if (this.isMinesRound(room)) {
      const field = bot.minefield;
      if (!field || field.out) return false;
      const free = track.cells.map((c, i) => ({ c, i })).filter(({ c }) => !c.by);
      const good = free.filter(({ c }) => c.correct);
      if (!free.length) return false;
      // Bots know some of the answers: a right cell about half the time, otherwise any free one.
      const pool = good.length && Math.random() < 0.3 + bot.skill * 0.5 ? good : free;
      const { i } = pool[Math.floor(Math.random() * pool.length)];
      const hit = this.pickCell(room, bot.id, { cell: i, turn: room.turn });
      return hit && this.isMinesRace(room);
    }
    if (track.type === "open") {
      this.submitAnswer(room, bot.id, right ? track.answer : "No lo sé");
    }
    return false;
  }

  /**
   * A public room waiting for players: once full, it starts after MATCH_FULL_MS (everyone sees it full first); if
   * someone leaves before that, it goes back to waiting.
   */
  checkMatchFull(room) {
    const info = room.matchmaking;
    if (!info || room.phase !== "lobby") return;
    const full = this.connectedCount(room) >= room.matchmaking.size;
    if (full && !info.startsAt) {
      info.startsAt = Date.now() + MATCH_FULL_MS;
      info.timer = setTimeout(() => {
        info.timer = null;
        if (this.rooms.get(room.code) !== room || room.phase !== "lobby") return;
        if (this.connectedCount(room) < room.matchmaking.size) {
          info.startsAt = null;
        } else {
          try {
            clearTimeout(info.botTimer);
            this.startMatch(room);
            this.onMatchStart?.(room);
          } catch (err) {
            console.error("No se pudo empezar la partida pública", err);
            info.startsAt = null;
          }
        }
        this.onPhaseChange?.(room);
      }, MATCH_FULL_MS);
      info.timer.unref?.();
    } else if (!full && info.startsAt) {
      clearTimeout(info.timer);
      info.timer = null;
      info.startsAt = null;
    }
  }

  /**
   * Starts a full public room: its games are drawn (one per 5 rounds, all different) and played as a playlist in that
   * order, 5 rounds each. Competitivo plays only medium and hard questions while there are enough of them.
   */
  startMatch(room) {
    const { kind, rounds } = room.matchmaking;
    const games = pickMatchGames(rounds);
    // The times go in after cleaning, as they are: a public match is quicker than a game's own settings allow.
    const configFor = (game, easy) => ({ ...this.cleanItemConfig(room, game, matchItemConfig(game, kind, { easy })), ...matchTimes(game) });
    const items = games.map((game, i) => {
      const item = { id: `m${i}`, game, config: configFor(game, false) };
      if (!this.itemProblem(room, item, room.config, { exact: true })) return item;
      return { ...item, config: configFor(game, true) };
    });
    room.matchmaking.games = games;
    room.matchmaking.startsAt = null;
    room.playlist = { name: kind === "competitivo" ? "Partida competitiva" : "Partida casual", order: "orden", items };
    room.run = newRun(room.playlist, room.config);
    this.startMixed(room);
  }

  create({ host, mode, config, game = null }) {
    assertNameWithoutLink(host);
    const code = createRoomCode(this.rooms);
    const room = {
      code,
      mode: mode || "multi",
      game: assertGame(game),
      hostId: host.id,
      coHosts: [],
      joinMode: "solicitud",
      joinRequests: [],
      createdAt: Date.now(),
      phase: "lobby",
      phaseStartedAt: Date.now(),
      phaseEndsAt: null,
      currentRound: 0,
      tracks: [],
      totalRounds: 0,
      currentTrackId: null,
      answers: {},
      timer: null,
      // "sp:<id>" -> a Spotify playlist the host added: its songs and which ones are already playable.
      customPlaylists: {},
      config: { ...defaultConfig(), ...config },
      players: new Map(),
      // The room's scoreboard across its matches: how many were finished, and per player (even one who left) their
      // name, avatar, matches played and wins.
      board: { matches: 0, players: {} },
      // The playlist being made in the room's "Playlist" panel, and the one being played (null when none is).
      playlist: emptyPlaylist(),
      run: null,
      // The room's central device (a screen that only shows the match, see setCentral) and the players asking to
      // use another device of theirs as it (requestCentral).
      central: null,
      centralRequests: [],
    };
    this.rooms.set(code, room);
    this.ensureDefaultPlaylists(room);
    this.addPlayer(room, host, true);
    return room;
  }

  addPlayer(room, user, isHost = false) {
    if (room.blocked?.has(user.id)) throw new Error("El anfitrión te bloqueó de esta sala");
    assertNameWithoutLink(user);
    // Whoever was asking to join is in now.
    if (room.joinRequests?.length) room.joinRequests = room.joinRequests.filter((r) => r.userId !== user.id);
    const existing = room.players.get(user.id);
    const isGuest = Boolean(user.isGuest ?? (user.id?.startsWith("gst_") || !user.email));
    const player = existing || {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      isGuest,
      score: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      answerTimes: [],
      lastAnswer: null,
      lastPoints: 0,
    };
    // Rejoining from a new socket (reload, second tab): the old socket no longer speaks for this player.
    if (existing?.socketId && existing.socketId !== user.socketId) {
      this.socketToRoom.delete(existing.socketId);
    }
    clearTimeout(player.dropTimer);
    player.dropTimer = null;
    player.name = user.name;
    player.avatar = user.avatar;
    player.isGuest = isGuest;
    player.connected = true;
    player.socketId = user.socketId;
    // Someone who arrives while a match is running (not just its results) watches it; they play from the next one.
    // That includes a player who was in the room but not in this match (they were away when it started).
    if (room.phase !== "lobby" && room.phase !== "finished" && (existing ? room.participants && !room.participants.has(user.id) : true)) {
      player.spectator = true;
    }
    player.status = player.spectator ? "mirando" : room.phase === "lobby" ? "conectado" : "jugando";
    room.players.set(user.id, player);
    this.socketToRoom.set(user.socketId, { code: room.code, userId: user.id });
    return player;
  }

  // The connections (other than `exceptSocketId`) this account is seated with in any room right now, with the room's
  // code. A central device is no seat: it doesn't play.
  otherSeatSockets(userId, exceptSocketId) {
    const seats = [];
    for (const room of this.rooms.values()) {
      const p = room.players.get(userId);
      if (p?.connected && p.socketId && p.socketId !== exceptSocketId) seats.push({ socketId: p.socketId, code: room.code });
    }
    return seats;
  }

  // Explicit "leave room". The central device leaving only takes it off the room's screen.
  leave(socketId) {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return null;
    const room = this.get(ref.code);
    this.socketToRoom.delete(socketId);
    if (!room) return null;
    if (ref.central) {
      if (room.central?.socketId === socketId) {
        clearTimeout(room.central.dropTimer);
        room.central = null;
      }
      return { room };
    }
    return this.removePlayer(room, ref.userId);
  }

  // Lost connection: keep the seat for a grace period in case the player comes back. The central device keeps its
  // place the same way (a reload puts it back, see reattachCentral); meanwhile the players see the whole match again.
  disconnect(socketId) {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return null;
    this.socketToRoom.delete(socketId);
    const room = this.get(ref.code);
    if (!room) return null;
    if (ref.central) {
      const central = room.central;
      if (!central || central.socketId !== socketId) return { room };
      central.connected = false;
      central.socketId = null;
      clearTimeout(central.dropTimer);
      central.dropTimer = setTimeout(() => {
        central.dropTimer = null;
        if (room.central !== central || central.connected || this.rooms.get(room.code) !== room) return;
        room.central = null;
        this.onPhaseChange?.(room);
      }, this.reconnectGraceMs);
      central.dropTimer.unref?.();
      return { room };
    }
    const player = room.players.get(ref.userId);
    if (!player) return { room };
    player.connected = false;
    player.socketId = null;
    player.status = "desconectado";
    clearTimeout(player.dropTimer);
    player.dropTimer = setTimeout(() => {
      player.dropTimer = null;
      if (player.connected || this.rooms.get(room.code) !== room) return;
      const result = this.removePlayer(room, player.id);
      if (result.room) this.onPhaseChange?.(result.room);
    }, this.reconnectGraceMs);
    player.dropTimer.unref?.();
    // Campo de minas: the turn doesn't wait for a player who isn't there.
    this.checkMinesTurn(room);
    // A public room about to start isn't full any more.
    this.checkMatchFull(room);
    return { room };
  }

  removePlayer(room, userId) {
    const player = room.players.get(userId);
    if (!player) return { room, left: true };
    clearTimeout(player.dropTimer);
    player.dropTimer = null;
    if (room.phase === "lobby") {
      room.players.delete(userId);
      if (Array.isArray(room.coHosts)) {
        room.coHosts = room.coHosts.filter((id) => id !== userId);
      }
    } else {
      // Mid-match the player stays on the scoreboard as disconnected.
      player.connected = false;
      player.status = "desconectado";
      player.socketId = null;
    }
    if (room.hostId === userId) this.transferHost(room);
    if (!this.hasPeople(room)) {
      this.destroy(room);
      return { room: null, left: true };
    }
    this.checkMinesTurn(room);
    this.checkMatchFull(room);
    return { room, left: true };
  }

  transferHost(room) {
    const next = [...room.players.values()].find((p) => p.connected);
    room.hostId = next ? next.id : null;
    room.preview = null;
    room.suggestions = [];
    if (room.hostId && Array.isArray(room.coHosts)) {
      room.coHosts = room.coHosts.filter((id) => id !== room.hostId);
    }
  }

  destroy(room) {
    if (room.timer) clearTimeout(room.timer);
    clearTimeout(room.matchmaking?.timer);
    clearTimeout(room.matchmaking?.botTimer);
    this.clearBotMoves(room);
    clearTimeout(room.progressTimer);
    room.players.forEach((p) => {
      clearTimeout(p.dropTimer);
      if (p.socketId) this.socketToRoom.delete(p.socketId);
    });
    // The central device and whoever was waiting to be it hear that the room is gone.
    const central = room.central;
    room.central = null;
    if (central) {
      clearTimeout(central.dropTimer);
      if (central.socketId) {
        this.socketToRoom.delete(central.socketId);
        this.onRoleChange?.(central.socketId, { code: room.code, role: null, notice: "La sala se cerró" });
      }
    }
    for (const request of room.centralRequests || []) {
      this.onRoleChange?.(request.socketId, { code: room.code, role: null, notice: "La sala se cerró" });
    }
    room.centralRequests = [];
    this.rooms.delete(room.code);
  }

  canEditConfig(room, userId) {
    if (!room || !userId) return false;
    return room.hostId === userId || (Array.isArray(room.coHosts) && room.coHosts.includes(userId));
  }

  toggleConfigPermission(room, hostUserId, targetUserId) {
    if (!room) throw new Error("Sala no encontrada");
    if (room.hostId !== hostUserId) {
      throw new Error("Solo el Host puede otorgar privilegios");
    }
    if (hostUserId === targetUserId) {
      throw new Error("El Host ya cuenta con todos los privilegios");
    }
    if (!room.players.has(targetUserId)) {
      throw new Error("El jugador no está en la sala");
    }
    if (!Array.isArray(room.coHosts)) {
      room.coHosts = [];
    }
    const idx = room.coHosts.indexOf(targetUserId);
    let granted = false;
    if (idx >= 0) {
      room.coHosts.splice(idx, 1);
      granted = false;
    } else {
      room.coHosts.push(targetUserId);
      granted = true;
    }
    return { granted, coHosts: [...room.coHosts] };
  }

  // The host hands the room to another connected player, who becomes the host; the old host keeps the permission to
  // change the settings (a co-host). Like a host who leaves, it clears what the old host was pointing at on the game
  // menu and the suggestions sent to them.
  giveHost(room, hostUserId, targetUserId) {
    if (!room) throw new Error("Sala no encontrada");
    if (room.hostId !== hostUserId) throw new Error("Solo el anfitrión puede pasar el anfitrión");
    if (hostUserId === targetUserId) throw new Error("Ya eres el anfitrión");
    const player = room.players.get(targetUserId);
    if (!player) throw new Error("El jugador no está en la sala");
    if (!player.connected) throw new Error("Ese jugador no está conectado ahora");
    room.hostId = targetUserId;
    room.coHosts = [...(room.coHosts || []).filter((id) => id !== targetUserId && id !== hostUserId), hostUserId];
    room.preview = null;
    room.suggestions = [];
    return { name: player.name };
  }

  // The host takes a player out of the room: their seat goes (even mid-match). By default it isn't a ban: entering the
  // code again joins as a new player (a spectator if a match is running). With `block` they can't join this room again.
  kick(room, hostUserId, targetUserId, { block = false } = {}) {
    if (!room) throw new Error("Sala no encontrada");
    if (room.hostId !== hostUserId) throw new Error("Solo el anfitrión puede sacar jugadores");
    if (hostUserId === targetUserId) throw new Error("No puedes sacarte a ti mismo");
    const player = room.players.get(targetUserId);
    if (!player) throw new Error("El jugador no está en la sala");
    clearTimeout(player.dropTimer);
    if (player.socketId) this.socketToRoom.delete(player.socketId);
    room.players.delete(targetUserId);
    room.coHosts = (room.coHosts || []).filter((id) => id !== targetUserId);
    if (block) (room.blocked ||= new Set()).add(targetUserId);
    this.checkMinesTurn(room);
    return { socketId: player.socketId, name: player.name };
  }

  /*
   * The central device ("dispositivo central"): one connection of the room that only shows the match (the questions,
   * the songs, the board, the scoreboard) on a screen everyone sees, while the players answer from their phones,
   * which then show only the ways to answer. It is no player and can do nothing in the room: the host keeps every
   * control (sockets.js refuses any action from it). `room.central` is { userId, name, avatar, isGuest, socketId,
   * connected }; the account is whoever opened that device. It gets there three ways:
   *  - the host drags a player onto the "Dispositivo central" spot (makeCentral): that player's device stops playing;
   *  - the host opens the room on another device with their account (joinAsCentral);
   *  - another player does the same and the host accepts it (requestCentral, answerCentralRequest).
   * `onRoleChange(socketId, { code, role, notice })` tells a connection what it is in the room now: "central",
   * "player" (a central device that plays again) or null (out of the room).
   */

  /** Makes `device` (an account and its connection) the room's central device, in place of the one there was. */
  setCentral(room, device) {
    if (room.central) this.releaseCentral(room, { replaced: true });
    room.centralRequests = (room.centralRequests || []).filter((r) => r.socketId !== device.socketId);
    room.central = {
      userId: device.id,
      name: device.name,
      avatar: device.avatar,
      isGuest: Boolean(device.isGuest),
      socketId: device.socketId,
      connected: true,
      dropTimer: null,
    };
    this.socketToRoom.set(device.socketId, { code: room.code, userId: device.id, central: true });
    this.onRoleChange?.(device.socketId, { code: room.code, role: "central" });
    return room.central;
  }

  /**
   * The central device stops being it (taken off by the host, or another one took its place). A device that was a
   * player's (dragged onto the spot) plays again when its account has no other seat in the room; otherwise it leaves.
   */
  releaseCentral(room, { replaced = false } = {}) {
    const central = room.central;
    if (!central) return null;
    clearTimeout(central.dropTimer);
    room.central = null;
    if (!central.socketId) return null;
    const why = replaced ? "Otro dispositivo es ahora el central" : "Este dispositivo ya no es el central";
    if (!room.players.has(central.userId) && !room.blocked?.has(central.userId)) {
      this.addPlayer(room, { id: central.userId, name: central.name, avatar: central.avatar, isGuest: central.isGuest, socketId: central.socketId });
      this.onRoleChange?.(central.socketId, { code: room.code, role: "player", notice: `${why}: vuelves a jugar desde aquí` });
      return { socketId: central.socketId, role: "player" };
    }
    this.socketToRoom.delete(central.socketId);
    this.onRoleChange?.(central.socketId, { code: room.code, role: null, notice: `${why} de la sala` });
    return { socketId: central.socketId, role: null };
  }

  /**
   * Makes a player's screen the room's central device: from the player's menu or dragging them onto the spot, by the
   * host or a player with the settings permission, while the room waits; any player, the one doing it too. That
   * player's seat goes (the device only shows the match). If it's the host's, the host role passes to the next
   * connected player first (the central device controls nothing), so there must be one.
   */
  makeCentral(room, actorId, targetUserId) {
    if (!this.canEditConfig(room, actorId)) throw new Error("Solo el anfitrión o quien tenga permiso elige el dispositivo central");
    if (room.phase !== "lobby") throw new Error("Cambia el dispositivo central antes de empezar la partida");
    const player = room.players.get(targetUserId);
    if (!player) throw new Error("El jugador no está en la sala");
    if (!player.connected || !player.socketId) throw new Error("Ese jugador no está conectado ahora");
    if (targetUserId === room.hostId) {
      const next = [...room.players.values()].find((p) => p.connected && p.id !== targetUserId);
      if (!next) throw new Error("Hace falta otro jugador en la sala para que lleve la partida");
    }
    clearTimeout(player.dropTimer);
    room.players.delete(targetUserId);
    room.coHosts = (room.coHosts || []).filter((id) => id !== targetUserId);
    room.suggestions = (room.suggestions || []).filter((s) => s.userId !== targetUserId);
    if (targetUserId === room.hostId) this.transferHost(room);
    this.setCentral(room, { ...player, socketId: player.socketId });
    return { name: player.name };
  }

  /** The host's account, from another device than the one they play on: it becomes the central device straight away. */
  joinAsCentral(room, user) {
    if (room.blocked?.has(user.id)) throw new Error("El anfitrión te bloqueó de esta sala");
    if (room.hostId !== user.id) throw new Error("Pídele al anfitrión que acepte este dispositivo como central");
    if (room.central?.socketId === user.socketId) return room.central;
    return this.setCentral(room, user);
  }

  /**
   * A player (not the host), from another device than the one they play on, asks to make it the central device: the
   * host sees the request and accepts or turns it down (answerCentralRequest). One request per account (a new one
   * replaces it), one every CENTRAL_ASK_GAP_MS.
   */
  requestCentral(room, user) {
    if (room.blocked?.has(user.id)) throw new Error("El anfitrión te bloqueó de esta sala");
    if (room.hostId === user.id) throw new Error("Eres el anfitrión: puedes entrar directamente como dispositivo central");
    const player = room.players.get(user.id);
    if (!player) throw new Error("Entra primero a la sala como jugador");
    if (room.central?.socketId === user.socketId) throw new Error("Este dispositivo ya es el central");
    const wait = (player.centralAskedAt || 0) + CENTRAL_ASK_GAP_MS - Date.now();
    if (wait > 0) throw new Error(`Espera ${Math.ceil(wait / 1000)} s para pedirlo otra vez`);
    player.centralAskedAt = Date.now();
    const requests = room.centralRequests || [];
    for (const old of requests) {
      if (old.userId === user.id && old.socketId !== user.socketId) {
        this.onRoleChange?.(old.socketId, { code: room.code, role: null, notice: "Lo pediste desde otro dispositivo" });
      }
    }
    room.centralSeq = (room.centralSeq || 0) + 1;
    const request = {
      id: room.centralSeq,
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
      isGuest: Boolean(user.isGuest),
      socketId: user.socketId,
      at: Date.now(),
    };
    room.centralRequests = [...requests.filter((r) => r.userId !== user.id && r.socketId !== user.socketId), request].slice(
      -CENTRAL_REQUESTS_KEEP
    );
    return request;
  }

  /** The host's answer to a request: accepted, that device is the central one; turned down, it hears so. */
  answerCentralRequest(room, hostUserId, requestId, accept) {
    if (room.hostId !== hostUserId) throw new Error("Solo el anfitrión elige el dispositivo central");
    const request = (room.centralRequests || []).find((r) => r.id === Number(requestId));
    if (!request) throw new Error("Esa solicitud ya no está");
    room.centralRequests = room.centralRequests.filter((r) => r !== request);
    if (!accept) {
      const host = room.players.get(room.hostId)?.name || "El anfitrión";
      this.onRoleChange?.(request.socketId, { code: room.code, role: null, notice: `${host} no aceptó este dispositivo como central` });
      return { accepted: false, name: request.name };
    }
    this.setCentral(room, { ...request, id: request.userId });
    return { accepted: true, name: request.name };
  }

  /** The requests made from this connection go (it closed, or gave up waiting). Returns the rooms that changed. */
  dropCentralRequests(socketId) {
    const changed = [];
    for (const room of this.rooms.values()) {
      const requests = room.centralRequests || [];
      if (!requests.some((r) => r.socketId === socketId)) continue;
      room.centralRequests = requests.filter((r) => r.socketId !== socketId);
      changed.push(room);
    }
    return changed;
  }

  /** The host's "Quitar" on the spot. */
  removeCentral(room, actorId) {
    if (!this.canEditConfig(room, actorId)) throw new Error("Solo el anfitrión o quien tenga permiso elige el dispositivo central");
    if (!room.central) throw new Error("La sala no tiene dispositivo central");
    return this.releaseCentral(room);
  }

  /**
   * The central device coming back after a reload or a dropped connection, with the same account: it takes its place
   * again (a second tab of it takes it over from the first). False when the room's central device isn't this account's.
   */
  reattachCentral(room, user) {
    const central = room.central;
    if (!central || central.userId !== user.id) return false;
    if (central.socketId && central.socketId !== user.socketId) {
      this.socketToRoom.delete(central.socketId);
      this.onRoleChange?.(central.socketId, { code: room.code, role: null, notice: "El dispositivo central se abrió en otra pestaña" });
    }
    clearTimeout(central.dropTimer);
    central.dropTimer = null;
    central.socketId = user.socketId;
    central.connected = true;
    central.name = user.name || central.name;
    central.avatar = user.avatar || central.avatar;
    this.socketToRoom.set(user.socketId, { code: room.code, userId: user.id, central: true });
    return true;
  }

  updateConfig(room, userId, config) {
    if (!this.canEditConfig(room, userId)) {
      throw new Error("No tienes permisos para configurar la partida");
    }
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
    const next = { ...room.config, ...config };
    if (config?.quiz) next.quiz = mergeQuizConfig(room.config.quiz, config.quiz);
    if (config?.geo) next.geo = mergeGeoConfig(room.config.geo, config.geo);
    if (config?.history) next.history = mergeHistoryConfig(room.config.history, config.history);
    if (config?.mines) next.mines = mergeMinesConfig(room.config.mines, config.mines);
    // Same limits as the settings on screen: 5–25 rounds, 15–35 seconds to guess.
    if (config?.rounds != null) next.rounds = clampTo(config.rounds, MUSIC_LIMITS.rounds, 5);
    if (config?.roundMs != null) next.roundMs = clampTo(config.roundMs, MUSIC_LIMITS.roundMs, ROUND_MS);
    // Adivina la canción's ways of answering; both may be unticked (the match then can't start).
    if (Array.isArray(config?.formats)) next.formats = MUSIC_FORMATS.filter((f) => config.formats.includes(f));
    // The catalog on or off (off: only the ticked Spotify playlists play). Missing in an older room means on.
    if (config?.useCatalog != null) next.useCatalog = config.useCatalog !== false;
    // The catalog's filters; any list may be left empty (only the Spotify playlists then play, if any).
    if (Array.isArray(config?.languages)) next.languages = SONG_LANGUAGES.filter((v) => config.languages.includes(v));
    if (Array.isArray(config?.genres)) next.genres = SONG_GENRES.filter((v) => config.genres.includes(v));
    if (Array.isArray(config?.difficulties)) next.difficulties = SONG_DIFFICULTIES.filter((v) => config.difficulties.includes(v));
    if (config?.playlistIds) {
      // Spotify playlists can only be added by addSpotifyPlaylist; here they can only stay or go. (An older client's
      // catalog playlists are dropped: the catalog is chosen with the filters now.)
      const known = new Set(Object.keys(room.customPlaylists || {}));
      next.playlistIds = [...new Set(config.playlistIds)].filter((id) => known.has(id));
    }
    room.config = next;
    this.syncPlaylists(room);
  }

  /** The room's Spotify playlists that play: the ticked ones. */
  activePlaylists(room) {
    return (room.config.playlistIds || []).map((id) => room.customPlaylists?.[id]).filter(Boolean);
  }

  // Only the playlists that play keep loading; one that starts playing again picks up where it stopped.
  syncPlaylists(room) {
    const active = new Set(this.activePlaylists(room));
    for (const entry of Object.values(room.customPlaylists || {})) {
      const wasActive = entry.active;
      entry.active = active.has(entry);
      if (entry.active && !wasActive) this.loadPlaylist(room, entry);
    }
  }

  /**
   * The settings of a playlist's game, valid whatever was sent (an edit, or an imported JSON): each game's own merge
   * from its defaults. Adivina la canción's are its rounds, seconds, ways of answering, the catalog and its filters
   * (languages, genres, difficulties) and the room's Spotify playlists; ids the room doesn't know are dropped (a JSON
   * from somewhere else plays the catalog with its filters).
   */
  cleanItemConfig(room, game, change = {}) {
    if (game === QUIZ_GAME) return mergeQuizConfig(undefined, change);
    if (game === GEO_GAME) return mergeGeoConfig(undefined, change);
    if (game === HISTORY_GAME) return mergeHistoryConfig(undefined, change);
    if (game === MINES_GAME) return mergeMinesConfig(undefined, change);
    const base = defaultConfig();
    const known = new Set(Object.keys(room.customPlaylists || {}));
    const pick = (list, all, fallback) => (Array.isArray(list) ? all.filter((v) => list.includes(v)) : fallback);
    return {
      rounds: change.rounds != null ? clampTo(change.rounds, MUSIC_LIMITS.rounds, base.rounds) : base.rounds,
      roundMs: change.roundMs != null ? clampTo(change.roundMs, MUSIC_LIMITS.roundMs, base.roundMs) : base.roundMs,
      formats: pick(change.formats, MUSIC_FORMATS, base.formats),
      useCatalog: change.useCatalog != null ? change.useCatalog !== false : base.useCatalog,
      languages: pick(change.languages, SONG_LANGUAGES, base.languages),
      genres: pick(change.genres, SONG_GENRES, base.genres),
      difficulties: pick(change.difficulties, SONG_DIFFICULTIES, base.difficulties),
      playlistIds: Array.isArray(change.playlistIds) ? [...new Set(change.playlistIds)].filter((id) => known.has(id)) : [],
    };
  }

  /**
   * The room's playlist changes (its name, order, games or one game's settings; or a whole one loaded or imported):
   * the client sends all of it and it's kept cleaned (cleanPlaylist). Like the settings, the host and whoever has the
   * permission can change it, while the room waits.
   */
  /** A playlist sent to be shared by code (one saved in "Mis playlists"), cleaned like the room's own. */
  cleanSharedPlaylist(room, playlist) {
    return cleanPlaylist(playlist, (game, config) => this.cleanItemConfig(room, game, config));
  }

  updatePlaylist(room, userId, playlist) {
    if (!this.canEditConfig(room, userId)) throw new Error("No tienes permisos para cambiar la playlist");
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
    room.playlist = cleanPlaylist(playlist, (game, config) => this.cleanItemConfig(room, game, config));
    return room.playlist;
  }

  /**
   * Why a game of the playlist can't be played with its settings (a Spanish sentence), or null when it can: a list
   * left empty, or fewer questions, boards or songs than rounds. `exact` draws them as a match would (some can't be
   * asked together: the same question twice, two events of the same year...), to check before the playlist starts;
   * otherwise only counts them, cheap enough for every update of the room. `base` is the room's own settings.
   */
  itemProblem(room, item, base = room.config, { exact = false } = {}) {
    const config = item.config;
    const short = (n, what, rounds, more) =>
      `Solo hay ${n} ${what} con esos ajustes para ${rounds} rondas. Baja las rondas o elige más ${more}.`;
    if (item.game === QUIZ_GAME) {
      const quiz = mergeQuizConfig(config);
      if (!quiz.categories.length) return "Elige al menos una categoría.";
      if (!quiz.formats.length) return "Elige al menos un modo de juego.";
      if (!quiz.difficulties.length) return "Elige al menos una dificultad.";
      const n = exact ? pickQuizQuestions(this.quizQuestions, quiz).length : this.cachedCount(item, () => countQuestions(this.quizQuestions, quiz));
      return n < quiz.rounds ? short(n, "preguntas", quiz.rounds, "categorías") : null;
    }
    if (item.game === GEO_GAME) {
      const geo = mergeGeoConfig(config);
      if (!geo.difficulties.length) return "Elige al menos una dificultad.";
      const n = exact ? pickGeoQuestions(this.geoQuestions, geo).length : this.cachedCount(item, () => countGeoQuestions(this.geoQuestions, geo));
      return n < geo.rounds ? short(n, "países", geo.rounds, "dificultades") : null;
    }
    if (item.game === HISTORY_GAME) {
      const history = mergeHistoryConfig(config);
      if (!history.styles.length) return "Elige al menos un modo de juego.";
      if (!history.categories.length) return "Elige al menos una categoría.";
      if (!history.difficulties.length) return "Elige al menos una dificultad.";
      const n = exact
        ? pickHistoryQuestions(this.historyQuestions, history).length
        : this.cachedCount(item, () => countHistoryQuestions(this.historyQuestions, history));
      return n < history.rounds ? short(n, "preguntas", history.rounds, "categorías") : null;
    }
    if (item.game === MINES_GAME) {
      const mines = mergeMinesConfig(config);
      if (!mines.styles.length) return "Elige al menos un modo de juego.";
      if (!mines.categories.length) return "Elige al menos una categoría.";
      if (!mines.difficulties.length) return "Elige al menos una dificultad.";
      const n = exact ? pickMinesQuestions(this.minesQuestions, mines).length : this.cachedCount(item, () => countMinesQuestions(this.minesQuestions, mines));
      return n < mines.rounds ? short(n, "tableros", mines.rounds, "categorías o dificultades") : null;
    }
    // Adivina la canción: a different song for every round, from the catalog with its filters and its Spotify
    // playlists (whose songs may still be loading).
    if (!config.formats?.length) return "Elige al menos un tipo de respuesta.";
    if (config.useCatalog === false && !config.playlistIds?.length) return "Activa el catálogo o elige una playlist.";
    const n = this.songPool({ ...room, config: configWithItem(base, item) }).length;
    return n < config.rounds ? short(n, "canciones", config.rounds, "idiomas, géneros o dificultades") : null;
  }

  /** The question banks don't change while the server runs: what some settings can draw is counted once. */
  cachedCount(item, count, what = "count") {
    this.countCache ||= new Map();
    const key = `${what}|${item.game}|${JSON.stringify(item.config)}`;
    if (!this.countCache.has(key)) {
      if (this.countCache.size > 500) this.countCache.clear();
      this.countCache.set(key, count());
    }
    return this.countCache.get(key);
  }

  /**
   * In the playlist's panel: for each game, why it can't be played yet (null when it can) and its chips' counts; for
   * Adivina la canción, also how many songs its settings have ready.
   */
  playlistStatus(room) {
    const status = {};
    for (const item of room.playlist?.items || []) {
      let counts;
      let songsReady;
      if (item.game === QUIZ_GAME) counts = this.cachedCount(item, () => questionCounts(this.quizQuestions, item.config), "chips");
      else if (item.game === HISTORY_GAME) counts = this.cachedCount(item, () => historyCounts(this.historyQuestions, item.config), "chips");
      else if (item.game === MINES_GAME) counts = this.cachedCount(item, () => minesCounts(this.minesQuestions, item.config), "chips");
      else if (item.game === "musica") {
        counts = this.cachedCount(item, () => songCounts(this.catalog, item.config), "chips");
        songsReady = this.songPool({ ...room, config: configWithItem(room.config, item) }).length;
      }
      status[item.id] = { problem: this.itemProblem(room, item), counts, songsReady };
    }
    return status;
  }

  /**
   * Adding Spotify playlists: an owner with Spotify connected who may change the room's settings (the host, or a
   * player the host gave permission to). Their own Spotify is the one read.
   */
  assertSpotifyEditor(room, userId) {
    this.assertPlaylistEditor(room, userId);
    const user = this.store?.users?.[userId];
    if (!user || !hasRole(user, "owner")) throw new Error("Las playlists de Spotify son solo para owners");
    if (!user.spotify) throw new Error("Conecta tu Spotify en tu perfil primero");
  }

  /** Pasting a public playlist's link (catalog/spotifyEmbed.js): anyone who may change the room's settings. */
  assertPlaylistEditor(room, userId) {
    if (!this.canEditConfig(room, userId)) throw new Error("Necesitas permiso del host para cambiar las playlists");
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
  }

  /**
   * Adds (and selects) one of the host's Spotify playlists, read by catalog/spotifyLibrary.js. Its songs are looked
   * up on iTunes in the background; the match can start as soon as any song of the selection is playable.
   */
  // A song of a playlist read from Spotify's public page, with its own preview (15–22 s): playable at once. iTunes is
  // still asked in the background, and what it finds (a 30 s preview, the album's cover and year) replaces it.
  linkSong(t, playlist) {
    return {
      id: `sp-${t.spotifyId}`,
      spotifyId: t.spotifyId,
      title: displayTitle(t.title),
      artistName: t.artists.join(" & ") || "Artista",
      artists: t.artists,
      albumName: t.albumName || "",
      year: t.year || null,
      image: playlist.image || null,
      previewUrl: t.previewUrl,
    };
  }

  // A room's entry for a playlist read from Spotify's public page (not ticked: whoever adds it decides).
  newLinkEntry(room, playlist) {
    const id = `${SPOTIFY_PREFIX}${playlist.id}`;
    const entry = { id, name: playlist.name, image: playlist.image, tracks: playlist.tracks, songs: new Map(), done: new Set(), active: false };
    for (const t of playlist.tracks) if (t.previewUrl) entry.songs.set(t.spotifyId, this.linkSong(t, playlist));
    entry.instant = entry.songs.size > 0;
    room.customPlaylists[id] = entry;
    return entry;
  }

  // The same playlist read again: its songs become Spotify's current ones. Songs no longer in it go; new ones come
  // with their own preview and are looked up on iTunes like the rest.
  refreshLinkEntry(entry, playlist) {
    const now = new Set(playlist.tracks.map((t) => t.spotifyId));
    for (const key of [...entry.songs.keys()]) if (!now.has(key)) entry.songs.delete(key);
    for (const key of [...entry.done]) if (!now.has(key)) entry.done.delete(key);
    entry.retried?.forEach((key) => !now.has(key) && entry.retried.delete(key));
    entry.tracks = playlist.tracks;
    entry.name = playlist.name || entry.name;
    entry.image = playlist.image || entry.image;
    for (const t of playlist.tracks) {
      if (t.previewUrl && !entry.songs.has(t.spotifyId)) entry.songs.set(t.spotifyId, this.linkSong(t, playlist));
    }
  }

  /**
   * Puts the default playlists (read once a day, catalog/defaultPlaylists.js) in a room, unticked, so they are always
   * loaded there and ticking one is instant. A room that has one from an earlier day gets today's songs, while it
   * waits in the lobby (never in the middle of a match).
   */
  ensureDefaultPlaylists(room) {
    if (!room?.customPlaylists) return;
    for (const { playlist, day } of cachedDefaultPlaylists()) {
      const id = `${SPOTIFY_PREFIX}${playlist.id}`;
      const entry = room.customPlaylists[id];
      if (!entry) this.newLinkEntry(room, playlist).day = day;
      else if (entry.day !== day && room.phase === "lobby") {
        this.refreshLinkEntry(entry, playlist);
        entry.day = day;
        if (entry.active) this.loadPlaylist(room, entry);
      }
    }
  }

  /** Every room gets the default playlists just read (catalog/defaultPlaylists.js calls it). */
  applyDefaultPlaylists() {
    for (const room of this.rooms.values()) this.ensureDefaultPlaylists(room);
  }

  addSpotifyPlaylist(room, userId, playlist, { fromLink = false } = {}) {
    if (fromLink) this.assertPlaylistEditor(room, userId);
    else this.assertSpotifyEditor(room, userId);
    const id = `${SPOTIFY_PREFIX}${playlist.id}`;
    let entry = room.customPlaylists[id];
    // Read again (a pasted playlist added once more): its songs become Spotify's current ones.
    if (entry && fromLink) this.refreshLinkEntry(entry, playlist);
    if (!entry && fromLink) entry = this.newLinkEntry(room, playlist);
    if (!entry) {
      entry = { id, name: playlist.name, image: playlist.image, tracks: playlist.tracks, songs: new Map(), done: new Set(), active: true };
      room.customPlaylists[id] = entry;
    }
    // Adding one ticks it.
    const ids = room.config.playlistIds || [];
    if (!ids.includes(id)) room.config = { ...room.config, playlistIds: [...ids, id] };
    entry.active = true;
    this.loadPlaylist(room, entry);
    return entry;
  }

  /** Takes a Spotify playlist out of the room for good (its waiting searches stop); anyone who may change the settings. */
  removeSpotifyPlaylist(room, userId, playlistId) {
    this.assertPlaylistEditor(room, userId);
    if (isDefaultSpotify(playlistId)) throw new Error("Esta playlist viene con el juego: no se puede borrar");
    const entry = room.customPlaylists?.[playlistId];
    if (!entry) throw new Error("Esa playlist no está en la sala");
    entry.active = false;
    delete room.customPlaylists[playlistId];
    room.config = { ...room.config, playlistIds: (room.config.playlistIds || []).filter((id) => id !== playlistId) };
  }

  /**
   * Looks up the songs of a selected Spotify playlist that aren't known yet. Only selected playlists load: when one
   * is unselected its waiting searches are dropped (isCancelled), and selecting it again picks up where it stopped.
   * Each call starts a new run, so a playlist never has its searches queued twice.
   */
  loadPlaylist(room, entry) {
    if (!this.resolver) return;
    entry.retried ||= new Set();
    // First every song once; when that is done, a second deeper search for the ones not found.
    let pending = entry.tracks.filter((t) => !entry.done.has(t.spotifyId));
    const deep = !pending.length;
    if (deep) pending = this.missingSongs(entry);
    if (!pending.length) return;
    const run = (entry.run || 0) + 1;
    entry.run = run;
    this.resolver
      .resolve(pending, {
        deep,
        onResult: (spotifyId, song) => {
          entry.done.add(spotifyId);
          if (deep) entry.retried.add(spotifyId);
          // A pasted playlist's song was already playable with Spotify's preview (15–22 s); iTunes' (30 s, with the
          // album's cover and year) takes its place once found.
          if (song) entry.songs.set(spotifyId, { ...song, artists: entry.tracks.find((t) => t.spotifyId === spotifyId)?.artists || song.artists });
          this.progressChanged(room);
          // The first pass just finished: start the second one.
          if (!deep && entry.run === run && entry.done.size === entry.tracks.length) this.loadPlaylist(room, entry);
        },
        isCancelled: () => !entry.active || entry.run !== run || this.rooms.get(room.code) !== room,
      })
      .catch((err) => console.warn(`[Spotify] ${err.message}`));
  }

  /** Songs of the playlist searched once without luck and not yet searched again. */
  missingSongs(entry) {
    return entry.tracks.filter((t) => entry.done.has(t.spotifyId) && !entry.songs.has(t.spotifyId) && !entry.retried?.has(t.spotifyId));
  }

  // Loading progress reaches the players at most every 1.5 s.
  progressChanged(room) {
    if (room.progressTimer) return;
    room.progressTimer = setTimeout(() => {
      room.progressTimer = null;
      if (this.rooms.get(room.code) === room) this.onPhaseChange?.(room);
    }, 1500);
    room.progressTimer.unref?.();
  }

  /**
   * Every song the match can draw from right now: the catalog's songs that pass the filters plus the playable songs
   * of the Spotify playlists that play (those have no filters).
   */
  songPool(room) {
    const pool = room.config.useCatalog === false ? [] : filterSongs(this.catalog, room.config);
    const seen = new Set(pool.map((s) => s.id));
    for (const entry of this.activePlaylists(room)) {
      for (const song of entry.songs.values()) {
        if (!seen.has(song.id)) {
          seen.add(song.id);
          pool.push(song);
        }
      }
    }
    return pool;
  }

  // Chooses the songs of the coming rounds that haven't been chosen yet; songs already played are avoided while
  // there are others. Spotify songs found meanwhile join the draw.
  pickAhead(room) {
    if (QUESTION_GAMES.includes(room.game) || room.config?.customTracks?.length) return [];
    const until = Math.min(room.totalRounds, room.currentRound + 1 + LOOKAHEAD);
    const added = [];
    while (room.tracks.length < until) {
      const pool = this.songPool(room);
      if (!pool.length) break;
      const used = new Set(room.tracks.map((t) => t.id));
      const fresh = pool.filter((s) => !used.has(s.id));
      // A later round waits for new songs (Spotify ones may still arrive); only the round about to start repeats one.
      if (!fresh.length && room.tracks.length > room.currentRound) break;
      const from = fresh.length ? fresh : pool.filter((s) => s.id !== room.tracks[room.tracks.length - 1]?.id);
      const list = from.length ? from : pool;
      const song = list[Math.floor(Math.random() * list.length)];
      const track = this.withFormat(room, song, pool);
      room.tracks.push(track);
      added.push(track);
    }
    if (added.length) this.onNewTracks?.(added);
    return added;
  }

  /** Adivina la canción's ways of answering in this room (older rooms without the setting play both). */
  musicFormats(room) {
    return Array.isArray(room.config.formats) ? room.config.formats : MUSIC_FORMATS;
  }

  /**
   * A song as a round of Adivina la canción, with its way of answering: the less used of the ticked ones so far (a tie
   * drawn at random), so the rounds are shared evenly. A closed round ("choice") gets four songs to choose from, the
   * right one and three others (other titles), shuffled; `answer` is the right one's position. The others are by the
   * same main artist when there are enough (a Bad Bunny song among three more of Bad Bunny's, his duets included),
   * then by the song's other artists, looked for in the songs being played, then the catalog and the songs found for
   * Spotify playlists; any song fills what is left.
   * These copies stay on the server: the options only go out while the round is playing (see publicState).
   */
  withFormat(room, song, pool) {
    const formats = this.musicFormats(room);
    if (!formats.includes("opciones")) return { ...song, type: "open" };
    const used = (f) => room.tracks.filter((t) => (t.type === "choice" ? "opciones" : "escribir") === f).length;
    const least = Math.min(...formats.map(used));
    const candidates = formats.filter((f) => used(f) === least);
    const format = candidates[Math.floor(Math.random() * candidates.length)];
    if (format !== "opciones") return { ...song, type: "open" };
    const label = (s) => (artistLine(s) ? `${s.title} - ${artistLine(s)}` : s.title);
    const keys = new Set([songKey(song)]);
    const others = [];
    const sources = [pool, this.catalog.songs || [], this.globalSongList()];
    const add = (accept) => {
      for (const from of sources) {
        const shuffled = [...from].sort(() => Math.random() - 0.5);
        for (const s of shuffled) {
          if (others.length >= 3) return;
          if (!s?.title || keys.has(songKey(s)) || !accept(s)) continue;
          keys.add(songKey(s));
          others.push(s);
        }
      }
    };
    // Songs where the main artist is, then any of the song's other artists, then any song (the room's songs before
    // the whole catalog).
    const [main, ...rest] = artistKeys(song);
    if (main) add((s) => artistKeys(s).includes(main));
    if (rest.length) add((s) => artistKeys(s).some((a) => rest.includes(a)));
    add(() => true);
    if (others.length < 3) return { ...song, type: "open" };
    const options = [song, ...others].sort(() => Math.random() - 0.5);
    // `options` is the text of each (what a pick is recorded as); `details` the same split, to show the title big and
    // every artist under it.
    return {
      ...song,
      type: "choice",
      options: options.map(label),
      details: options.map((s) => ({ title: s.title, artists: artistLine(s) })),
      answer: options.indexOf(song),
    };
  }

  updatePlayer(room, userId, { name, avatar }) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    if (name && name.trim()) {
      if (hasLink(name)) throw new Error(NAME_LINK_ERROR);
      player.name = name.trim();
    }
    if (avatar) player.avatar = avatar;
    return player;
  }

  setReady(room, userId, ready) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    if (room.phase !== "lobby") return;
    player.status = ready ? "listo" : "conectado";
  }


  start(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede iniciar");
    if (!room.game) throw new Error("Elige un juego antes de empezar");
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (connected.length < 1) {
      throw new Error("Se necesita al menos 1 jugador");
    }
    if (room.game === PLAYLIST_GAME) {
      this.startPlaylist(room);
      return;
    }
    // Who is in this match: anyone else who shows up while it runs only watches it.
    room.participants = new Set(connected.map((p) => p.id));
    room.currentRound = 0;
    if (room.game === QUIZ_GAME) {
      const quiz = mergeQuizConfig(room.config.quiz);
      const available = countQuestions(this.quizQuestions, quiz);
      if (available < quiz.rounds) {
        throw new Error(`Solo hay ${available} preguntas con esos ajustes. Baja el número de preguntas o elige más temas.`);
      }
      const tracks = pickQuizQuestions(this.quizQuestions, quiz);
      if (tracks.length < quiz.rounds) {
        throw new Error(`Solo hay ${tracks.length} preguntas distintas con esos ajustes. Baja el número de preguntas o elige más temas.`);
      }
      // Flags are shown through a token, so the image's address doesn't name the country.
      for (const t of tracks) if (t.flag) t.flagToken = flagToken(t.flag);
      room.tracks = tracks;
      room.totalRounds = tracks.length;
    } else if (room.game === GEO_GAME) {
      // Encuentra el país: the match's countries are drawn now (they are the "tracks" of the room).
      const geo = mergeGeoConfig(room.config.geo);
      if (!geo.difficulties.length) throw new Error("Elige al menos una dificultad");
      const tracks = pickGeoQuestions(this.geoQuestions, geo);
      if (tracks.length < geo.rounds) {
        throw new Error(`Solo hay ${tracks.length} preguntas con esos ajustes para ${geo.rounds} rondas. Baja las rondas o elige más dificultades.`);
      }
      room.tracks = tracks;
      room.totalRounds = tracks.length;
      room.tiebreak = null;
    } else if (room.game === HISTORY_GAME) {
      // Rango: the match's questions are drawn now, each with its own range (of years, or of the figure's bar).
      const history = mergeHistoryConfig(room.config.history);
      if (!history.styles.length) throw new Error("Elige al menos un modo de juego");
      const tracks = pickHistoryQuestions(this.historyQuestions, history);
      if (tracks.length < history.rounds) {
        throw new Error(`Solo hay ${tracks.length} preguntas con esos ajustes para ${history.rounds} rondas. Baja las rondas o elige más categorías.`);
      }
      room.tracks = tracks;
      room.totalRounds = tracks.length;
      room.tiebreak = null;
    } else if (room.game === MINES_GAME) {
      // Campo de minas: the match's boards are drawn now, each with its cells shuffled.
      const mines = mergeMinesConfig(room.config.mines);
      if (!mines.styles.length) throw new Error("Elige al menos un modo de juego");
      if (!mines.categories.length) throw new Error("Elige al menos una categoría");
      if (!mines.difficulties.length) throw new Error("Elige al menos una dificultad");
      const tracks = pickMinesQuestions(this.minesQuestions, mines);
      if (tracks.length < mines.rounds) {
        throw new Error(`Solo hay ${tracks.length} tableros con esos ajustes para ${mines.rounds} rondas. Baja las rondas o elige más categorías o dificultades.`);
      }
      room.tracks = tracks;
      room.totalRounds = tracks.length;
      room.tiebreak = null;
    } else if (room.config?.customTracks && room.config.customTracks.length > 0) {
      const shuffled = [...room.config.customTracks].sort(() => Math.random() - 0.5);
      room.tracks = shuffled.slice(0, Math.min(room.config.rounds || 5, shuffled.length));
      room.totalRounds = room.tracks.length;
    } else {
      room.tracks = [];
      room.totalRounds = room.config.rounds || 5;
      const available = this.songPool(room).length;
      const loading = this.activePlaylists(room).some((entry) => entry.done.size < entry.tracks.length);
      if (!available) {
        if (loading) throw new Error("Tus canciones de Spotify se están cargando, espera unos segundos");
        throw new Error(
          room.config.useCatalog === false && !this.activePlaylists(room).length
            ? "Activa el catálogo o elige una playlist"
            : "Ninguna canción cumple esos filtros"
        );
      }
      // Every round gets a different song: with fewer songs than rounds the same ones would keep coming back.
      if (!this.musicFormats(room).length) throw new Error("Elige al menos un tipo de respuesta");
      if (available < room.totalRounds) {
        throw new Error(
          `Solo hay ${available} ${available === 1 ? "canción lista" : "canciones listas"} para ${room.totalRounds} rondas. ` +
            (loading ? "Espera a que carguen más o baja las rondas." : "Baja las rondas o marca más idiomas, géneros o dificultades.")
        );
      }
    }
    connected.forEach((p) => {
      p.score = 0;
      p.correct = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.answerTimes = [];
      p.rounds = [];
      p.idleRounds = 0;
      p.idle = false;
      p.status = "jugando";
    });
    this.beginCountdown(room);
  }

  /**
   * Every song in the database, for the game's search box: the whole catalog (all playlists, not only the chosen
   * ones) plus every Spotify song already found on iTunes. Players download it once (GET /api/songs), not with
   * every room update. Rebuilt only when the number of songs changes.
   */
  globalSongList() {
    const found = this.resolver?.known ? [...this.resolver.known.values()].filter(Boolean) : [];
    const key = `${this.catalog.songs.length}|${found.length}`;
    if (this.songListCache?.key !== key) {
      const seen = new Set();
      const list = [];
      for (const s of [...this.catalog.songs, ...found]) {
        if (!s?.id || !s.title || seen.has(s.id) || seen.has(songKey(s))) continue;
        seen.add(s.id);
        seen.add(songKey(s));
        list.push({ id: s.id, title: s.title, artistName: s.artistName || "Artista", artists: artistLine(s) || "Artista" });
      }
      this.songListCache = { key, list };
    }
    return this.songListCache.list;
  }

  /**
   * What the room adds to the search box on top of globalSongList: custom tracks and the songs of its Spotify
   * playlists not found on iTunes yet. Sent with the room during a round (small), so the list stays complete.
   */
  roomSearchExtras(room) {
    const global = new Set(this.globalSongList().flatMap((s) => [s.id, songKey(s)]));
    const allSongs = [];
    const seen = new Set();

    // Add custom tracks (from playlists etc)
    const customPool = room?.config?.customTracks || [];
    for (const s of customPool) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      allSongs.push({
        id: s.id,
        title: s.title,
        artistName: s.artistName || "Artista",
      });
    }

    // Every song of the Spotify playlists that play, found on iTunes yet or not.
    for (const entry of room ? this.activePlaylists(room) : []) {
      for (const t of entry.tracks) {
        const song = entry.songs.get(t.spotifyId);
        const id = song?.id || `sp-${t.spotifyId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        allSongs.push({
          id,
          title: song?.title || cleanTitle(t.title),
          artistName: song?.artistName || t.artists.join(" & ") || "Artista",
          artists: joinArtists(t.artists) || artistLine(song) || "Artista",
        });
      }
    }

    return allSongs.filter((s) => {
      const key = songKey(s);
      if (global.has(s.id) || global.has(key)) return false;
      global.add(key);
      return true;
    });
  }

  /** The whole search list as the server sees it (to name a picked suggestion): every song plus the room's extras. */
  buildSearchCatalog(room) {
    return [...this.globalSongList(), ...this.roomSearchExtras(room), ...(room?.tracks || [])];
  }

  beginCountdown(room) {
    if (room.run?.mixed && !room.run.finished) {
      this.enterMixedRound(room);
      // A public match: before each of its games, the roulette that picks it and the game's tutorial ("intro").
      if (room.matchmaking && room.introFor !== room.run.current) {
        room.introFor = room.run.current;
        room.players.forEach((p) => {
          p.lastAnswer = null;
          p.lastPoints = 0;
          p.minefield = null;
        });
        this.setPhase(room, "intro", INTRO_MS, () => this.beginCountdown(room));
        return;
      }
    }
    this.pickAhead(room);
    const track = room.tracks[room.currentRound];
    room.currentTrackId = track.id;
    room.answers = {};
    room.turn = 0;
    room.players.forEach((p) => {
      p.lastAnswer = null;
      p.lastPoints = 0;
      p.pin = null;
      p.guess = null;
      // Campo de minas: this round's hits and points, why the player is out (null while in) and the last turn they
      // picked in. Spectators have none: they don't play.
      p.minefield = room.game === MINES_GAME && !p.spectator ? { hits: 0, points: 0, out: null, pickedTurn: 0 } : null;
      p.status = this.isPlaying(room, p.id) ? "jugando" : "mirando";
    });
    this.setPhase(room, "countdown", COUNTDOWN_MS, () => this.beginPlaying(room));
  }

  /** How long players have to answer each round in the room's game. */
  roundMs(room) {
    // A public match has its own clock (10 s a question or a turn, 30 s a race), whatever the settings allow.
    if (room.matchmaking) return matchRoundMs(room.game, this.isMinesRace(room));
    if (room.game === QUIZ_GAME) return mergeQuizConfig(room.config.quiz).roundMs;
    if (room.game === GEO_GAME) return mergeGeoConfig(room.config.geo).roundMs;
    if (room.game === HISTORY_GAME) return mergeHistoryConfig(room.config.history).roundMs;
    // Campo de minas: the time of each turn (a round has as many as it takes), or of the whole round in a race.
    if (room.game === MINES_GAME) {
      const mines = mergeMinesConfig(room.config.mines);
      return this.isMinesRace(room) ? mines.roundMs : mines.turnMs;
    }
    return room.config.roundMs || ROUND_MS;
  }

  /** Encuentra el país's rounds (and every tiebreak): a pin on the world map instead of a written answer. */
  isMapRound(room) {
    return room.game === GEO_GAME && room.tracks[room.currentRound]?.kind === "location";
  }

  /** Línea del tiempo's rounds: a year on the timeline instead of a written answer. */
  isYearRound(room) {
    return room.game === HISTORY_GAME && Boolean(room.tracks[room.currentRound]);
  }

  /** Trivia's questions with four options, and Adivina la canción's closed rounds: the answer is an option's position. */
  isChoiceRound(room) {
    return (room.game === QUIZ_GAME || room.game === "musica") && room.tracks[room.currentRound]?.type === "choice";
  }

  /** Campo de minas' rounds: a board of cells, picked one per turn (or as fast as each player can, in a race). */
  isMinesRound(room) {
    return room.game === MINES_GAME && Boolean(room.tracks[room.currentRound]);
  }

  /** A Campo de minas round played as a race ("carrera"): no turns, each player picks cells until they step on a mine.
   *  Each round has its own way (`style`), drawn from the ticked ones when the match starts. */
  isMinesRace(room) {
    return this.isMinesRound(room) && room.tracks[room.currentRound].style === "carrera";
  }

  /** During a tiebreak only the tied players answer; the rest of the room watches. */
  isPlaying(room, userId) {
    if (room.players.get(userId)?.spectator) return false;
    return !room.tiebreak || room.tiebreak.playerIds.includes(userId);
  }

  /** Spectators (who joined mid-match) can look but not answer. */
  /** Whether this player may answer now: not a spectator, and the match isn't paused. */
  assertNotSpectator(room, userId) {
    if (room.players.get(userId)?.spectator) throw new Error("Estás viendo la partida: entrarás cuando termine");
    if (room.paused) throw new Error("La partida está en pausa");
  }

  /**
   * Any player in the room (spectators too) reports the question being played (db/reports.js keeps it): the question
   * as the server has it (with its answer), the game's settings and who was in the room, so it can be checked later.
   * `reporterId` is the player's seat; `verified` says whether the socket's signed account is that same one. Each
   * player reports a round once.
   */
  questionReport(room, reporterId, { verified = false } = {}) {
    const seat = room.players.get(reporterId);
    if (!seat) throw new Error("Solo los jugadores de la sala pueden reportar preguntas");
    const reporter = this.store?.users?.[reporterId] || seat;
    if (!["countdown", "playing", "reveal"].includes(room.phase)) throw new Error("No hay ninguna pregunta en juego");
    const track = room.tracks[room.currentRound];
    if (!track) throw new Error("No hay ninguna pregunta en juego");
    // Who reported each round's question (the round objects are new in every match, so a replay starts clean).
    this.reportedBy ||= new WeakMap();
    const reporters = this.reportedBy.get(track) || new Set();
    if (reporters.has(reporterId)) throw new Error("Ya reportaste esta pregunta");
    reporters.add(reporterId);
    this.reportedBy.set(track, reporters);

    const settings = {
      [QUIZ_GAME]: room.config.quiz,
      [GEO_GAME]: room.config.geo,
      [HISTORY_GAME]: room.config.history,
      [MINES_GAME]: room.config.mines,
    }[room.game] ?? {
      rounds: room.config.rounds,
      roundMs: room.config.roundMs,
      formats: room.config.formats,
      useCatalog: room.config.useCatalog !== false,
      languages: room.config.languages,
      genres: room.config.genres,
      difficulties: room.config.difficulties,
      playlistIds: room.config.playlistIds,
    };
    const players = [...room.players.values()];
    return {
      game: room.game,
      prompt: track.prompt || (track.title ? `${track.title} - ${track.artistName || ""}`.trim() : null),
      question: JSON.parse(JSON.stringify(track)),
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      phase: room.phase,
      tiebreak: Boolean(room.tiebreak),
      settings: JSON.parse(JSON.stringify(settings || {})),
      room: {
        code: room.code,
        players: players.length,
        connected: players.filter((p) => p.connected).length,
        spectators: players.filter((p) => p.spectator).length,
      },
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        spectator: Boolean(p.spectator),
        score: p.score,
        answer: p.lastAnswer ?? null,
      })),
      reporter: { id: reporterId, name: reporter.name, verified: Boolean(verified) },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * The host pauses the match: the clock of the current phase stops where it is (`room.paused.remainingMs`) and no
   * answer is taken until it goes on. Resuming starts the same phase's clock again with the time it had left.
   */
  pause(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el anfitrión puede pausar la partida");
    if (!["countdown", "playing", "reveal"].includes(room.phase)) throw new Error("No hay ninguna partida en curso");
    if (room.paused) return;
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.paused = { remainingMs: Math.max(0, (room.phaseEndsAt || Date.now()) - Date.now()), at: Date.now() };
  }

  resume(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el anfitrión puede reanudar la partida");
    if (!room.paused) return;
    const { remainingMs, at } = room.paused;
    room.paused = null;
    // The phase started that much later, so what depends on its start (the song's position) carries on from there.
    room.phaseStartedAt += Date.now() - at;
    room.phaseEndsAt = Date.now() + remainingMs;
    const onEnd = room.phaseOnEnd;
    room.timer = setTimeout(() => {
      onEnd?.();
      this.onPhaseChange?.(room);
    }, remainingMs);
    // Campo de minas: someone may have left during the pause, and the turn was only waiting for them.
    this.checkMinesTurn(room);
    this.scheduleBots(room);
  }

  /**
   * An owner's "Saltar": straight to the next question, with no waiting. The round being played closes at once (what
   * was already answered is graded and counts, like at the end of its time), its reveal and the next countdown are
   * skipped, and the next round starts playing; after the last one, the match ends (or goes to a tiebreak) as usual.
   * A paused match goes on. `userId` must be the socket's verified account, with the owner role.
   */
  skipRound(room, userId) {
    const owner = this.store?.users?.[userId];
    if (!owner || !hasRole(owner, "owner")) throw new Error("Solo los owners pueden saltar preguntas");
    if (!["countdown", "playing", "reveal"].includes(room.phase)) throw new Error("No hay ninguna pregunta en juego");
    room.paused = null;
    if (room.phase !== "reveal") this.beginReveal(room);
    if (room.timer) clearTimeout(room.timer);
    this.advance(room);
    if (room.phase === "countdown") {
      if (room.timer) clearTimeout(room.timer);
      this.beginPlaying(room);
    }
    this.onPhaseChange?.(room);
  }

  beginPlaying(room) {
    if (this.isMinesRound(room)) {
      this.beginTurn(room);
      return;
    }
    this.setPhase(room, "playing", this.roundMs(room), () => this.beginReveal(room));
  }

  beginReveal(room) {
    const track = room.tracks[room.currentRound];
    const now = Date.now();
    const duration = this.roundMs(room);
    if (this.isChoiceRound(room)) this.gradeQuiz(room, track);
    if (this.isMapRound(room)) this.gradeMap(room, track);
    if (this.isYearRound(room)) this.gradeYears(room, track);
    if (this.isMinesRound(room)) this.gradeMines(room);
    this.markIdle(room);
    room.players.forEach((player) => {
      if (!player.lastAnswer && this.isPlaying(room, player.id)) {
        player.streak = 0;
        player.lastPoints = 0;
        player.lastAnswer = { text: "", correct: false, at: now };
      }
    });
    this.recordRound(room, track);
    let revealMs = REVEAL_MS;
    if (this.isMapRound(room)) revealMs = LOCATION_REVEAL_MS;
    else if (this.isYearRound(room)) revealMs = HISTORY_REVEAL_MS;
    else if (room.game === QUIZ_GAME) revealMs = QUIZ_REVEAL_MS;
    else if (this.isMinesRound(room)) revealMs = MINES_REVEAL_MS;
    this.setPhase(room, "reveal", revealMs, () => this.advance(room));
    return { track, duration };
  }

  /**
   * At each reveal: the round in every player's summary of the match (`results[].rounds`, shown at the end): the
   * question, the right answer (null in Campo de minas, whose board has no single one), what they answered (null with
   * no answer), the points and how it went (`status`): "ok" right (Rango's exact answer, a pin inside the country, a
   * board survived), "near" not right but with points (a close year or pin), "bad" wrong or a mine, "none" no answer.
   * Not in a tiebreak, which gives no points.
   */
  recordRound(room, track) {
    if (room.tiebreak || !track) return;
    const mines = this.isMinesRound(room);
    const right = mines ? null : this.rightAnswerText(room, track);
    const prompt = track.prompt || track.text || (room.game === "musica" ? "¿Qué canción es?" : null);
    for (const player of room.players.values()) {
      if (!this.isPlaying(room, player.id) || (mines && !player.minefield)) continue;
      const answer = player.lastAnswer;
      const yours = answer && !answer.skipped && answer.text ? answer.text : null;
      const points = player.lastPoints || 0;
      const correct = mines ? !answer?.out : Boolean(answer?.correct);
      const status = correct ? "ok" : !yours ? "none" : points > 0 && !answer?.out ? "near" : "bad";
      // `questionId` stays on the server (a report names the question; players never see ids).
      (player.rounds ||= []).push({ round: room.currentRound + 1, game: room.game, questionId: track.id ?? null, prompt, answer: right, yours, points, status });
    }
  }

  /** The right answer of a round, as people read it. */
  rightAnswerText(room, track) {
    if (room.game === HISTORY_GAME) return track.kind === "cifras" ? figureLabel(track.value, track.unit) : yearLabel(track.year);
    if (room.game === GEO_GAME) return track.name || track.answer || null;
    if (room.game === QUIZ_GAME) return track.type === "choice" ? track.options[track.answer] : track.answer || null;
    if (room.game === "musica") return artistLine(track) ? `${track.title} - ${artistLine(track)}` : track.title || null;
    return null;
  }

  /**
   * At each reveal (before the players without an answer get an empty one): whoever played this round and didn't
   * answer (no answer, no pin or year placed; in Campo de minas, no cell picked) adds a round to `idleRounds`; after
   * IDLE_ROUNDS in a row they're `idle`, and rounds (and turns) stop waiting for them to end early. Answering again
   * (answered, pickCell) or answering this round sets them back to zero. Not counted in a tiebreak.
   */
  markIdle(room) {
    if (room.tiebreak) return;
    const mines = this.isMinesRound(room);
    for (const player of room.players.values()) {
      if (!this.isPlaying(room, player.id)) continue;
      const responded = mines ? Boolean(player.minefield?.pickedTurn) : Boolean(player.lastAnswer);
      if (responded) {
        player.idleRounds = 0;
        player.idle = false;
      } else {
        player.idleRounds = (player.idleRounds || 0) + 1;
        if (player.idleRounds >= IDLE_ROUNDS) player.idle = true;
      }
    }
  }

  advance(room) {
    if (room.currentRound + 1 >= (room.totalRounds || room.tracks.length)) {
      if (this.beginTiebreak(room)) return;
      this.finish(room);
      return;
    }
    room.currentRound += 1;
    this.beginCountdown(room);
  }

  /**
   * Geografía and Historia, after the last round (or a tiebreak without a winner): if two or more players share the
   * top score, they play one more round to settle it (a map round, or an event's year). Returns false when the match
   * can end.
   */
  beginTiebreak(room) {
    if (room.game !== GEO_GAME && room.game !== HISTORY_GAME) return false;
    // A mixed playlist's last round may be of any game: its winner is whoever has the most points.
    if (room.run?.mixed) return false;
    const previous = room.tiebreak;
    if (previous?.winnerId || (previous && previous.round >= MAX_TIEBREAKS)) return false;
    const connected = [...room.players.values()].filter((p) => p.connected && !p.spectator);
    let tied;
    if (previous) {
      tied = connected.filter((p) => previous.playerIds.includes(p.id));
    } else {
      const top = Math.max(...connected.map((p) => p.score));
      tied = connected.filter((p) => p.score === top);
    }
    if (tied.length < 2) {
      // The other tied players left: the one still here wins the tiebreak.
      if (previous && tied.length === 1) previous.winnerId = tied[0].id;
      return false;
    }
    const question =
      room.game === GEO_GAME
        ? pickTiebreakQuestion(this.geoQuestions, room.config.geo, room.tracks.map((t) => t.country))
        : pickHistoryTiebreak(this.historyQuestions, room.config.history, room.tracks.map((t) => t.id));
    if (!question) return false;
    room.tiebreak = { playerIds: tied.map((p) => p.id), round: (previous?.round || 0) + 1, winnerId: null, reason: null };
    room.tracks.push(question);
    room.currentRound = room.tracks.length - 1;
    this.beginCountdown(room);
    return true;
  }

  /** Players by final position: by score, and a tiebreak's winner ahead of the players they were tied with. */
  rankedPlayers(room) {
    const winnerId = room.tiebreak?.winnerId;
    return [...room.players.values()]
      .filter((p) => !p.spectator)
      .sort((a, b) => b.score - a.score || (b.id === winnerId) - (a.id === winnerId));
  }

  finish(room) {
    room.paused = null;
    room.phase = "finished";
    room.phaseEndsAt = null;
    if (room.timer) clearTimeout(room.timer);
    if (!room.statsApplied) {
      room.statsApplied = true;
      const ranked = this.rankedPlayers(room);
      applyMatchStats(this.store, ranked, { game: room.run?.mixed ? PLAYLIST_GAME : room.game, room: room.code });
      this.recordWin(room, ranked);
      // A game of a playlist: its winner adds a win to the playlist's tally.
      if (room.run && !room.run.finished && ranked.length) {
        recordGame(room.run, room.run.mixed ? PLAYLIST_GAME : room.game, ranked, this.matchWinner(room, ranked));
      }
    }
    // A mixed playlist is a single match: when it ends, so does the playlist.
    if (room.run?.mixed && !room.run.finished) this.endRun(room);
  }

  /** Who won a finished match: first place with points; a tie for first is nobody's unless a tiebreak settled it. */
  matchWinner(room, ranked) {
    const [first, second] = ranked;
    if (!first) return null;
    const tied = second && second.score === first.score && first.id !== room.tiebreak?.winnerId;
    return first.score > 0 && !tied ? first.id : null;
  }

  /** Adds a finished match to the room's scoreboard (see matchWinner). */
  recordWin(room, ranked) {
    if (!ranked.length) return;
    const board = room.board || (room.board = { matches: 0, players: {} });
    board.matches += 1;
    const winnerId = this.matchWinner(room, ranked);
    for (const p of ranked) {
      const entry = board.players[p.id] || (board.players[p.id] = { wins: 0, played: 0 });
      entry.name = p.name;
      entry.avatar = p.avatar;
      entry.played += 1;
      if (p.id === winnerId) entry.wins += 1;
    }
  }

  endByHost(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede finalizar");
    this.finish(room);
  }

  // "Volver al lobby": during a playlist (or at its end), the playlist is over and the room is back in its panel.
  restart(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede reiniciar la sala");
    this.stopPlaylist(room);
    this.resetMatch(room);
  }

  /**
   * "Volver a jugar", once a match is over: a new one of the same game with the same settings, straight away. If it
   * can't start (not enough songs any more...), the room is left in that game's lobby and the reason is thrown. At the
   * end of a playlist it plays the whole playlist again (shuffled again if it's played in random order).
   */
  replay(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede empezar otra partida");
    if (room.phase !== "finished") throw new Error("La partida aún no ha terminado");
    this.stopPlaylist(room);
    this.resetMatch(room);
    this.start(room, userId);
  }

  /**
   * Starts the room's playlist (from start(), with the room in its panel): every game is checked first, so it doesn't
   * stop halfway for settings that can't be played, then the first one starts. The room's own settings are kept to
   * be put back when the playlist ends.
   */
  startPlaylist(room) {
    const items = room.playlist?.items || [];
    if (!items.length) throw new Error("Añade al menos un juego a la playlist");
    items.forEach((item, i) => {
      const problem = this.itemProblem(room, item, room.config, { exact: true });
      if (problem) throw new Error(`Revisa el juego ${i + 1}, ${GAME_NAMES[item.game]}. ${problem}`);
    });
    room.run = newRun(room.playlist, room.config);
    this.startMixed(room);
  }

  /**
   * A playlist is played as one match: "orden" plays every round of its first game, then of the second, and so on;
   * "aleatorio" mixes every game's rounds at random (two of Encuentra el país, then one of Adivina la canción, then
   * Encuentra el país again...). Each game's questions or songs are drawn now with its own settings; each round,
   * beginCountdown moves the room into its game (enterMixedRound). The scores add up across the whole match, which
   * ends straight on the playlist's results.
   */
  startMixed(room) {
    const run = room.run;
    this.resetMatch(room);
    let perItem;
    try {
      const musicSoFar = [];
      perItem = run.items.map((item, i) => {
        const tracks = this.drawItemTracks(room, item, musicSoFar);
        if (!tracks.length) throw new Error(`Revisa el juego ${i + 1}, ${GAME_NAMES[item.game]}. No hay preguntas con esos ajustes.`);
        return tracks;
      });
    } catch (err) {
      this.stopPlaylist(room);
      this.resetMatch(room);
      throw err;
    }
    const rounds = run.order === "aleatorio" ? mixRounds(perItem) : perItem.flatMap((tracks, item) => tracks.map((track) => ({ item, track })));
    room.tracks = rounds.map(({ item, track }) => ({ ...track, playlistItem: item }));
    room.totalRounds = room.tracks.length;
    const music = room.tracks.filter((t) => run.items[t.playlistItem].game === "musica");
    if (music.length) this.onNewTracks?.(music);
    const connected = [...room.players.values()].filter((p) => p.connected);
    room.participants = new Set(connected.map((p) => p.id));
    room.currentRound = 0;
    connected.forEach((p) => {
      p.score = 0;
      p.correct = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.answerTimes = [];
      p.rounds = [];
      p.idleRounds = 0;
      p.idle = false;
      p.status = "jugando";
    });
    this.beginCountdown(room);
  }

  /**
   * The rounds of one game of a mixed playlist, drawn as its own match would. A game repeated in the playlist doesn't
   * repeat questions or songs the other copies already drew, while there are others.
   */
  drawItemTracks(room, item, musicSoFar) {
    const config = configWithItem(room.run.savedConfig, item);
    if (item.game === "musica") {
      const rounds = config.rounds || 5;
      const scratch = { ...room, game: "musica", config, tracks: [...musicSoFar], totalRounds: musicSoFar.length + rounds };
      scratch.currentRound = scratch.totalRounds - 1;
      const saved = this.onNewTracks;
      this.onNewTracks = null;
      try {
        this.pickAhead(scratch);
      } finally {
        this.onNewTracks = saved;
      }
      const tracks = scratch.tracks.slice(musicSoFar.length);
      musicSoFar.push(...tracks);
      return tracks;
    }
    const draw = () => {
      if (item.game === QUIZ_GAME) {
        const tracks = pickQuizQuestions(this.quizQuestions, mergeQuizConfig(config.quiz));
        for (const t of tracks) if (t.flag) t.flagToken = flagToken(t.flag);
        return tracks;
      }
      if (item.game === GEO_GAME) return pickGeoQuestions(this.geoQuestions, mergeGeoConfig(config.geo));
      if (item.game === HISTORY_GAME) return pickHistoryQuestions(this.historyQuestions, mergeHistoryConfig(config.history));
      return pickMinesQuestions(this.minesQuestions, mergeMinesConfig(config.mines));
    };
    const first = draw();
    const rounds = first.length;
    this.mixedUsed ||= new WeakMap();
    const used = this.mixedUsed.get(room.run) || new Set();
    this.mixedUsed.set(room.run, used);
    const key = (t) => `${item.game}|${t.baseId || t.country || t.id}`;
    const out = [];
    for (let attempt = 0, tracks = first; attempt < 4 && out.length < rounds; attempt += 1, tracks = draw()) {
      for (const t of tracks) {
        if (out.length >= rounds || used.has(key(t)) || out.some((o) => key(o) === key(t))) continue;
        out.push(t);
      }
    }
    // Not enough new ones: the rest may repeat another copy's.
    for (const t of first) if (out.length < rounds && !out.includes(t)) out.push(t);
    out.forEach((t) => used.add(key(t)));
    return out;
  }

  /** Each round of a mixed playlist is played in its own game, with that game's settings from the playlist. */
  enterMixedRound(room) {
    const track = room.tracks[room.currentRound];
    const item = room.run.items[track.playlistItem];
    const changed = room.game !== item.game || room.run.current !== track.playlistItem;
    room.game = item.game;
    room.run.current = track.playlistItem;
    if (changed) {
      room.config = configWithItem(room.run.savedConfig, item);
      this.syncPlaylists(room);
    }
  }

  /** After the playlist's last game, the room shows the playlist's results (still `finished`, back in the playlist). */
  endRun(room) {
    room.run.finished = true;
    room.game = PLAYLIST_GAME;
    room.config = room.run.savedConfig;
    this.syncPlaylists(room);
    // The last game's rounds are done with; its scores stay until the room goes back to a lobby.
    room.tracks = [];
    room.totalRounds = 0;
    room.currentRound = 0;
    room.currentTrackId = null;
    room.tiebreak = null;
  }

  /** The playlist is over or abandoned: the room is back in the playlist's panel with its own settings. */
  stopPlaylist(room) {
    if (!room.run) return;
    room.config = room.run.savedConfig;
    room.run = null;
    room.game = PLAYLIST_GAME;
    this.syncPlaylists(room);
  }

  // Moves the whole room into another game (or back to the Home screen with `null`), abandoning any match in progress.
  // A game's "Terminar" during a playlist (back to the menu, `null`) ends the playlist instead: the room goes back to
  // the playlist's panel, where it came from.
  setGame(room, userId, game) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede cambiar de juego");
    const inPlaylist = Boolean(room.run);
    const next = assertGame(game ?? null) ?? (inPlaylist ? PLAYLIST_GAME : null);
    this.stopPlaylist(room);
    this.resetMatch(room);
    room.game = next;
    room.preview = null;
    room.suggestions = [];
    this.ensureDefaultPlaylists(room);
  }

  // A player (not the host) suggests a game while the room is on the menu: the host sees it and can accept. Each
  // player can suggest once every SUGGEST_COOLDOWN_MS; a new suggestion replaces their previous one.
  suggestGame(room, userId, game) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    if (room.hostId === userId) throw new Error("Tú eliges el juego");
    if (room.game) throw new Error("Ya hay un juego elegido");
    if (!game) throw new Error("Elige un juego");
    assertGame(game);
    const wait = (player.suggestedAt || 0) + SUGGEST_COOLDOWN_MS - Date.now();
    if (wait > 0) throw new Error(`Espera ${Math.ceil(wait / 1000)} s para sugerir otra vez`);
    player.suggestedAt = Date.now();
    room.suggestions = (room.suggestions || []).filter((s) => s.userId !== userId);
    room.suggestions.push({ userId, name: player.name, game, at: Date.now() });
  }

  /**
   * A chat message from a player of the room (PartyPanel's chat). Spaces are squeezed and it is cut at CHAT_MAX_LENGTH;
   * the room keeps the newest CHAT_KEEP, and a player can send one every CHAT_GAP_MS. It is closed while a round is
   * played (countdown and playing), so nobody can pass on the answer. Like the rest of the room it lives only in memory.
   */
  sendChat(room, userId, text) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!clean) throw new Error("Escribe un mensaje");
    if (hasLink(clean)) throw new Error(CHAT_LINK_ERROR);
    const now = Date.now();
    if (now - (player.chattedAt || 0) < CHAT_GAP_MS) throw new Error("Espera un momento antes de mandar otro mensaje");
    player.chattedAt = now;
    room.chatSeq = (room.chatSeq || 0) + 1;
    room.chat = [...(room.chat || []), { id: room.chatSeq, userId, name: player.name, avatar: player.avatar, text: clean, at: now }].slice(
      -CHAT_KEEP
    );
  }

  /** The room a player is in right now (not just reconnecting), or null. Used to show friends where someone plays. */
  roomOfUser(userId) {
    for (const room of this.rooms.values()) {
      if (room.players.get(userId)?.connected) return room;
    }
    return null;
  }

  /** The host decides what their friends can do from the friends list: join, ask to join, or nothing. */
  setJoinMode(room, userId, mode) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede cambiar quién se une");
    if (!JOIN_MODES.includes(mode)) throw new Error("Esa opción no existe");
    room.joinMode = mode;
    if (mode !== "solicitud") room.joinRequests = [];
  }

  /** The requests to join that are still valid. */
  openJoinRequests(room) {
    const now = Date.now();
    room.joinRequests = (room.joinRequests || []).filter((r) => now - r.at < JOIN_REQUEST_TTL_MS && !room.players.get(r.userId)?.connected);
    return room.joinRequests;
  }

  /** A friend asks the host to let them in (only when the room is "solicitud"). */
  addJoinRequest(room, user, now = Date.now()) {
    if (room.joinMode !== "solicitud") throw new Error("Esa sala no recibe solicitudes");
    if (room.blocked?.has(user.id)) throw new Error("No puedes unirte a esa sala");
    if (room.players.get(user.id)?.connected) throw new Error("Ya estás en esa sala");
    room.joinAsked = room.joinAsked || new Map();
    const wait = (room.joinAsked.get(user.id) || 0) + JOIN_ASK_GAP_MS - now;
    if (wait > 0) throw new Error(`Espera ${Math.ceil(wait / 1000)} s para pedirlo otra vez`);
    const open = this.openJoinRequests(room).filter((r) => r.userId !== user.id);
    if (open.length >= JOIN_REQUESTS_KEEP) throw new Error("Esa sala ya tiene muchas solicitudes. Inténtalo en un momento.");
    room.joinAsked.set(user.id, now);
    room.joinRequests = [...open, { userId: user.id, name: user.name, avatar: user.avatar, at: now }];
  }

  /** The requester takes their request back. */
  cancelJoinRequest(room, userId) {
    room.joinRequests = (room.joinRequests || []).filter((r) => r.userId !== userId);
  }

  /** The host lets a friend in (the friend then joins) or turns them down. Returns the request's user. */
  answerJoinRequest(room, hostId, userId) {
    if (room.hostId !== hostId) throw new Error("Solo el Host responde a las solicitudes");
    const found = this.openJoinRequests(room).find((r) => r.userId === userId);
    if (!found) throw new Error("Esa solicitud ya no está");
    room.joinRequests = room.joinRequests.filter((r) => r.userId !== userId);
    return found;
  }

  // The game the host is pointing at on the menu, so every player sees it live before it is picked. Only while the
  // room has no game; it is cleared as soon as one is picked (or the host changes).
  previewGame(room, userId, game) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede elegir el juego");
    if (room.game) return;
    room.preview = assertGame(game ?? null);
  }

  resetMatch(room) {
    if (room.timer) clearTimeout(room.timer);
    room.paused = null;
    room.timer = null;
    room.phase = "lobby";
    room.phaseStartedAt = Date.now();
    room.phaseEndsAt = null;
    room.currentRound = 0;
    room.tracks = [];
    room.totalRounds = 0;
    room.currentTrackId = null;
    room.answers = {};
    room.statsApplied = false;
    room.tiebreak = null;
    room.participants = null;
    room.turn = 0;
    room.introFor = null;
    for (const [id, p] of room.players) {
      // Players who left mid-match (and aren't reconnecting) have no seat in a fresh lobby.
      if (!p.connected && !p.dropTimer) {
        room.players.delete(id);
        room.coHosts = (room.coHosts || []).filter((c) => c !== id);
        continue;
      }
      p.spectator = false;
      p.score = 0;
      p.correct = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.answerTimes = [];
      p.rounds = [];
      p.idleRounds = 0;
      p.idle = false;
      p.lastAnswer = null;
      p.lastPoints = 0;
      p.pin = null;
      p.guess = null;
      p.minefield = null;
      p.status = p.connected ? "conectado" : "desconectado";
    }
  }


  submitAnswer(room, userId, answerText) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    this.assertNotSpectator(room, userId);

    // If already answered this round, gracefully accept without throwing duplicate error
    if (player.lastAnswer) {
      return player.lastAnswer;
    }
    if (this.isChoiceRound(room)) return this.submitQuizAnswer(room, player, answerText);
    if (this.isMapRound(room)) throw new Error("Toca el mapa para poner tu pin");
    if (this.isYearRound(room)) throw new Error("Elige el año en la línea del tiempo");
    if (this.isMinesRound(room)) throw new Error("Toca una casilla del tablero");

    // Grace period for network latency if reveal just started
    const isPlaying = room.phase === "playing";
    const isRecentReveal = room.phase === "reveal" && Date.now() - (room.phaseStartedAt || 0) < 2000;

    if (!isPlaying && !isRecentReveal) {
      throw new Error("No se aceptan respuestas ahora");
    }

    const track = room.tracks[room.currentRound];
    if (!track) throw new Error("No hay canción activa");

    const remainingMs = Math.max(0, (room.phaseEndsAt || Date.now()) - Date.now());

    // Check if the answer matches
    const questionGame = room.game === QUIZ_GAME;
    if (questionGame) answerText = String(answerText ?? "").slice(0, 100);
    const correct = questionGame
      ? isCorrectOpenAnswer(answerText, track)
      : answerText === track.id || this.pickedSameSong(room, track, answerText) || isCorrectAnswer(answerText, track);
    const scored = scoreAnswer({
      correct,
      remainingMs,
      durationMs: this.roundMs(room),
      streak: player.streak,
    });
    player.lastAnswer = {
      text: questionGame ? String(answerText).slice(0, 80) : this.answerLabel(room, track, answerText, correct),
      correct,
      at: Date.now(),
    };
    player.lastPoints = scored.points;
    player.streak = scored.streak;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    player.score += scored.points;
    if (correct) {
      player.correct += 1;
      player.answerTimes.push(this.roundMs(room) - remainingMs);
      if (!questionGame) {
        if (!player.artistHits) player.artistHits = {};
        const artistKey = track.artistId || (track.artistName ? track.artistName.toLowerCase().replace(/\s+/g, "-") : "varios");
        player.artistHits[artistKey] = (player.artistHits[artistKey] || 0) + 1;
      }
    }
    this.answered(room, player);
  }

  /**
   * Opción múltiple: the player's choice (an option index) is only recorded here. It is graded at the reveal
   * (gradeQuiz), so until then nothing that reaches any client (the answer ack, scores, streaks) says whether it was
   * right. Answers are only taken while the question is open: during the reveal the right option is on screen.
   */
  submitQuizAnswer(room, player, value) {
    if (room.phase !== "playing") throw new Error("No se aceptan respuestas ahora");
    const question = room.tracks[room.currentRound];
    if (!question) throw new Error("No hay pregunta activa");
    const choice = Number(value);
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) throw new Error("Elige una de las opciones");
    player.lastAnswer = { text: question.options[choice], choice, at: Date.now() };
    player.answerRemainingMs = Math.max(0, (room.phaseEndsAt || Date.now()) - Date.now());
    this.answered(room, player);
  }

  /** Opción múltiple, when the round ends: scores every answer to the question (same scoring as the songs). */
  gradeQuiz(room, question) {
    const durationMs = this.roundMs(room);
    for (const player of room.players.values()) {
      const answer = player.lastAnswer;
      if (!answer || answer.skipped || !Number.isInteger(answer.choice)) continue;
      const correct = answer.choice === question.answer;
      const scored = scoreAnswer({ correct, remainingMs: player.answerRemainingMs || 0, durationMs, streak: player.streak });
      answer.correct = correct;
      player.lastPoints = scored.points;
      player.streak = scored.streak;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      player.score += scored.points;
      if (correct) {
        player.correct += 1;
        player.answerTimes.push(durationMs - (player.answerRemainingMs || 0));
      }
    }
  }

  /**
   * Geografía's map rounds: the player taps the map. A pin can be moved until it is locked (`lock`, the "Confirmar"
   * button, which sends the pin again); when the time runs out, the last pin counts. A locked pin is final. In a
   * tiebreak, locking a pin inside the country ends the round on the spot: the first to confirm the country wins.
   * Pins are only judged at the reveal (gradeMap), so nothing tells the other players where the country is before.
   * Returns true when the pin was locked (the room's state changed for everyone).
   */
  placePin(room, userId, value) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    this.assertNotSpectator(room, userId);
    if (!this.isMapRound(room)) throw new Error("Esta ronda no es de mapa");
    if (room.phase !== "playing") throw new Error("No se aceptan respuestas ahora");
    if (!this.isPlaying(room, userId)) throw new Error("Solo juegan el desempate los jugadores empatados");
    if (player.lastAnswer) return false;
    const lng = Number(value?.lng);
    const lat = Number(value?.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      throw new Error("Ese punto no está en el mapa");
    }
    const round = (n) => Math.round(n * 10000) / 10000;
    player.pin = { lng: round(lng), lat: round(lat), at: Date.now() };
    if (!value.lock) return false;

    player.lastAnswer = { pin: [player.pin.lng, player.pin.lat], at: player.pin.at, locked: true };
    const track = room.tracks[room.currentRound];
    if (room.tiebreak && locate(track.map, player.lastAnswer.pin).inside) {
      player.status = "respondió";
      if (room.timer) clearTimeout(room.timer);
      this.beginReveal(room);
      this.onPhaseChange?.(room);
      return true;
    }
    this.answered(room, player);
    return true;
  }

  /**
   * At the reveal of a map round: each pin (locked or the last one placed) is measured against the country. Inside it
   * gets every point; outside, fewer the further it landed. In a tiebreak nobody scores: it decides who wins.
   */
  gradeMap(room, track) {
    for (const player of room.players.values()) {
      if (!this.isPlaying(room, player.id)) continue;
      if (!player.lastAnswer && player.pin) {
        player.lastAnswer = { pin: [player.pin.lng, player.pin.lat], at: player.pin.at, locked: false };
      }
      const answer = player.lastAnswer;
      if (!answer?.pin) continue;
      const spot = locate(track.map, answer.pin);
      answer.inside = spot.inside;
      answer.correct = spot.inside;
      answer.distanceKm = Math.round(spot.distanceKm * 10) / 10;
      answer.nearest = spot.nearest.map((n) => Math.round(n * 10000) / 10000);
      answer.text = spot.inside ? "Dentro del país" : `A ${Math.round(answer.distanceKm).toLocaleString("es-ES")} km`;
      if (room.tiebreak) continue;
      const points = locationPoints(spot);
      player.lastPoints = points;
      player.score += points;
      player.streak = spot.inside ? player.streak + 1 : 0;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      if (spot.inside) {
        player.correct += 1;
        player.answerTimes.push(Math.max(0, answer.at - room.phaseStartedAt));
      }
    }
    if (room.tiebreak) this.settleTiebreak(room);
  }

  /**
   * Historia: the player moves a marker along the timeline. Like a map pin, the year can change until it is locked
   * (`lock`, the "Confirmar" button); when the time runs out, the last one counts. In a tiebreak, locking the exact
   * year ends the round on the spot: the first to confirm it wins. Years are only judged at the reveal (gradeYears).
   * Returns true when the year was locked (the room's state changed for everyone).
   */
  placeYear(room, userId, value) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    this.assertNotSpectator(room, userId);
    if (!this.isYearRound(room)) throw new Error("Esta ronda no es de elegir el año");
    if (room.phase !== "playing") throw new Error("No se aceptan respuestas ahora");
    if (!this.isPlaying(room, userId)) throw new Error("Solo juegan el desempate los jugadores empatados");
    if (player.lastAnswer) return false;
    const track = room.tracks[room.currentRound];
    let exact;
    if (track.kind === "cifras") {
      // Cifras: a number on the figure's bar.
      const number = Number(value?.value);
      if (!Number.isInteger(number) || number < track.min || number > track.max) throw new Error("Elige un número de la barra");
      player.guess = { value: number, at: Date.now() };
      exact = Math.abs(number - track.value) <= figureTolerance(track.span);
    } else {
      const year = Number(value?.year);
      if (!Number.isInteger(year) || year < track.min || year > track.max) throw new Error("Elige un año de la línea del tiempo");
      if (year === 0) throw new Error("El año 0 no existe");
      if (year > currentYear()) throw new Error("Ese año aún no ha llegado");
      player.guess = { year, at: Date.now() };
      exact = year === track.year;
    }
    if (!value.lock) return false;

    player.lastAnswer = { ...player.guess, locked: true };
    if (room.tiebreak && exact) {
      player.status = "respondió";
      if (room.timer) clearTimeout(room.timer);
      this.beginReveal(room);
      this.onPhaseChange?.(room);
      return true;
    }
    this.answered(room, player);
    return true;
  }

  /**
   * At the reveal of a Historia round: each year (locked or the last one chosen) is compared with the event's. The
   * exact year gets every point; otherwise fewer the further it is. In a tiebreak nobody scores: it decides who wins.
   */
  gradeYears(room, track) {
    const figure = track.kind === "cifras";
    for (const player of room.players.values()) {
      if (!this.isPlaying(room, player.id)) continue;
      if (!player.lastAnswer && player.guess) {
        player.lastAnswer = { ...player.guess, locked: false };
      }
      const answer = player.lastAnswer;
      let points;
      if (figure) {
        // Cifras: how far the number is, and whether it went over (`over`) or fell short.
        if (!Number.isInteger(answer?.value)) continue;
        const diff = Math.abs(answer.value - track.value);
        answer.diff = diff;
        answer.over = answer.value > track.value;
        answer.correct = diff <= figureTolerance(track.span);
        const label = figureLabel(answer.value, track.unit);
        answer.text = answer.correct ? `${label}, exacto` : `${label}, ${answer.over ? "se pasó por" : "le faltaron"} ${figureLabel(diff, track.unit)}`;
        points = figurePoints(diff, track.span);
      } else {
        if (!Number.isInteger(answer?.year)) continue;
        const diff = yearsApart(answer.year, track.year);
        answer.diff = diff;
        answer.correct = diff === 0;
        answer.text = diff === 0 ? `${yearLabel(answer.year)}, año exacto` : `${yearLabel(answer.year)}, a ${diff} ${diff === 1 ? "año" : "años"}`;
        points = yearPoints(diff, track.era);
      }
      if (room.tiebreak) continue;
      player.lastPoints = points;
      player.score += points;
      player.streak = answer.correct ? player.streak + 1 : 0;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      if (answer.correct) {
        player.correct += 1;
        player.answerTimes.push(Math.max(0, answer.at - room.phaseStartedAt));
      }
    }
    if (room.tiebreak) this.settleTiebreak(room);
  }

  /**
   * Who won a tiebreak round: the tied player who confirmed the right answer (a pin inside the country, or the exact
   * year; the first to do it ends the round: see placePin and placeYear); one left unconfirmed only wins if nobody
   * confirmed one, the earliest placed first. If nobody got it right, the closest answer wins, however long it took.
   * No answers (or two equally close) means another tiebreak.
   */
  settleTiebreak(room) {
    const tb = room.tiebreak;
    const map = room.game === GEO_GAME;
    const miss = (answer) => (map ? answer.distanceKm : answer.diff);
    const answers = tb.playerIds.map((id) => room.players.get(id)).filter((p) => p?.lastAnswer && miss(p.lastAnswer) != null);
    const right = answers
      .filter((p) => p.lastAnswer.correct)
      .sort((a, b) => Boolean(b.lastAnswer.locked) - Boolean(a.lastAnswer.locked) || a.lastAnswer.at - b.lastAnswer.at);
    if (right.length) {
      tb.winnerId = right[0].id;
      tb.reason = map ? "dentro" : "exacto";
      return;
    }
    const byDistance = answers.sort((a, b) => miss(a.lastAnswer) - miss(b.lastAnswer));
    if (byDistance.length && (byDistance.length === 1 || miss(byDistance[0].lastAnswer) < miss(byDistance[1].lastAnswer))) {
      tb.winnerId = byDistance[0].id;
      tb.reason = "cerca";
    }
  }

  /** A suggestion picked from the search box whose id isn't the round's but is the same recording (the catalog and
   *  Spotify can each have it under their own id): it counts as the right song. */
  pickedSameSong(room, track, answerText) {
    const picked = this.buildSearchCatalog(room).find((s) => s.id === answerText);
    return Boolean(picked) && songKey(picked) === songKey(track);
  }

  /**
   * Campo de minas: a turn of the round. Everyone still in picks one cell; the turn ends when they all have (or when
   * its time runs out, and whoever didn't pick is out). Each turn restarts the phase's clock (`phaseStartedAt` is the
   * turn's start); the first one of a round is longer, to read the board. A race is one long turn: the whole round.
   */
  beginTurn(room) {
    room.turn = (room.turn || 0) + 1;
    room.players.forEach((p) => {
      if (p.minefield && !p.minefield.out) p.status = "jugando";
    });
    const firstTurn = room.turn === 1 && !this.isMinesRace(room);
    const duration = this.roundMs(room) + (firstTurn ? MINES_FIRST_TURN_EXTRA_MS : 0);
    this.setPhase(room, "playing", duration, () => this.endTurn(room, true));
  }

  /**
   * Campo de minas: the player picks a cell (`{ cell, turn }`; `turn` is the one they saw, so a tap that arrives after
   * it closed doesn't count for the next one). The first to pick a cell keeps it. A right answer scores at once, 100
   * points more than the player's previous hit of the round; a mine leaves them out until the next round, with the
   * points they had. By turns it's one cell per turn; in a race, as many as the player likes. Returns whether the
   * cell was right.
   */
  pickCell(room, userId, value) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    this.assertNotSpectator(room, userId);
    if (!this.isMinesRound(room)) throw new Error("Esta ronda no es de Campo de minas");
    if (room.phase !== "playing") throw new Error("No se aceptan respuestas ahora");
    const field = player.minefield;
    if (!field) throw new Error("Llegaste con la ronda empezada: juegas desde la siguiente");
    if (field.out) throw new Error("Estás fuera hasta la próxima ronda");
    if (value?.turn != null && Number(value.turn) !== room.turn) throw new Error("Ese turno ya terminó");
    const race = this.isMinesRace(room);
    if (!race && field.pickedTurn === room.turn) throw new Error("Ya elegiste en este turno");
    const board = room.tracks[room.currentRound];
    const index = Number(value?.cell);
    if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) throw new Error("Esa casilla no existe");
    const cell = board.cells[index];
    if (cell.by) throw new Error(`${room.players.get(cell.by)?.name || "Otro jugador"} ya eligió esa casilla`);

    const now = Date.now();
    cell.by = userId;
    cell.at = now;
    cell.turn = room.turn;
    field.pickedTurn = room.turn;
    player.idleRounds = 0;
    player.idle = false;
    if (!race) player.status = "respondió";
    if (cell.correct) {
      field.hits += 1;
      const points = hitPoints(field.hits);
      field.points += points;
      player.lastPoints = field.points;
      player.score += points;
      player.correct += 1;
      player.streak += 1;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      player.answerTimes.push(Math.max(0, now - room.phaseStartedAt));
    } else {
      field.out = "mina";
      player.streak = 0;
    }
    this.checkMinesTurn(room);
    return cell.correct;
  }

  /**
   * Campo de minas, after a pick (or a player leaving): the round ends when no right answer is left or nobody is left
   * standing; otherwise, by turns, the next turn starts once everyone still in (and connected) has picked. Returns
   * true when the turn or the round ended.
   */
  checkMinesTurn(room) {
    // While paused nothing moves on (someone leaving included): it's checked again on "Reanudar".
    if (!this.isMinesRound(room) || room.phase !== "playing" || room.paused) return false;
    if (this.minesRoundOver(room)) {
      this.beginReveal(room);
      return true;
    }
    if (this.isMinesRace(room)) return false;
    const waiting = [...room.players.values()].some(
      (p) => p.connected && !p.idle && p.minefield && !p.minefield.out && p.minefield.pickedTurn !== room.turn
    );
    if (waiting) return false;
    this.endTurn(room, false);
    return true;
  }

  /**
   * Campo de minas: the end of a turn. When its time ran out, whoever was still in and didn't pick is out. A race's
   * time is the round's: when it runs out the round ends, and whoever is still standing survived it.
   */
  endTurn(room, timeUp) {
    if (!this.isMinesRound(room) || room.phase !== "playing") return;
    if (this.isMinesRace(room)) {
      this.beginReveal(room);
      return;
    }
    if (timeUp) {
      for (const p of room.players.values()) {
        const field = p.minefield;
        if (field && !field.out && field.pickedTurn !== room.turn) {
          field.out = "tiempo";
          p.streak = 0;
        }
      }
    }
    if (this.minesRoundOver(room)) this.beginReveal(room);
    else this.beginTurn(room);
  }

  /** Campo de minas: every right answer of the board was found, or every connected player is out. */
  minesRoundOver(room) {
    const board = room.tracks[room.currentRound];
    const hitsLeft = board.cells.some((c) => c.correct && !c.by);
    const standing = [...room.players.values()].some((p) => p.connected && p.minefield && !p.minefield.out);
    return !hitsLeft || !standing;
  }

  /** Campo de minas, at the reveal: each player's round in a few words ("3 aciertos", "Pisó una mina"), and its points. */
  gradeMines(room) {
    for (const player of room.players.values()) {
      const field = player.minefield;
      if (!field) continue;
      let text = field.hits === 1 ? "1 acierto" : field.hits ? `${field.hits} aciertos` : "Sin aciertos";
      if (field.out === "mina") text = "Pisó una mina";
      else if (field.out === "tiempo") text = "Sin tiempo";
      player.lastPoints = field.points;
      player.lastAnswer = { text, correct: field.hits > 0, hits: field.hits, out: field.out, at: Date.now() };
    }
  }

  /** What the player answered, as people read it: "As It Was - Harry Styles" for a picked suggestion (whose raw
   *  value is a song id such as "harry-styles-as-it-was") or for the right song; the typed text otherwise. */
  answerLabel(room, track, answerText, correct) {
    const label = (song) => (artistLine(song) ? `${song.title} - ${artistLine(song)}` : song.title);
    if (correct) return label(track);
    const raw = String(answerText);
    const picked = this.buildSearchCatalog(room).find((s) => s.id === raw);
    return picked ? label(picked) : raw;
  }

  /** "Saltar": the player gives up on this round. No points, and the streak starts over. */
  skip(room, userId) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    this.assertNotSpectator(room, userId);
    if (this.isMinesRound(room)) throw new Error("En Campo de minas no se puede saltar");
    if (player.lastAnswer) return player.lastAnswer;
    if (room.phase !== "playing") throw new Error("No se aceptan respuestas ahora");
    if (!this.isPlaying(room, userId)) throw new Error("Solo juegan el desempate los jugadores empatados");
    player.pin = null;
    player.lastAnswer = { text: "", correct: false, skipped: true, at: Date.now() };
    player.lastPoints = 0;
    player.streak = 0;
    this.answered(room, player);
  }

  // Once every connected player has answered (or skipped), the song is revealed without waiting for the clock.
  answered(room, player) {
    player.status = "respondió";
    player.idleRounds = 0;
    player.idle = false;
    this.onPhaseChange?.(room);
    // The round ends early once everyone it waits for answered: connected players, not the inactive ones (markIdle).
    const active = [...room.players.values()].filter((p) => p.connected && !p.idle && this.isPlaying(room, p.id));
    if (active.length && active.every((p) => p.lastAnswer)) {
      if (room.timer) clearTimeout(room.timer);
      this.beginReveal(room);
      this.onPhaseChange?.(room);
    }
  }

  setPhase(room, phase, duration, onEnd) {
    if (room.timer) clearTimeout(room.timer);
    room.paused = null;
    // Kept so a paused phase can start its clock again (resume).
    room.phaseOnEnd = onEnd;
    room.phase = phase;
    room.phaseStartedAt = Date.now();
    room.phaseEndsAt = Date.now() + duration;
    this.onPhaseChange?.(room);
    room.timer = setTimeout(() => {
      onEnd();
      this.onPhaseChange?.(room);
    }, duration);
    if (room.botTimers?.length || phase === "playing") this.scheduleBots(room);
  }

  publicState(room, forUserId) {
    const track = room.tracks[room.currentRound];
    const host = room.players.get(room.hostId);
    const showTrack = room.phase === "reveal" || room.phase === "finished";
    const payload = {
      code: room.code,
      name: room.config.name || "Partida Trivially",
      mode: room.mode,
      game: room.game,
      hostId: room.hostId,
      hostName: host?.name || "Host",
      phase: room.phase,
      phaseStartedAt: room.phaseStartedAt,
      phaseEndsAt: room.phaseEndsAt,
      // The host paused the match: the clock shows the time left, stopped.
      paused: room.paused ? { remainingMs: room.paused.remainingMs } : null,
      serverNow: Date.now(),
      currentRound: room.currentRound,
      totalRounds: room.totalRounds || room.tracks.length || room.config.rounds,
      // In the lobby: how many different songs the chosen playlists have ready (a match needs one per round), and
      // whether iTunes is making the Spotify songs wait.
      songsReady:
        room.phase === "lobby" && room.game !== PLAYLIST_GAME && !QUESTION_GAMES.includes(room.game) ? this.songPool(room).length : undefined,
      // Opción múltiple, Geografía and Historia, in the lobby: how many different questions the chosen settings have
      // (one per round).
      questionsReady: room.phase === "lobby" ? this.questionsReady(room) : undefined,
      // Geografía and Historia: the players of a tiebreak and, from its reveal on, who won it and how ("dentro": found
      // the country first; "exacto": confirmed the exact year first; "cerca": nobody got it and theirs was closest).
      tiebreak: room.tiebreak
        ? { playerIds: [...room.tiebreak.playerIds], round: room.tiebreak.round, winnerId: room.tiebreak.winnerId, reason: room.tiebreak.reason }
        : null,
      itunesSlow: Boolean(this.resolver?.slow),
      // Spotify playlists the host added, with how many of their songs are ready to play.
      customPlaylists: Object.values(room.customPlaylists || {}).map((e) => ({
        id: e.id,
        name: e.name,
        image: e.image,
        total: e.tracks.length,
        ready: e.songs.size,
        // Songs looked at once, and the not-found ones waiting for the second, deeper search.
        checked: e.done.size,
        retrying: e.active ? this.missingSongs(e).length : 0,
        // A pasted public playlist is playable at once; what still runs is only looking up covers.
        loading: e.active && !e.instant && (e.done.size < e.tracks.length || this.missingSongs(e).length > 0),
        // Small covers of the songs found so far, for the strip under the playlists.
        covers: [...e.songs.values()]
          .map((song) => song.image?.replace(/\/\d+x\d+bb\./, "/160x160bb."))
          .filter(Boolean)
          .slice(0, 40),
      })),
      config: room.config,
      // The room's scoreboard across matches (recordWin), most wins first.
      board: {
        matches: room.board?.matches || 0,
        players: Object.entries(room.board?.players || {})
          .map(([id, e]) => ({ id, name: e.name, avatar: e.avatar, wins: e.wins, played: e.played }))
          .sort((a, b) => b.wins - a.wins || b.played - a.played),
      },
      coHosts: [...(room.coHosts || [])],
      // What the host's friends can do from their friends list, and the friends asking to join (the host answers).
      joinMode: room.joinMode || "solicitud",
      joinRequests: this.openJoinRequests(room).map((r) => ({ userId: r.userId, name: r.name, avatar: r.avatar, at: r.at })),
      // The room's central device (whose account opened it, and whether it's connected: while it is, the players'
      // screens show only the ways to answer), and the players asking to use another device of theirs as it.
      central: room.central
        ? { userId: room.central.userId, name: room.central.name, avatar: room.central.avatar, connected: room.central.connected }
        : null,
      centralRequests: (room.centralRequests || []).map((r) => ({ id: r.id, userId: r.userId, name: r.name, avatar: r.avatar, at: r.at })),
      // The room's chat, oldest first (sendChat).
      chat: room.chat || [],
      // The playlist being made, while the room is in its panel or playing it; in the panel, also why each of its games
      // can't be played yet (null when it can) and the counts for its settings' chips.
      playlist: room.game === PLAYLIST_GAME || room.run ? room.playlist : undefined,
      playlistStatus: room.game === PLAYLIST_GAME && room.phase === "lobby" ? this.playlistStatus(room) : undefined,
      // The playlist being played: its games in play order, which one is on, who won each one and the tally.
      run: room.run ? publicRun(room.run) : null,
      // What the host is pointing at on the game menu (null once a game is picked).
      preview: room.game ? null : room.preview || null,
      // Games the other players suggested to the host, newest last (only while the room is on the menu).
      suggestions: room.game
        ? []
        : (room.suggestions || [])
            .filter((s) => room.players.has(s.userId) && Date.now() - s.at < SUGGESTION_TTL_MS)
            .map((s) => ({ userId: s.userId, name: room.players.get(s.userId).name, game: s.game, at: s.at })),
      players: [...room.players.values()].map((p) => publicPlayer(p, room.phase, room)),
      // A public match ("Casual" or "Competitivo"): its kind and length, how full it is, its games once drawn.
      matchmaking: room.matchmaking ? publicMatchmaking(room.matchmaking, this.connectedCount(room)) : null,
      // Before each game of a public match: the roulette lands on `game` (`index` in `games`, the match's games in
      // play order), then its tutorial.
      intro:
        room.phase === "intro" && room.run
          ? {
              game: room.game,
              games: room.run.items.map((item) => item.game),
              index: room.run.current ?? 0,
              spinMs: INTRO_SPIN_MS,
              tutorialMs: INTRO_TUTORIAL_MS,
            }
          : null,
      audio: null,
      reveal: null,
      question: null,
      results: null,
    };

    if (room.game === QUIZ_GAME) {
      if (track) payload.question = this.publicQuestion(room, track);
      // In the lobby: how many questions each topic and way of answering has, for the settings' chips.
      if (room.phase === "lobby") payload.questionCounts = questionCounts(this.quizQuestions, room.config.quiz);
    } else if (room.game === "musica" && room.phase === "lobby") {
      // The catalog's songs per language, genre and difficulty, for the settings' chips.
      payload.songCounts = songCounts(this.catalog, room.config);
    } else if (room.game === GEO_GAME) {
      if (track) payload.question = this.publicGeoQuestion(room, track);
      if (track && showTrack) {
        payload.reveal = {
          kind: track.kind,
          prompt: track.prompt,
          answer: track.answer,
          name: track.name,
          map: track.map,
        };
      }
    } else if (room.game === HISTORY_GAME) {
      if (track) payload.question = this.publicHistoryQuestion(room, track);
      // In the lobby: how many events each topic, age and difficulty has, for the settings' chips.
      if (room.phase === "lobby") payload.questionCounts = historyCounts(this.historyQuestions, room.config.history);
      if (track && showTrack) {
        payload.reveal =
          track.kind === "cifras"
            ? { kind: "cifras", prompt: track.prompt, value: track.value, unit: track.unit, min: track.min, max: track.max }
            : { kind: "linea", prompt: track.prompt, year: track.year, min: track.min, max: track.max };
      }
    } else if (room.game === MINES_GAME) {
      // The whole board (which cells were right) only goes out with the question at the reveal.
      if (track) payload.question = this.publicMinesQuestion(room, track);
      // In the lobby: how many boards each category and difficulty has, for the settings' chips.
      if (room.phase === "lobby") payload.questionCounts = minesCounts(this.minesQuestions, room.config.mines);
    } else if (track && (room.phase === "countdown" || room.phase === "playing")) {
      payload.audio = {
        previewUrl: track.previewUrl,
        round: room.currentRound + 1,
      };
    }
    // Adivina la canción: how this round is answered from the countdown on; a closed round's four songs while it plays,
    // and the right one and how many picked each only at the reveal.
    if (room.game === "musica" && track && room.phase !== "lobby") {
      const closed = track.type === "choice";
      const open = ["playing", "reveal", "finished"].includes(room.phase);
      const showAnswer = room.phase === "reveal" || room.phase === "finished";
      const picks = closed ? track.options.map(() => 0) : null;
      if (closed && showAnswer) {
        for (const p of room.players.values()) if (Number.isInteger(p.lastAnswer?.choice)) picks[p.lastAnswer.choice] += 1;
      }
      payload.choice = {
        type: closed ? "choice" : "open",
        options: closed && open ? track.options : null,
        details: closed && open ? track.details || null : null,
        answer: closed && showAnswer ? track.answer : null,
        picks: closed && showAnswer ? picks : null,
      };
    }
    // Send full search catalog for autocomplete during playing phase
    const songRound = !QUESTION_GAMES.includes(room.game);
    if (room.phase === "playing" && songRound) {
      // Only the room's extras: the full list comes once from GET /api/songs (see globalSongList).
      payload.searchCatalog = this.roomSearchExtras(room);
    }
    if (track && showTrack && songRound) {
      payload.reveal = hydrateSong(this.catalog, track);
    }
    if (room.phase === "finished") {
      const ranked = this.rankedPlayers(room);
      payload.results = ranked.map((p, i) => ({
        position: i + 1,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isGuest: Boolean(p.isGuest),
        score: p.score,
        correct: p.correct,
        bestStreak: p.bestStreak,
        avgMs: p.answerTimes.length
          ? Math.round(p.answerTimes.reduce((s, n) => s + n, 0) / p.answerTimes.length)
          : null,
        tiebreakWinner: p.id === room.tiebreak?.winnerId,
        // Every round of the match for this player, with the right answer and their points (recordRound).
        rounds: publicRounds(p.rounds),
      }));
    }
    // Nothing of the next game's first round shows while its roulette and tutorial are on.
    if (room.phase === "intro") {
      payload.question = null;
      payload.reveal = null;
      payload.audio = null;
      delete payload.choice;
    }
    if (forUserId) {
      const me = room.players.get(forUserId);
      payload.me = me
        ? {
            id: me.id,
            spectator: Boolean(me.spectator),
            lastPoints: me.lastPoints,
            lastAnswer: me.lastAnswer,
            // Geografía's map rounds: this player's pin, not locked yet (so a reload doesn't lose it).
            pin: me.pin ? [me.pin.lng, me.pin.lat] : null,
            // Rango: the year (or Cifras' number) this player has on the line, not locked yet.
            guess: me.guess ? me.guess.year ?? me.guess.value : null,
            isHost: room.hostId === forUserId,
            canEditConfig: this.canEditConfig(room, forUserId),
          }
        : null;
    }
    return payload;
  }

  /** In the lobby: how many different questions the room's settings can draw (a match needs one per round). */
  questionsReady(room) {
    if (room.game === QUIZ_GAME) return countQuestions(this.quizQuestions, room.config.quiz);
    if (room.game === GEO_GAME) return countGeoQuestions(this.geoQuestions, room.config.geo);
    if (room.game === HISTORY_GAME) return countHistoryQuestions(this.historyQuestions, room.config.history);
    if (room.game === MINES_GAME) return countMinesQuestions(this.minesQuestions, room.config.mines);
    return undefined;
  }

  /**
   * The current board of Campo de minas. The prompt shows from the countdown on; the cells' texts once the round is
   * playing. Whether a cell is right or a mine only goes out once someone picked it, and for every cell at the reveal.
   * `total` is how many right answers the board has and `found` how many were picked; `turn` is the turn being played
   * (the one a pick must name).
   */
  publicMinesQuestion(room, board) {
    const open = ["playing", "reveal", "finished"].includes(room.phase);
    const showAll = room.phase === "reveal" || room.phase === "finished";
    return {
      round: room.currentRound + 1,
      prompt: board.prompt,
      category: categoryName(board.category),
      difficulty: board.difficulty,
      // How this round is played: "turnos" or "carrera".
      style: board.style,
      turn: room.phase === "playing" ? room.turn : null,
      total: board.cells.filter((c) => c.correct).length,
      found: board.cells.filter((c) => c.correct && c.by).length,
      cells: open
        ? board.cells.map((c) => ({ text: c.text, by: c.by, turn: c.turn, correct: c.by || showAll ? c.correct : null }))
        : null,
    };
  }

  /**
   * The current question of Encuentra el país. Nothing of it shows during the countdown but its kind, so every player
   * gets the same seconds with it; the country to find goes out once the round is playing. The answer (where it is)
   * only goes out in `reveal`.
   */
  publicGeoQuestion(room, track) {
    const shown = ["playing", "reveal", "finished"].includes(room.phase);
    return {
      round: room.currentRound + 1,
      kind: track.kind,
      difficulty: track.difficulty,
      prompt: shown ? track.prompt : null,
      name: shown ? track.name : null,
    };
  }

  /**
   * The current event of Rango, with the name of its category. The event shows from the countdown on (everyone gets
   * the same seconds to read it); its range of years, and so the timeline, once the round is playing. The year only
   * goes out in `reveal`.
   */
  publicHistoryQuestion(room, track) {
    const open = ["playing", "reveal", "finished"].includes(room.phase);
    return {
      round: room.currentRound + 1,
      // "linea" (an event's year) or "cifras" (a number, with its unit and the step a guess moves in).
      kind: track.kind || "linea",
      prompt: track.prompt,
      category: track.category ? categoryName(track.category) : null,
      difficulty: track.difficulty,
      unit: track.kind === "cifras" ? track.unit : null,
      snap: track.kind === "cifras" && open ? track.snap : null,
      min: open ? track.min : null,
      max: open ? track.max : null,
    };
  }

  /**
   * The current question of Trivia, by how it's answered. Its text shows from the countdown on (everyone gets the
   * same seconds to read it); what to answer with (the options, the flag) once the round is
   * playing; the right answer, and how many players picked each option, only from the reveal on. No question id: with
   * it a player could recognise a question they have seen before (or look it up).
   */
  publicQuestion(room, question) {
    const open = ["playing", "reveal", "finished"].includes(room.phase);
    const showAnswer = room.phase === "reveal" || room.phase === "finished";
    const base = {
      round: room.currentRound + 1,
      type: question.type || "choice",
      text: question.text,
      category: question.category,
      difficulty: question.difficulty,
    };
    if (question.type === "open") {
      return {
        ...base,
        kind: question.kind,
        flag: open && question.flagToken ? flagUrl(question.flagToken) : null,
        answer: showAnswer ? question.answer : null,
      };
    }
    const picks = question.options.map(() => 0);
    if (showAnswer) {
      for (const p of room.players.values()) {
        if (Number.isInteger(p.lastAnswer?.choice)) picks[p.lastAnswer.choice] += 1;
      }
    }
    return {
      ...base,
      options: open ? question.options : null,
      answer: showAnswer ? question.answer : null,
      picks: showAnswer ? picks : null,
    };
  }
}
