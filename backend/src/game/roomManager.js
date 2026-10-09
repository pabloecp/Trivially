import { selectSongs } from "../catalog/songSelector.js";
import { hasRole } from "../auth/roles.js";
import { hydrateSong } from "../catalog/catalogProvider.js";
import { cleanTitle } from "../catalog/trackResolver.js";
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
  LOCATION_ROUND_MS,
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
import { categoryName } from "../questions/questionSchema.js";
import { flagToken, flagUrl } from "../geo/flags.js";
import { locate } from "../geo/worldMap.js";
import { COUNTDOWN_MS, REVEAL_MS, ROUND_MS, scoreAnswer } from "./scoring.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Games the host can move a room into (ids match frontend/src/modes/index.js). `null` is the Home screen.
// "opciones" (Trivia, QUIZ_GAME) is the main mode: questions of every topic, each answered its own way (four
// options, a written answer or a year on a timeline). The extras: "musica" (Adivina la canción), "mundo" (Encuentra el país,
// GEO_GAME: capitals and flags written, and countries pinned on the world map), "historia" (Rango, HISTORY_GAME:
// getting as close as you can on a range; for now only "Línea del tiempo", an event's year) and "minas" (Campo de minas, MINES_GAME: a prompt and a 5 × 5 board of
// answers, some right and some mines, picked one per turn). The question games keep their questions in room.tracks,
// in place of songs.
export const GAME_IDS = ["musica", "opciones", "mundo", "historia", "minas"];
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

export function assertGame(game) {
  if (game === null || GAME_IDS.includes(game)) return game;
  throw new Error("Ese juego no está disponible");
}

