import { verifySocketToken } from "../auth/socketToken.js";
import { prefetchMedia } from "../audio/mediaCache.js";
import { readSpotifyPlaylist } from "../catalog/spotifyLibrary.js";

export function attachSockets(io, rooms) {
  // Who this connection is comes only from the signed token, never from ids the client puts in payloads.
  io.use((socket, next) => {
    socket.data.userId = verifySocketToken(socket.handshake.auth?.token);
    next();
  });

  // Rounds are chosen a little ahead during the match; their audio and covers start downloading right then.
  rooms.onNewTracks = (tracks) => prefetchMedia(tracks);

  rooms.onPhaseChange = (room) => {
    if (room && room.code) {
      io.to(room.code).emit("room:state", rooms.publicState(room));
    }
  };

  io.on("connection", (socket) => {
    socket.on("identify", (profile) => {
      try {
        bindUser(socket, profile, rooms);
      } catch {}
    });

    socket.on("room:create", (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        leaveCurrentRoom(io, rooms, socket);
        const room = rooms.create({
          host: user,
          mode: payload.mode || "multi",
          config: payload.config || {},
          // Older clients don't send `game` and expect to land in the song lobby.
          game: payload.game === undefined ? "musica" : payload.game,
        });
        socket.join(room.code);
        ack?.({ ok: true, state: rooms.publicState(room, user.id) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:join", (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        const room = rooms.get(payload.code || "");
        if (!room) throw new Error("Sala no encontrada");
        leaveCurrentRoom(io, rooms, socket, room.code);
        rooms.addPlayer(room, user);
        socket.join(room.code);
        ack?.({ ok: true, state: rooms.publicState(room, user.id) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:leave", (ack) => {
      leaveCurrentRoom(io, rooms, socket);
      ack?.({ ok: true });
    });

    socket.on("room:setGame", (game, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.setGame(room, userId, game);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:config", (config, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.updateConfig(room, userId, config);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // An owner who may change the settings adds one of their Spotify playlists; its songs load in the background.
    socket.on("room:spotifyPlaylist", async (playlistId, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.assertSpotifyEditor(room, userId);
        const playlist = await readSpotifyPlaylist(rooms.store, userId, String(playlistId || ""));
        if (!playlist.tracks.length) throw new Error("Esa playlist no tiene canciones que se puedan usar");
        rooms.addSpotifyPlaylist(room, userId, playlist);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Quick phrases and emojis in the lobby: a one-off event for the room, not part of the room state.
    socket.on("room:react", (text, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        io.to(room.code).emit("room:reaction", rooms.react(room, userId, String(text || "")));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:toggleConfigPermission", (targetUserId, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const result = rooms.toggleConfigPermission(room, userId, targetUserId);
        ack?.({ ok: true, ...result, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:ready", (ready, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.setReady(room, userId, ready);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:start", (ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.start(room, userId);
        // Download every round's preview and cover now, so nothing waits for iTunes once the match runs.
        prefetchMedia(room.tracks);
        watchRoom(io, rooms, room);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("player:update", (data, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.updatePlayer(room, userId, data || {});
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:end", (ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.endByHost(room, userId);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:restart", (ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.restart(room, userId);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });


    socket.on("game:skip", (ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.skip(room, userId);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("game:answer", (text, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.submitAnswer(room, userId, text);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("disconnect", () => {
      const result = rooms.disconnect(socket.id);
      if (result?.room) io.to(result.room.code).emit("room:state", rooms.publicState(result.room));
    });
  });
}

// Takes the socket out of the room it's in (unless it's `keepCode`), so it stops getting that room's updates.
function leaveCurrentRoom(io, rooms, socket, keepCode) {
  const ref = rooms.socketToRoom.get(socket.id);
  if (!ref || ref.code === keepCode) return;
  socket.leave(ref.code);
  const result = rooms.leave(socket.id);
  if (result?.room) io.to(result.room.code).emit("room:state", rooms.publicState(result.room));
}

// The player for this socket: the id comes from the verified token; name/avatar from the saved account when
// there is one (so nobody can show up under another player's name), otherwise from what the client sent.
function bindUser(socket, user, rooms) {
  const id = socket.data.userId;
  if (!id) throw new Error("Tu sesión no es válida. Recarga la página.");
  const saved = rooms.store?.users?.[id];
  const name = saved?.name || user?.name || socket.data.profile?.name;
  if (!name) throw new Error("Identifícate primero");
  const profile = {
    ...(user || {}),
    id,
    name,
    avatar: saved?.avatar || user?.avatar,
    isGuest: saved ? Boolean(saved.isGuest) : true,
  };
  socket.data.profile = profile;
  return { ...profile, socketId: socket.id };
}

function requireRoom(rooms, socket) {
  const ref = rooms.socketToRoom.get(socket.id);
  if (!ref) throw new Error("No estás en una sala");
  const room = rooms.get(ref.code);
  if (!room) throw new Error("Sala no encontrada");
  return { room, userId: ref.userId };
}

function watchRoom(io, rooms, room) {
  if (room.watching) return;
  room.watching = true;
  const tick = () => {
    if (rooms.rooms.get(room.code) !== room) return;
    io.to(room.code).emit("room:state", rooms.publicState(room));
    // Stop once the match is over or the host sent everyone back to a lobby.
    if (["countdown", "playing", "reveal"].includes(room.phase)) {
      const wait = Math.max(250, (room.phaseEndsAt || Date.now()) - Date.now() + 30);
      setTimeout(tick, Math.min(wait, 1000));
    } else {
      room.watching = false;
    }
  };
  setTimeout(tick, 400);
}
