import { selectSongs } from "../catalog/songSelector.js";
import { hasRole } from "../auth/roles.js";
import { hydrateSong } from "../catalog/catalogProvider.js";
import { cleanTitle } from "../catalog/trackResolver.js";
import { applyMatchStats } from "../db/store.js";
import { isCorrectAnswer, normalizeAnswer } from "./answers.js";
import { countQuestions, defaultQuizConfig, mergeQuizConfig, pickQuizQuestions, QUIZ_REVEAL_MS } from "./quiz.js";
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
import { flagToken, flagUrl } from "../geo/flags.js";
import { locate } from "../geo/worldMap.js";
import { COUNTDOWN_MS, REVEAL_MS, ROUND_MS, scoreAnswer } from "./scoring.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Games the host can move a room into (ids match frontend/src/modes/index.js). `null` is the Home screen.
// "mundo" (Geografía, GEO_GAME) asks capitals and flags (written answers checked by isCorrectOpenAnswer) and
// locations (a pin on the world map); "opciones" (Opción múltiple) is a multiple-choice quiz (QUIZ_GAME); "historia"
// (HISTORY_GAME) shows an event and players choose its year on a timeline. All three keep their questions in
// room.tracks, in place of songs.
export const GAME_IDS = ["musica", "opciones", "mundo", "historia"];
// "Opción múltiple": its settings live in config.quiz and its questions take the place of songs in room.tracks.
export const QUIZ_GAME = "opciones";
// The games that ask questions instead of playing songs.
const QUESTION_GAMES = [QUIZ_GAME, GEO_GAME, HISTORY_GAME];
// Custom playlists from an owner's Spotify go in config.playlistIds with this prefix ("sp:<spotify playlist id>").
export const SPOTIFY_PREFIX = "sp:";
// Rounds are chosen this many rounds ahead, so their audio and cover are downloaded before they start.
const LOOKAHEAD = 2;
// How long a dropped player keeps their seat (and host role) so a reload or network blip doesn't kick them.
const RECONNECT_GRACE_MS = 20000;

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

// A new room plays the catalog's default playlist.
function defaultConfig(catalog) {
  const playlist = catalog?.playlists?.find((p) => p.isDefault) || catalog?.playlists?.[0];
  return {
    rounds: 5,
    roundMs: ROUND_MS,
    playlistIds: playlist ? [playlist.id] : [],
    quiz: defaultQuizConfig(),
    geo: defaultGeoConfig(),
    history: defaultHistoryConfig(),
  };
}

