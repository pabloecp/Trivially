import { pickRoundTracks } from "../catalog/songSelector.js";
import { hydrateSong, findArtist } from "../catalog/catalogProvider.js";
import { applyMatchStats } from "../db/store.js";
import { isCorrectAnswer, normalizeAnswer } from "./answers.js";
import { COUNTDOWN_MS, REVEAL_MS, ROUND_MS, scoreAnswer } from "./scoring.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Games the host can move a room into (ids match frontend/src/modes/index.js). `null` is the Home screen.
export const GAME_IDS = ["musica"];
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

function defaultConfig() {
  return {
    rounds: 5,
    roundMs: ROUND_MS,
    enabledCategories: ["artist"],
    artistIds: ["bad-bunny", "mora", "rauw-alejandro", "travis-scott", "drake", "jvke"],
    genreIds: [],
    albumIds: [],
    playlistIds: [],
    yearFrom: null,
    yearTo: null,
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
  constructor({ catalog, store, reconnectGraceMs = RECONNECT_GRACE_MS }) {
    this.catalog = catalog;
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
      currentTrackId: null,
      answers: {},
      timer: null,
      config: { ...defaultConfig(), ...config },
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
    room.config = { ...room.config, ...config };
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
    let tracks = [];
    if (room.config?.customTracks && room.config.customTracks.length > 0) {
      const pool = room.config.customTracks;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const rounds = Math.min(room.config.rounds || 5, shuffled.length);
      for (let i = 0; i < rounds; i += 1) {
        tracks.push(shuffled[i % shuffled.length]);
      }
    } else {
      tracks = pickRoundTracks(this.catalog, room.config, room.config.rounds);
    }
    if (!tracks.length) throw new Error("Ninguna canción cumple esos filtros");
    room.tracks = tracks;
    room.currentRound = 0;
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
   * Build the full searchable song list for the current round.
   * This is sent to clients for autocomplete. It includes all catalog songs
   * plus custom tracks if available.
   */
  buildSearchCatalog(room) {
    const allSongs = [];
    const seen = new Set();

    // Add all catalog songs
    for (const s of this.catalog.songs) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const artist = findArtist(this.catalog, s.artistId);
      allSongs.push({
        id: s.id,
        title: s.title,
        artistName: s.artistName || artist?.name || "Artista",
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

    // Also add room tracks (in case they came from Spotify playlists)
    for (const s of (room?.tracks || [])) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      allSongs.push({
        id: s.id,
        title: s.title,
        artistName: s.artistName || findArtist(this.catalog, s.artistId)?.name || "Artista",
      });
    }

    return allSongs;
  }

  beginCountdown(room) {
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
    if (room.currentRound + 1 >= room.tracks.length) {
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
      totalRounds: room.tracks.length || room.config.rounds,
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