export function createRoomCode(existing) {
  let code = "";
  do {
    code = "XO";
    for (let i = 0; i < 4; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (existing.has(code));
  return code;
}

// Adivina la canción's ways of answering ("Modos"): closed questions, four songs to choose from ("opciones"), and open
// ones, the title typed in the search box ("escribir"). Both are ticked in a new room; the rounds are shared evenly.
export const MUSIC_FORMATS = ["opciones", "escribir"];

// A new room plays every playlist of the catalog (Top 500 Español and Top 500 Inglés).
function defaultConfig(catalog) {
  return {
    rounds: 5,
    roundMs: ROUND_MS,
    playlistIds: (catalog?.playlists || []).map((p) => p.id),
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
    status: player.status,
    score: player.score,
    correct: player.correct,
    streak: player.streak,
    bestStreak: player.bestStreak,
    answered,
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

  create({ host, mode, config, game = null }) {
    const code = createRoomCode(this.rooms);
    const room = {
      code,
      mode: mode || "multi",
      game: assertGame(game),
      hostId: host.id,
      coHosts: [],
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
      config: { ...defaultConfig(this.catalog), ...config },
      players: new Map(),
      // The room's scoreboard across its matches: how many were finished, and per player (even one who left) their
      // name, avatar, matches played and wins.
      board: { matches: 0, players: {} },
    };
    this.rooms.set(code, room);
    this.addPlayer(room, host, true);
    return room;
  }

  addPlayer(room, user, isHost = false) {
    if (room.kicked?.has(user.id)) throw new Error("El anfitrión te sacó de esta sala");
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

  // Explicit "leave room".
  leave(socketId) {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return null;
    const room = this.get(ref.code);
    this.socketToRoom.delete(socketId);
    if (!room) return null;
    return this.removePlayer(room, ref.userId);
  }

  // Lost connection: keep the seat for a grace period in case the player comes back.
  disconnect(socketId) {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return null;
    this.socketToRoom.delete(socketId);
    const room = this.get(ref.code);
    if (!room) return null;
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
    if (![...room.players.values()].some((p) => p.connected)) {
      this.destroy(room);
      return { room: null, left: true };
    }
    this.checkMinesTurn(room);
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
    clearTimeout(room.progressTimer);
    room.players.forEach((p) => {
      clearTimeout(p.dropTimer);
      if (p.socketId) this.socketToRoom.delete(p.socketId);
    });
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

  // The host removes a player for good: their seat goes (even mid-match) and they can't join this room again.
  kick(room, hostUserId, targetUserId) {
    if (!room) throw new Error("Sala no encontrada");
    if (room.hostId !== hostUserId) throw new Error("Solo el anfitrión puede sacar jugadores");
    if (hostUserId === targetUserId) throw new Error("No puedes sacarte a ti mismo");
    const player = room.players.get(targetUserId);
    if (!player) throw new Error("El jugador no está en la sala");
    clearTimeout(player.dropTimer);
    if (player.socketId) this.socketToRoom.delete(player.socketId);
    room.players.delete(targetUserId);
    room.coHosts = (room.coHosts || []).filter((id) => id !== targetUserId);
    room.kicked ||= new Set();
    room.kicked.add(targetUserId);
    this.checkMinesTurn(room);
    return { socketId: player.socketId, name: player.name };
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
    if (config?.rounds != null) next.rounds = Math.min(25, Math.max(5, Math.round(Number(config.rounds)) || 5));
    if (config?.roundMs != null) next.roundMs = Math.min(35000, Math.max(15000, Math.round(Number(config.roundMs)) || ROUND_MS));
    // Adivina la canción's ways of answering; both may be unticked (the match then can't start).
    if (Array.isArray(config?.formats)) next.formats = MUSIC_FORMATS.filter((f) => config.formats.includes(f));
    if (config?.playlistIds) {
      // Spotify playlists can only be added by the host (addSpotifyPlaylist); here they can only stay or go.
      const known = new Set([...this.catalog.playlists.map((p) => p.id), ...Object.keys(room.customPlaylists || {})]);
      // All of them may be unticked: the match then has no songs and can't start.
      next.playlistIds = [...new Set(config.playlistIds)].filter((id) => known.has(id));
    }
    room.config = next;
    for (const entry of Object.values(room.customPlaylists || {})) {
      const wasActive = entry.active;
      entry.active = room.config.playlistIds.includes(entry.id);
      if (entry.active && !wasActive) this.loadPlaylist(room, entry);
    }
  }

  /**
   * Adding Spotify playlists: an owner with Spotify connected who may change the room's settings (the host, or a
   * player the host gave permission to). Their own Spotify is the one read.
   */
  assertSpotifyEditor(room, userId) {
    if (!this.canEditConfig(room, userId)) throw new Error("Necesitas permiso del host para cambiar las playlists");
    const user = this.store?.users?.[userId];
    if (!user || !hasRole(user, "owner")) throw new Error("Las playlists de Spotify son solo para owners");
    if (!user.spotify) throw new Error("Conecta tu Spotify en tu perfil primero");
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
  }

  /**
   * Adds (and selects) one of the host's Spotify playlists, read by catalog/spotifyLibrary.js. Its songs are looked
   * up on iTunes in the background; the match can start as soon as any song of the selection is playable.
   */
  addSpotifyPlaylist(room, userId, playlist) {
    this.assertSpotifyEditor(room, userId);
    const id = `${SPOTIFY_PREFIX}${playlist.id}`;
    let entry = room.customPlaylists[id];
    if (!entry) {
      entry = { id, name: playlist.name, image: playlist.image, tracks: playlist.tracks, songs: new Map(), done: new Set(), active: true };
      room.customPlaylists[id] = entry;
    }
    entry.active = true;
    if (!room.config.playlistIds.includes(id)) room.config = { ...room.config, playlistIds: [...room.config.playlistIds, id] };
    this.loadPlaylist(room, entry);
    return entry;
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
          if (song) entry.songs.set(spotifyId, song);
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
   * Every song the match can draw from right now: the chosen catalog playlists plus the playable Spotify songs. With
   * every playlist unticked there are none.
   */
  songPool(room) {
    const ids = room.config.playlistIds || [];
    if (Array.isArray(room.config.playlistIds) && !ids.length && this.catalog.playlists?.length) return [];
    const custom = ids.map((id) => room.customPlaylists?.[id]).filter(Boolean);
    const catalogIds = ids.filter((id) => !id.startsWith(SPOTIFY_PREFIX));
    // With only Spotify playlists chosen, the default playlist isn't mixed in.
    const pool = catalogIds.length || !custom.length ? selectSongs(this.catalog, { playlistIds: catalogIds }) : [];
    const seen = new Set(pool.map((s) => s.id));
    for (const entry of custom) {
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
   * right one and three others of the songs being played (other titles), shuffled; `answer` is the right one's position.
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
    const label = (s) => (s.artistName ? `${s.title} - ${s.artistName}` : s.title);
    const keys = new Set([songKey(song)]);
    const others = [];
    // The room's songs first; the whole catalog when they are too few for three wrong answers.
    for (const from of [pool, this.catalog.songs || []]) {
      const shuffled = [...from].sort(() => Math.random() - 0.5);
      for (const s of shuffled) {
        if (others.length >= 3) break;
        if (!s?.title || keys.has(songKey(s))) continue;
        keys.add(songKey(s));
        others.push(s);
      }
    }
    if (others.length < 3) return { ...song, type: "open" };
    const options = [song, ...others].sort(() => Math.random() - 0.5);
    return { ...song, type: "choice", options: options.map(label), answer: options.indexOf(song) };
  }

  updatePlayer(room, userId, { name, avatar }) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    if (name && name.trim()) player.name = name.trim();
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
      // Geografía: the match's questions are drawn now (they are the "tracks" of the room).
      const geo = mergeGeoConfig(room.config.geo);
      if (!geo.kinds.length) throw new Error("Elige al menos un tipo de pregunta");
      if (!geo.difficulties.length) throw new Error("Elige al menos una dificultad");
      const tracks = pickGeoQuestions(this.geoQuestions, geo);
      if (tracks.length < geo.rounds) {
        throw new Error(`Solo hay ${tracks.length} preguntas con esos ajustes para ${geo.rounds} rondas. Baja las rondas o elige más tipos o dificultades.`);
      }
      // Flags are shown through a token, so the image's address doesn't name the country.
      for (const t of tracks) if (t.flag) t.flagToken = flagToken(t.flag);
      room.tracks = tracks;
      room.totalRounds = tracks.length;
      room.tiebreak = null;
    } else if (room.game === HISTORY_GAME) {
      // Rango: the match's events are drawn now, each with its own range of years.
      const history = mergeHistoryConfig(room.config.history);
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
      const loading = (room.config.playlistIds || []).some((id) => {
        const entry = room.customPlaylists?.[id];
        return entry && entry.done.size < entry.tracks.length;
      });
      if (!available) {
        if (!(room.config.playlistIds || []).length) throw new Error("Elige al menos una playlist");
        throw new Error(loading ? "Tus canciones de Spotify se están cargando, espera unos segundos" : "Ninguna canción cumple esos filtros");
      }
      // Every round gets a different song: with fewer songs than rounds the same ones would keep coming back.
      if (!this.musicFormats(room).length) throw new Error("Elige al menos un modo de juego");
      if (available < room.totalRounds) {
        throw new Error(
          `Solo hay ${available} ${available === 1 ? "canción lista" : "canciones listas"} para ${room.totalRounds} rondas. ` +
            (loading ? "Espera a que carguen más o baja las rondas." : "Baja las rondas o elige más playlists.")
        );
      }
    }
    connected.forEach((p) => {
      p.score = 0;
      p.correct = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.answerTimes = [];
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
        list.push({ id: s.id, title: s.title, artistName: s.artistName || "Artista" });
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

    // Every song of the chosen Spotify playlists, found on iTunes yet or not.
    for (const id of room?.config?.playlistIds || []) {
      const entry = room.customPlaylists?.[id];
      if (!entry) continue;
      for (const t of entry.tracks) {
        const song = entry.songs.get(t.spotifyId);
        const id = song?.id || `sp-${t.spotifyId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        allSongs.push({ id, title: song?.title || cleanTitle(t.title), artistName: song?.artistName || t.artists.join(" & ") || "Artista" });
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
    if (room.game === QUIZ_GAME) return mergeQuizConfig(room.config.quiz).roundMs;
    if (room.game === GEO_GAME) {
      if (this.isMapRound(room)) return LOCATION_ROUND_MS;
      return mergeGeoConfig(room.config.geo).roundMs;
    }
    if (room.game === HISTORY_GAME) return mergeHistoryConfig(room.config.history).roundMs;
    // Campo de minas: the time of each turn (a round has as many as it takes), or of the whole round in a race.
    if (room.game === MINES_GAME) {
      const mines = mergeMinesConfig(room.config.mines);
      return this.isMinesRace(room) ? mines.roundMs : mines.turnMs;
    }
    return room.config.roundMs || ROUND_MS;
  }

  /** Geografía's "Ubicación" rounds (and every tiebreak): a pin on the world map instead of a written answer. */
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
    room.players.forEach((player) => {
      if (!player.lastAnswer && this.isPlaying(room, player.id)) {
        player.streak = 0;
        player.lastPoints = 0;
        player.lastAnswer = { text: "", correct: false, at: now };
      }
    });
    let revealMs = REVEAL_MS;
    if (this.isMapRound(room)) revealMs = LOCATION_REVEAL_MS;
    else if (this.isYearRound(room)) revealMs = HISTORY_REVEAL_MS;
    else if (room.game === QUIZ_GAME) revealMs = QUIZ_REVEAL_MS;
    else if (this.isMinesRound(room)) revealMs = MINES_REVEAL_MS;
    this.setPhase(room, "reveal", revealMs, () => this.advance(room));
    return { track, duration };
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
      applyMatchStats(this.store, ranked);
      this.recordWin(room, ranked);
    }
  }

  /**
   * Adds a finished match to the room's scoreboard. The winner is first place with points; a tie for first counts
   * for nobody unless a tiebreak settled it.
   */
  recordWin(room, ranked) {
    if (!ranked.length) return;
    const board = room.board || (room.board = { matches: 0, players: {} });
    board.matches += 1;
    const [first, second] = ranked;
    const tied = second && second.score === first.score && first.id !== room.tiebreak?.winnerId;
    const winnerId = first.score > 0 && !tied ? first.id : null;
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

  restart(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede reiniciar la sala");
    this.resetMatch(room);
  }

  /**
   * "Volver a jugar", once a match is over: a new one of the same game with the same settings, straight away. If it
   * can't start (not enough songs any more...), the room is left in that game's lobby and the reason is thrown.
   */
  replay(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede empezar otra partida");
    if (room.phase !== "finished") throw new Error("La partida aún no ha terminado");
    this.resetMatch(room);
    this.start(room, userId);
  }

  // Moves the whole room into another game (or back to the Home screen with `null`), abandoning any match in progress.
  setGame(room, userId, game) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede cambiar de juego");
    const next = assertGame(game ?? null);
    this.resetMatch(room);
    room.game = next;
    room.preview = null;
    room.suggestions = [];
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
    if (room.phase === "countdown" || room.phase === "playing") throw new Error("El chat se pausa mientras se juega la ronda");
    const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!clean) throw new Error("Escribe un mensaje");
    const now = Date.now();
    if (now - (player.chattedAt || 0) < CHAT_GAP_MS) throw new Error("Espera un momento antes de mandar otro mensaje");
    player.chattedAt = now;
    room.chatSeq = (room.chatSeq || 0) + 1;
    room.chat = [...(room.chat || []), { id: room.chatSeq, userId, name: player.name, avatar: player.avatar, text: clean, at: now }].slice(
      -CHAT_KEEP
    );
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
    const questionGame = room.game === GEO_GAME || room.game === QUIZ_GAME;
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
    const year = Number(value?.year);
    if (!Number.isInteger(year) || year < track.min || year > track.max) throw new Error("Elige un año de la línea del tiempo");
    if (year === 0) throw new Error("El año 0 no existe");
    if (year > currentYear()) throw new Error("Ese año aún no ha llegado");
    player.guess = { year, at: Date.now() };
    if (!value.lock) return false;

    player.lastAnswer = { year, at: player.guess.at, locked: true };
    if (room.tiebreak && year === track.year) {
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
    for (const player of room.players.values()) {
      if (!this.isPlaying(room, player.id)) continue;
      if (!player.lastAnswer && player.guess) {
        player.lastAnswer = { year: player.guess.year, at: player.guess.at, locked: false };
      }
      const answer = player.lastAnswer;
      if (!Number.isInteger(answer?.year)) continue;
      const diff = yearsApart(answer.year, track.year);
      answer.diff = diff;
      answer.correct = diff === 0;
      answer.text = diff === 0 ? `${yearLabel(answer.year)}, año exacto` : `${yearLabel(answer.year)}, a ${diff} ${diff === 1 ? "año" : "años"}`;
      if (room.tiebreak) continue;
      const points = yearPoints(diff, track.era);
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
      (p) => p.connected && p.minefield && !p.minefield.out && p.minefield.pickedTurn !== room.turn
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
    const label = (song) => (song.artistName ? `${song.title} - ${song.artistName}` : song.title);
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
    this.onPhaseChange?.(room);
    const active = [...room.players.values()].filter((p) => p.connected && this.isPlaying(room, p.id));
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
      songsReady: room.phase === "lobby" && !QUESTION_GAMES.includes(room.game) ? this.songPool(room).length : undefined,
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
        loading: e.active && (e.done.size < e.tracks.length || this.missingSongs(e).length > 0),
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
      // The room's chat, oldest first (sendChat).
      chat: room.chat || [],
      // What the host is pointing at on the game menu (null once a game is picked).
      preview: room.game ? null : room.preview || null,
      // Games the other players suggested to the host, newest last (only while the room is on the menu).
      suggestions: room.game
        ? []
        : (room.suggestions || [])
            .filter((s) => room.players.has(s.userId) && Date.now() - s.at < SUGGESTION_TTL_MS)
            .map((s) => ({ userId: s.userId, name: room.players.get(s.userId).name, game: s.game, at: s.at })),
      players: [...room.players.values()].map((p) => publicPlayer(p, room.phase, room)),
      audio: null,
      reveal: null,
      question: null,
      results: null,
    };

    if (room.game === QUIZ_GAME) {
      if (track) payload.question = this.publicQuestion(room, track);
      // In the lobby: how many questions each topic and way of answering has, for the settings' chips.
      if (room.phase === "lobby") payload.questionCounts = questionCounts(this.quizQuestions, room.config.quiz);
    } else if (room.game === GEO_GAME) {
      if (track) payload.question = this.publicGeoQuestion(room, track);
      if (track && showTrack) {
        payload.reveal = {
          kind: track.kind,
          prompt: track.prompt,
          answer: track.answer,
          name: track.name,
          flag: track.flagToken ? flagUrl(track.flagToken) : null,
          map: track.map,
        };
      }
    } else if (room.game === HISTORY_GAME) {
      if (track) payload.question = this.publicHistoryQuestion(room, track);
      // In the lobby: how many events each topic, age and difficulty has, for the settings' chips.
      if (room.phase === "lobby") payload.questionCounts = historyCounts(this.historyQuestions, room.config.history);
      if (track && showTrack) payload.reveal = { prompt: track.prompt, year: track.year, min: track.min, max: track.max };
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
      }));
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
            // Historia: the year this player has on the timeline, not locked yet.
            guess: me.guess ? me.guess.year : null,
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
   * The current question of Geografía. Nothing of it shows during the countdown but its kind, so every player gets
   * the same seconds with it. A flag goes out as a token address (never the country code); a map round sends the
   * country to find. The answer only goes out in `reveal`.
   */
  publicGeoQuestion(room, track) {
    const shown = ["playing", "reveal", "finished"].includes(room.phase);
    return {
      round: room.currentRound + 1,
      kind: track.kind,
      difficulty: track.difficulty,
      prompt: shown ? track.prompt : null,
      name: shown && track.kind === "location" ? track.name : null,
      flag: shown && track.flagToken ? flagUrl(track.flagToken) : null,
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
      prompt: track.prompt,
      category: track.category ? categoryName(track.category) : null,
      difficulty: track.difficulty,
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