function publicPlayer(player, phase, room) {
  const showAnswer = phase === "reveal" || phase === "finished";
  const isHost = Boolean(room && room.hostId === player.id);
  const canEditConfig = isHost || Boolean(room?.coHosts?.includes(player.id));
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    isGuest: Boolean(player.isGuest),
    status: player.status,
    score: player.score,
    correct: player.correct,
    streak: player.streak,
    bestStreak: player.bestStreak,
    answered: Boolean(player.lastAnswer),
    lastPoints: player.lastPoints || 0,
    lastAnswer: showAnswer ? player.lastAnswer : null,
    connected: player.connected,
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
    player.status = room.phase === "lobby" ? "conectado" : "jugando";
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
    return { room, left: true };
  }

  transferHost(room) {
    const next = [...room.players.values()].find((p) => p.connected);
    room.hostId = next ? next.id : null;
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
    // Same limits as the settings on screen: 5–25 rounds, 15–35 seconds to guess.
    if (config?.rounds != null) next.rounds = Math.min(25, Math.max(5, Math.round(Number(config.rounds)) || 5));
    if (config?.roundMs != null) next.roundMs = Math.min(35000, Math.max(15000, Math.round(Number(config.roundMs)) || ROUND_MS));
    if (config?.playlistIds) {
      // Spotify playlists can only be added by the host (addSpotifyPlaylist); here they can only stay or go.
      const known = new Set([...this.catalog.playlists.map((p) => p.id), ...Object.keys(room.customPlaylists || {})]);
      next.playlistIds = [...new Set(config.playlistIds)].filter((id) => known.has(id));
      if (!next.playlistIds.length) throw new Error("Elige al menos una playlist");
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

  /** Every song the match can draw from right now: the chosen catalog playlists plus the playable Spotify songs. */
  songPool(room) {
    const ids = room.config.playlistIds || [];
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
      const track = list[Math.floor(Math.random() * list.length)];
      room.tracks.push(track);
      added.push(track);
    }
    if (added.length) this.onNewTracks?.(added);
    return added;
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
    room.currentRound = 0;
    if (room.game === QUIZ_GAME) {
      const quiz = mergeQuizConfig(room.config.quiz);
      const available = countQuestions(this.questions, quiz.difficulty);
      if (available < quiz.rounds) {
        throw new Error(`Solo hay ${available} preguntas de esa dificultad. Baja el número de preguntas.`);
      }
      room.tracks = pickQuizQuestions(this.questions, quiz.rounds, quiz.difficulty);
      room.totalRounds = room.tracks.length;
    } else if (room.game === GEO_GAME) {
      // Geografía: the match's questions are drawn now (they are the "tracks" of the room).
      const geo = mergeGeoConfig(room.config.geo);
      const tracks = pickGeoQuestions(this.geoQuestions, geo);
      if (tracks.length < geo.rounds) {
        throw new Error(`Solo hay ${tracks.length} preguntas con esos ajustes para ${geo.rounds} rondas. Baja las rondas o elige más tipos.`);
      }
      // Flags are shown through a token, so the image's address doesn't name the country.
      for (const t of tracks) if (t.flag) t.flagToken = flagToken(t.flag);
      room.tracks = tracks;
      room.totalRounds = tracks.length;
      room.tiebreak = null;
    } else if (room.game === HISTORY_GAME) {
      // Historia: the match's events are drawn now, each with its own range of years.
      const history = mergeHistoryConfig(room.config.history);
      const tracks = pickHistoryQuestions(this.historyQuestions, history);
      if (tracks.length < history.rounds) {
        throw new Error(`Solo hay ${tracks.length} eventos con esos ajustes para ${history.rounds} rondas. Baja las rondas o elige más épocas.`);
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
        throw new Error(loading ? "Tus canciones de Spotify se están cargando, espera unos segundos" : "Ninguna canción cumple esos filtros");
      }
      // Every round gets a different song: with fewer songs than rounds the same ones would keep coming back.
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
   * The autocomplete list sent to players during a round: only the songs of the playlists being played (the chosen
   * catalog playlists and every song of the chosen Spotify ones), plus custom tracks if available.
   */
  buildSearchCatalog(room) {
    const allSongs = [];
    const seen = new Set();

    // Only the songs of the chosen playlists (the same catalog part as songPool); the whole catalog without a room.
    const ids = room?.config?.playlistIds || [];
    const catalogIds = ids.filter((id) => !id.startsWith(SPOTIFY_PREFIX));
    const hasSpotify = ids.some((id) => room?.customPlaylists?.[id]);
    let catalogSongs = this.catalog.songs;
    if (room?.config?.customTracks?.length) catalogSongs = [];
    else if (room) catalogSongs = catalogIds.length || !hasSpotify ? selectSongs(this.catalog, { playlistIds: catalogIds }) : [];
    for (const s of catalogSongs) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      allSongs.push({
        id: s.id,
        title: s.title,
        artistName: s.artistName || "Artista",
      });
    }

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

    // Also add room tracks (in case they came from Spotify playlists)
    for (const s of (room?.tracks || [])) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      allSongs.push({
        id: s.id,
        title: s.title,
        artistName: s.artistName || "Artista",
      });
    }

    return allSongs;
  }

  beginCountdown(room) {
    this.pickAhead(room);
    const track = room.tracks[room.currentRound];
    room.currentTrackId = track.id;
    room.answers = {};
    room.players.forEach((p) => {
      p.lastAnswer = null;
      p.lastPoints = 0;
      p.pin = null;
      p.guess = null;
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
    return room.config.roundMs || ROUND_MS;
  }

  /** Geografía's "Ubicación" rounds (and every tiebreak): a pin on the world map instead of a written answer. */
  isMapRound(room) {
    return room.game === GEO_GAME && room.tracks[room.currentRound]?.kind === "location";
  }

  /** Historia's rounds: a year on the timeline instead of a written answer. */
  isYearRound(room) {
    return room.game === HISTORY_GAME && Boolean(room.tracks[room.currentRound]);
  }

  /** During a tiebreak only the tied players answer; the rest of the room watches. */
  isPlaying(room, userId) {
    return !room.tiebreak || room.tiebreak.playerIds.includes(userId);
  }

  beginPlaying(room) {
    this.setPhase(room, "playing", this.roundMs(room), () => this.beginReveal(room));
  }

  beginReveal(room) {
    const track = room.tracks[room.currentRound];
    const now = Date.now();
    const duration = this.roundMs(room);
    if (room.game === QUIZ_GAME && track) this.gradeQuiz(room, track);
    if (this.isMapRound(room)) this.gradeMap(room, track);
    if (this.isYearRound(room)) this.gradeYears(room, track);
    room.players.forEach((player) => {
      if (!player.lastAnswer && this.isPlaying(room, player.id)) {
        player.streak = 0;
        player.lastPoints = 0;
        player.lastAnswer = { text: "", correct: false, at: now };
      }
    });
    let revealMs = REVEAL_MS;
    if (room.game === QUIZ_GAME) revealMs = QUIZ_REVEAL_MS;
    else if (this.isMapRound(room)) revealMs = LOCATION_REVEAL_MS;
    else if (this.isYearRound(room)) revealMs = HISTORY_REVEAL_MS;
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
    const connected = [...room.players.values()].filter((p) => p.connected);
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
    return [...room.players.values()].sort((a, b) => b.score - a.score || (b.id === winnerId) - (a.id === winnerId));
  }

  finish(room) {
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

  // Moves the whole room into another game (or back to the Home screen with `null`), abandoning any match in progress.
  setGame(room, userId, game) {
    if (room.hostId !== userId) throw new Error("Solo el Host puede cambiar de juego");
    const next = assertGame(game ?? null);
    this.resetMatch(room);
    room.game = next;
  }

  resetMatch(room) {
    if (room.timer) clearTimeout(room.timer);
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
    for (const [id, p] of room.players) {
      // Players who left mid-match (and aren't reconnecting) have no seat in a fresh lobby.
      if (!p.connected && !p.dropTimer) {
        room.players.delete(id);
        room.coHosts = (room.coHosts || []).filter((c) => c !== id);
        continue;
      }
      p.score = 0;
      p.correct = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.answerTimes = [];
      p.lastAnswer = null;
      p.lastPoints = 0;
      p.pin = null;
      p.guess = null;
      p.status = p.connected ? "conectado" : "desconectado";
    }
  }


  submitAnswer(room, userId, answerText) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");

    // If already answered this round, gracefully accept without throwing duplicate error
    if (player.lastAnswer) {
      return player.lastAnswer;
    }
    if (room.game === QUIZ_GAME) return this.submitQuizAnswer(room, player, answerText);
    if (this.isMapRound(room)) throw new Error("Toca el mapa para poner tu pin");
    if (this.isYearRound(room)) throw new Error("Elige el año en la línea del tiempo");

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
    const questionGame = room.game === GEO_GAME;
    if (questionGame) answerText = String(answerText ?? "").slice(0, 100);
    const correct = questionGame
      ? isCorrectOpenAnswer(answerText, track)
      : answerText === track.id || isCorrectAnswer(answerText, track);
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
    if (!this.isYearRound(room)) throw new Error("Esta ronda no es de Historia");
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
      players: [...room.players.values()].map((p) => publicPlayer(p, room.phase, room)),
      audio: null,
      reveal: null,
      question: null,
      results: null,
    };

    if (room.game === QUIZ_GAME) {
      if (track) payload.question = this.publicQuestion(room, track);
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
      if (track && showTrack) payload.reveal = { prompt: track.prompt, year: track.year, min: track.min, max: track.max };
    } else if (track && (room.phase === "countdown" || room.phase === "playing")) {
      payload.audio = {
        previewUrl: track.previewUrl,
        round: room.currentRound + 1,
      };
    }
    // Send full search catalog for autocomplete during playing phase
    const songRound = !QUESTION_GAMES.includes(room.game);
    if (room.phase === "playing" && songRound) {
      payload.searchCatalog = this.buildSearchCatalog(room);
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
    if (room.game === QUIZ_GAME) return countQuestions(this.questions, mergeQuizConfig(room.config.quiz).difficulty);
    if (room.game === GEO_GAME) return countGeoQuestions(this.geoQuestions, room.config.geo);
    if (room.game === HISTORY_GAME) return countHistoryQuestions(this.historyQuestions, room.config.history);
    return undefined;
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
   * The current event of Historia. The event shows from the countdown on (everyone gets the same seconds to read it);
   * its range of years, and so the timeline, once the round is playing. The year only goes out in `reveal`.
   */
  publicHistoryQuestion(room, track) {
    const open = ["playing", "reveal", "finished"].includes(room.phase);
    return {
      round: room.currentRound + 1,
      prompt: track.prompt,
      era: track.era,
      difficulty: track.difficulty,
      min: open ? track.min : null,
      max: open ? track.max : null,
    };
  }

  /**
   * The current question of Opción múltiple. The options only show once the round is playing; which one is right,
   * and how many players picked each, only from the reveal on.
   */
  publicQuestion(room, question) {
    const showOptions = ["playing", "reveal", "finished"].includes(room.phase);
    const showAnswer = room.phase === "reveal" || room.phase === "finished";
    const picks = question.options.map(() => 0);
    if (showAnswer) {
      for (const p of room.players.values()) {
        if (Number.isInteger(p.lastAnswer?.choice)) picks[p.lastAnswer.choice] += 1;
      }
    }
    // No question id: with it a player could recognise a question they have seen before (or look it up).
    return {
      round: room.currentRound + 1,
      text: question.text,
      category: question.category,
      difficulty: question.difficulty,
      options: showOptions ? question.options : null,
      answer: showAnswer ? question.answer : null,
      picks: showAnswer ? picks : null,
    };
  }
}
