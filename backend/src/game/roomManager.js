import { selectSongs } from "../catalog/songSelector.js";
import { hasRole } from "../auth/roles.js";
import { hydrateSong } from "../catalog/catalogProvider.js";
import { cleanTitle } from "../catalog/trackResolver.js";
import { applyMatchStats } from "../db/store.js";
import { isCorrectAnswer, normalizeAnswer } from "./answers.js";
import { COUNTDOWN_MS, REVEAL_MS, ROUND_MS, scoreAnswer } from "./scoring.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Games the host can move a room into (ids match frontend/src/modes/index.js). `null` is the Home screen.
export const GAME_IDS = ["musica"];
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
    rounds: 10,
    roundMs: ROUND_MS,
    playlistIds: playlist ? [playlist.id] : [],
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
  constructor({ catalog, store, resolver = null, reconnectGraceMs = RECONNECT_GRACE_MS }) {
    this.catalog = catalog;
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
    };
    this.rooms.set(code, room);
    this.addPlayer(room, host, true);
    return room;
  }

  addPlayer(room, user, isHost = false) {
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

  updateConfig(room, userId, config) {
    if (!this.canEditConfig(room, userId)) {
      throw new Error("No tienes permisos para configurar la partida");
    }
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
    const next = { ...room.config, ...config };
    // Same limits as the settings on screen: 5–25 rounds, 10–30 seconds to guess.
    if (config?.rounds != null) next.rounds = Math.min(25, Math.max(5, Math.round(Number(config.rounds)) || 10));
    if (config?.roundMs != null) next.roundMs = Math.min(30000, Math.max(10000, Math.round(Number(config.roundMs)) || ROUND_MS));
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

  /** Only an owner who is the room's host and has Spotify connected can add their playlists. */
  assertSpotifyHost(room, userId) {
    if (room.hostId !== userId) throw new Error("Solo el host puede añadir playlists de Spotify");
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
    this.assertSpotifyHost(room, userId);
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
    if (room.config?.customTracks?.length) return [];
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
    if (room.game !== "musica") throw new Error("Elige un juego antes de empezar");
    if (room.phase !== "lobby") throw new Error("La partida ya comenzó");
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (connected.length < 1) {
      throw new Error("Se necesita al menos 1 jugador");
    }
    room.currentRound = 0;
    if (room.config?.customTracks && room.config.customTracks.length > 0) {
      const shuffled = [...room.config.customTracks].sort(() => Math.random() - 0.5);
      room.tracks = shuffled.slice(0, Math.min(room.config.rounds || 10, shuffled.length));
      room.totalRounds = room.tracks.length;
    } else {
      room.tracks = [];
      room.totalRounds = room.config.rounds || 10;
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
      p.status = "jugando";
    });
    this.setPhase(room, "countdown", COUNTDOWN_MS, () => this.beginPlaying(room));
  }

  beginPlaying(room) {
    this.setPhase(room, "playing", room.config.roundMs || ROUND_MS, () => this.beginReveal(room));
  }

  beginReveal(room) {
    const track = room.tracks[room.currentRound];
    const now = Date.now();
    const duration = room.config.roundMs || ROUND_MS;
    room.players.forEach((player) => {
      if (!player.lastAnswer) {
        player.streak = 0;
        player.lastPoints = 0;
        player.lastAnswer = { text: "", correct: false, at: now };
      }
    });
    this.setPhase(room, "reveal", REVEAL_MS, () => this.advance(room));
    return { track, duration };
  }

  advance(room) {
    if (room.currentRound + 1 >= (room.totalRounds || room.tracks.length)) {
      this.finish(room);
      return;
    }
    room.currentRound += 1;
    this.beginCountdown(room);
  }

  finish(room) {
    room.phase = "finished";
    room.phaseEndsAt = null;
    if (room.timer) clearTimeout(room.timer);
    if (!room.statsApplied) {
      room.statsApplied = true;
      applyMatchStats(this.store, [...room.players.values()]);
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
    const correct = answerText === track.id || isCorrectAnswer(answerText, track);
    const scored = scoreAnswer({
      correct,
      remainingMs,
      durationMs: room.config.roundMs || ROUND_MS,
      streak: player.streak,
    });
    player.lastAnswer = {
      text: correct ? track.title : String(answerText),
      correct,
      at: Date.now(),
    };
    player.lastPoints = scored.points;
    player.streak = scored.streak;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    player.score += scored.points;
    if (correct) {
      player.correct += 1;
      player.answerTimes.push((room.config.roundMs || ROUND_MS) - remainingMs);
      if (!player.artistHits) player.artistHits = {};
      const artistKey = track.artistId || (track.artistName ? track.artistName.toLowerCase().replace(/\s+/g, "-") : "varios");
      player.artistHits[artistKey] = (player.artistHits[artistKey] || 0) + 1;
    }
    this.answered(room, player);
  }

  /** "Saltar": the player gives up on this round. No points, and the streak starts over. */
  skip(room, userId) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Jugador no encontrado");
    if (player.lastAnswer) return player.lastAnswer;
    if (room.phase !== "playing") throw new Error("No se aceptan respuestas ahora");
    player.lastAnswer = { text: "", correct: false, skipped: true, at: Date.now() };
    player.lastPoints = 0;
    player.streak = 0;
    this.answered(room, player);
  }

  // Once every connected player has answered (or skipped), the song is revealed without waiting for the clock.
  answered(room, player) {
    player.status = "respondió";
    this.onPhaseChange?.(room);
    const active = [...room.players.values()].filter((p) => p.connected);
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
      name: room.config.name || "Partida YOAVLLY",
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
      songsReady: room.phase === "lobby" ? this.songPool(room).length : undefined,
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
      coHosts: [...(room.coHosts || [])],
      players: [...room.players.values()].map((p) => publicPlayer(p, room.phase, room)),
      audio: null,
      reveal: null,
      results: null,
    };

    if (track && (room.phase === "countdown" || room.phase === "playing")) {
      payload.audio = {
        previewUrl: track.previewUrl,
        round: room.currentRound + 1,
      };
    }
    // Send full search catalog for autocomplete during playing phase
    if (room.phase === "playing") {
      payload.searchCatalog = this.buildSearchCatalog(room);
    }
    if (track && showTrack) {
      payload.reveal = hydrateSong(this.catalog, track);
    }
    if (room.phase === "finished") {
      const ranked = [...room.players.values()].sort((a, b) => b.score - a.score);
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
      }));
    }
    if (forUserId) {
      const me = room.players.get(forUserId);
      payload.me = me
        ? {
            id: me.id,
            lastPoints: me.lastPoints,
            lastAnswer: me.lastAnswer,
            isHost: room.hostId === forUserId,
            canEditConfig: this.canEditConfig(room, forUserId),
          }
        : null;
    }
    return payload;
  }
}
