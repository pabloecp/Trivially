import { isDefaultSpotify } from "../catalog/defaultPlaylists.js";
import { verifySocketToken } from "../auth/socketToken.js";
import { prefetchMedia } from "../audio/mediaCache.js";
import { readPublicSpotify, spotifyLinkFrom } from "../catalog/spotifyEmbed.js";
import { readSpotifyPlaylist } from "../catalog/spotifyLibrary.js";
import { saveQuestionReport } from "../db/reports.js";
import { assertCanShare, playlistByCode, shareCodeFor } from "../db/sharedPlaylists.js";
import { forgetSpotifyLink, saveSpotifyLink, savedSpotifyLinks } from "../db/store.js";
import { prefetchFlags } from "../geo/flags.js";
import { isAccount } from "../auth/username.js";

// The same friend can be invited to a room again after this long (friend:invite).
export const INVITE_GAP_MS = 15000;

export function attachSockets(io, rooms, { friends = null, hub = null } = {}) {
  hub?.attach(io);
  // When each account last invited each friend ("<from>><to>" -> time).
  const invitedAt = new Map();
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
      hub?.touchRoom(room);
    }
  };

  // A connection's place in a room changed (RoomManager's central device): it becomes the central device, plays again
  // ("player") or is out (null). It joins or leaves the room's broadcasts, and hears it with the room as it is now.
  rooms.onRoleChange = (socketId, { code, role, notice }) => {
    const target = io.sockets.sockets.get(socketId);
    if (!target) return;
    if (role) target.join(code);
    else target.leave(code);
    const room = role ? rooms.get(code) : null;
    const userId = rooms.socketToRoom.get(socketId)?.userId;
    target.emit("room:role", {
      code,
      role,
      notice: notice || null,
      state: room ? rooms.publicState(room, role === "player" ? userId : undefined) : null,
    });
  };

  io.on("connection", (socket) => {
    // Accounts get their friends tab: who is online, where, and the requests. Any event of theirs may change what their
    // friends see (they made, joined or left a room...), so the friends' views are refreshed after it.
    hub?.connect(socket);
    socket.onAny?.(() => hub?.touch(socket.data.userId, ...(rooms.roomOfUser(socket.data.userId)?.players.keys() || [])));

    // A friend joins the room of a friend, as the host allows: straight in, or asking the host first.
    socket.on("friend:join", (payload, ack) => {
      try {
        const userId = socket.data.userId;
        const me = rooms.store.users[userId];
        if (!isAccount(me)) throw new Error("Inicia sesión con una cuenta para unirte a un amigo");
        const friendId = String(payload?.friendId || "");
        if (!friends?.areFriends(userId, friendId)) throw new Error("Esa persona no es tu amiga");
        const room = rooms.roomOfUser(friendId);
        if (!room) throw new Error("Tu amigo ya no está en una sala");
        if (room.players.get(userId)?.connected) throw new Error("Ya estás en esa sala");
        if (room.joinMode === "abierta") return ack?.({ ok: true, action: "join", code: room.code });
        if (room.joinMode !== "solicitud") throw new Error("Esa sala es solo por invitación del anfitrión");
        rooms.addJoinRequest(room, { id: userId, name: me.name, avatar: me.avatar });
        io.to(room.code).emit("room:state", rooms.publicState(room));
        hub?.refresh(userId);
        ack?.({ ok: true, action: "requested" });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Someone in a room invites a friend who is online: the friend gets the room's code in a card ("Ana te invita a su
    // sala", lib/friends.jsx), whatever the room's join mode (an invitation is how "Solo invitación" rooms are joined).
    // The same friend at most once every INVITE_GAP_MS.
    socket.on("friend:invite", (payload, ack) => {
      try {
        const userId = socket.data.userId;
        const me = rooms.store.users[userId];
        if (!isAccount(me)) throw new Error("Inicia sesión con una cuenta para invitar a tus amigos");
        const friendId = String(payload?.friendId || "");
        if (!friends?.areFriends(userId, friendId)) throw new Error("Esa persona no es tu amiga");
        const room = rooms.roomOfUser(userId);
        if (!room) throw new Error("Entra a una sala para invitar a tus amigos");
        if (room.players.get(friendId)?.connected) throw new Error("Ya está en tu sala");
        if (!hub?.isOnline(friendId)) throw new Error("Tu amigo no está conectado ahora");
        const key = `${userId}>${friendId}`;
        const wait = (invitedAt.get(key) || 0) + INVITE_GAP_MS - Date.now();
        if (wait > 0) throw new Error(`Ya lo invitaste: espera ${Math.ceil(wait / 1000)} s`);
        invitedAt.set(key, Date.now());
        io.to(`user:${friendId}`).emit("friend:invited", { code: room.code, fromName: me.name, fromAvatar: me.avatar, game: room.game });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("friend:cancelJoin", (payload, ack) => {
      try {
        const userId = socket.data.userId;
        const room = rooms.roomOfUser(String(payload?.friendId || ""));
        if (room) {
          rooms.cancelJoinRequest(room, userId);
          io.to(room.code).emit("room:state", rooms.publicState(room));
        }
        hub?.refresh(userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The host's answer to a friend who asks to join: if accepted, that friend's device joins with the room's code.
    socket.on("room:answerJoin", (payload, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const asked = rooms.answerJoinRequest(room, userId, String(payload?.userId || ""));
        const hostName = room.players.get(room.hostId)?.name || "El anfitrión";
        io.to(`user:${asked.userId}`).emit(payload?.accept ? "friend:approved" : "friend:declined", {
          code: payload?.accept ? room.code : null,
          hostName,
        });
        io.to(room.code).emit("room:state", rooms.publicState(room));
        hub?.refresh(asked.userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // What the host's friends can do from their friends list.
    socket.on("room:joinMode", (mode, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.setJoinMode(room, userId, mode);
        io.to(room.code).emit("room:state", rooms.publicState(room));
        hub?.touchRoom(room);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("identify", (profile) => {
      try {
        bindUser(socket, profile, rooms);
      } catch {}
    });

    socket.on("room:create", async (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        await assertAccountFree(io, rooms, socket, user.id);
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
        ack?.({ ok: false, error: err.message, busy: err.busy });
      }
    });

    // Entering a room as a player, or coming back to it (a reload, a dropped connection). `central`: this tab was the
    // room's central device and comes back as it.
    socket.on("room:join", async (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        const room = rooms.findToJoin(payload?.code, user.id);
        // Also when this connection is still the room's central device but its tab lost track of it.
        const ref = rooms.socketToRoom.get(socket.id);
        const isCentral = Boolean(ref?.central) && ref.code === room.code;
        if (payload?.central || isCentral) {
          if (!isCentral) leaveCurrentRoom(io, rooms, socket);
          if (!rooms.reattachCentral(room, user)) throw new Error("Este dispositivo ya no es el dispositivo central de la sala");
          socket.join(room.code);
          ack?.({ ok: true, role: "central", state: rooms.publicState(room) });
          io.to(room.code).emit("room:state", rooms.publicState(room));
          return;
        }
        await assertAccountFree(io, rooms, socket, user.id, room);
        leaveCurrentRoom(io, rooms, socket, room.code);
        rooms.addPlayer(room, user);
        socket.join(room.code);
        ack?.({ ok: true, role: "player", state: rooms.publicState(room, user.id) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message, busy: err.busy, sameRoom: err.sameRoom, isHost: err.isHost, hostName: err.hostName });
      }
    });

    // The host's account, from another device than the one they play on (after "Ya estás jugando en esta sala"): this
    // device becomes the room's central device straight away.
    socket.on("room:joinCentral", (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        const room = rooms.get(payload?.code || "");
        if (!room) throw new Error("Sala no encontrada");
        const ref = rooms.socketToRoom.get(socket.id);
        if (!(ref?.central && ref.code === room.code)) leaveCurrentRoom(io, rooms, socket);
        rooms.joinAsCentral(room, user);
        socket.join(room.code);
        ack?.({ ok: true, role: "central", state: rooms.publicState(room) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Any other player, the same way: the host has to accept it (room:centralAnswer). The answer comes as "room:role".
    socket.on("room:requestCentral", (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        const room = rooms.get(payload?.code || "");
        if (!room) throw new Error("Sala no encontrada");
        const request = rooms.requestCentral(room, user);
        ack?.({ ok: true, requestId: request.id });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:cancelCentralRequest", (ack) => {
      for (const room of rooms.dropCentralRequests(socket.id)) io.to(room.code).emit("room:state", rooms.publicState(room));
      ack?.({ ok: true });
    });

    // The host accepts (`accept: true`) or turns down a request to be the central device.
    socket.on("room:centralAnswer", (payload, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const result = rooms.answerCentralRequest(room, userId, payload?.id, Boolean(payload?.accept));
        ack?.({ ok: true, ...result, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The host drops a player onto the "Dispositivo central" spot: that player's device becomes the central one.
    socket.on("room:makeCentral", (targetUserId, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const result = rooms.makeCentral(room, userId, targetUserId);
        ack?.({ ok: true, ...result, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The host's "Quitar" on the spot: the room goes back to everyone playing on their own screen.
    socket.on("room:removeCentral", (ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.removeCentral(room, userId);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Whether a code opens a room, before the player writes their name. It sends nothing about the room.
    socket.on("room:check", (code, ack) => {
      try {
        rooms.findToJoin(code, socket.data.userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:leave", (ack) => {
      leaveCurrentRoom(io, rooms, socket);
      ack?.({ ok: true });
    });

    // The host pointing at a game on the menu: everyone else sees it highlighted at once.
    socket.on("room:preview", (game, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.previewGame(room, userId, game);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // A chat message to everyone in the room.
    socket.on("room:chat", (text, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.sendChat(room, userId, text);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // A player suggests a game to the host (once every few seconds).
    socket.on("room:suggest", (game, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.suggestGame(room, userId, game);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
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

    // The room's playlist of games, all of it (its name, order and games with their settings), from its panel.
    socket.on("room:playlist", (playlist, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.updatePlaylist(room, userId, playlist);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // "Copiar código": the room's playlist (already cleaned), or a saved one sent along (cleaned the same way), is
    // kept on the server and its code comes back. The same playlist always gets the same code; each person (or
    // connection) can make only a few codes a minute.
    socket.on("playlist:share", async (playlist, ack) => {
      if (typeof playlist === "function") [ack, playlist] = [playlist, null];
      try {
        const { room, userId } = requireRoom(rooms, socket);
        assertCanShare(socket.data.userId || userId || socket.id);
        const chosen = playlist && typeof playlist === "object" ? rooms.cleanSharedPlaylist(room, playlist) : room.playlist;
        ack?.({ ok: true, code: await shareCodeFor(chosen) });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // A pasted code: the playlist it points to ({ name, order, items }); loading it is the panel's own update.
    socket.on("playlist:byCode", async (code, ack) => {
      try {
        ack?.({ ok: true, playlist: await playlistByCode(code) });
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

    // Anyone who may change the settings takes a Spotify playlist out of the room.
    socket.on("room:removePlaylist", (playlistId, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.removeSpotifyPlaylist(room, userId, String(playlistId || ""));
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Anyone who may change the settings pastes a public Spotify playlist's (or an album's) link: no Spotify needed.
    socket.on("room:spotifyLink", async (link, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.assertPlaylistEditor(room, userId);
        const target = await spotifyLinkFrom(link);
        const playlist = await readPublicSpotify(target);
        if (!playlist.tracks.length) throw new Error("No tiene canciones que se puedan usar");
        rooms.addSpotifyPlaylist(room, userId, playlist, { fromLink: true });
        // Someone with an account keeps it on their profile, to add it again from "Mis playlists" in any room (not the
        // default playlists: every room has them already).
        const saved = isDefaultSpotify(target)
          ? savedSpotifyLinks(rooms.store, userId)
          : saveSpotifyLink(rooms.store, userId, { ...target, name: playlist.name, image: playlist.image, total: playlist.tracks.length });
        // `added`: the room's id of what was read, so a game of a playlist of games can tick it in its own settings.
        ack?.({ ok: true, state: rooms.publicState(room, userId), saved, added: `sp:${playlist.id}` });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The Spotify playlists and albums this account saved ("Mis playlists"); a guest has none. Only the verified
    // id of this socket's own account is read or changed.
    socket.on("spotify:saved", (ack) => {
      const userId = socket.data.userId;
      const account = userId && rooms.store?.users?.[userId];
      ack?.({ ok: true, canSave: Boolean(account && !account.isGuest), saved: savedSpotifyLinks(rooms.store, userId) });
    });

    socket.on("spotify:forget", (key, ack) => {
      try {
        ack?.({ ok: true, saved: forgetSpotifyLink(rooms.store, socket.data.userId, String(key || "")) });
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

    // The host makes another player the host.
    socket.on("room:giveHost", (targetUserId, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.giveHost(room, userId, targetUserId);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The host takes a player out of the room: "kick" lets them come back with the code, "block" doesn't.
    const takeOut = (block) => (targetUserId, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const { socketId } = rooms.kick(room, userId, targetUserId, { block });
        const target = socketId && io.sockets.sockets.get(socketId);
        if (target) {
          target.leave(room.code);
          target.emit("room:kicked", { code: room.code, blocked: block });
        }
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    };
    socket.on("room:kick", takeOut(false));
    socket.on("room:block", takeOut(true));

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
        // Download every round's preview and cover (or flag) now, so nothing waits for iTunes once the match runs.
        prefetchMedia(room.tracks);
        prefetchFlags(room.tracks);
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

    // The host pauses the match, or lets it go on (RoomManager.pause / resume).
    socket.on("room:pause", (paused, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        if (paused) rooms.pause(room, userId);
        else rooms.resume(room, userId);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // An owner skips straight to the next question. Only the socket's verified account counts.
    socket.on("room:skipRound", (ack) => {
      try {
        const { room } = requireRoom(rooms, socket);
        rooms.skipRound(room, socket.data.userId);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Any player reports the question being played; the report says whether their seat is the socket's verified account.
    socket.on("room:report", async (ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const report = rooms.questionReport(room, userId, { verified: socket.data.userId === userId });
        await saveQuestionReport(report);
        ack?.({ ok: true });
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

    // "Volver a jugar": a new match straight away (RoomManager.replay). If it can't start, everyone is back in the
    // game's lobby.
    socket.on("room:replay", (ack) => {
      let room = null;
      try {
        const ref = requireRoom(rooms, socket);
        room = ref.room;
        rooms.replay(room, ref.userId);
        prefetchMedia(room.tracks);
        prefetchFlags(room.tracks);
        watchRoom(io, rooms, room);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
      if (room) io.to(room.code).emit("room:state", rooms.publicState(room));
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

    // Geografía's map rounds: `{ lng, lat, lock }`. A pin that isn't locked only goes back to its player; locking it
    // (or any pin in a tiebreak) is news for the whole room.
    socket.on("game:pin", (pin, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const locked = rooms.placePin(room, userId, pin);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        if (locked) io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Historia: `{ year, lock }`. Like a pin: a year that isn't locked only goes back to its player; locking it is
    // news for the whole room.
    socket.on("game:year", (value, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const locked = rooms.placeYear(room, userId, value);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        if (locked) io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Campo de minas: `{ cell, turn }`, one cell per turn. The first to pick a cell keeps it, and everyone sees it.
    socket.on("game:cell", (value, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.pickCell(room, userId, value);
        ack?.({ ok: true, state: rooms.publicState(room, userId) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Lluvia: an answer written in the box. It counts for any question on screen that nobody has answered yet; the ack
    // says which one this player took (`hit`, null when none), or who took it first (`takenBy`). A question taken is
    // news for the whole room: it leaves every screen.
    socket.on("game:rain", (text, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        const result = rooms.rainAnswer(room, userId, text);
        const hit = result && !result.takenBy ? result : null;
        ack?.({ ok: true, hit, takenBy: result?.takenBy || null, answer: result?.answer || null });
        if (hit) io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("disconnect", () => {
      hub?.disconnect(socket);
      for (const room of rooms.dropCentralRequests(socket.id)) io.to(room.code).emit("room:state", rooms.publicState(room));
      const result = rooms.disconnect(socket.id);
      if (result?.room) io.to(result.room.code).emit("room:state", rooms.publicState(result.room));
    });
  });
}

// How long another connection of the account gets to answer the "room:ping" before it counts as gone.
const SEAT_PING_MS = 1500;

// An account sits in one room through one connection at a time: a second tab or device would take the seat over and
// leave the first one stuck on a room it can no longer act in. A connection that dropped silently (the server hasn't
// noticed yet) stays "connected" for a while, so the other connection has to answer a ping; if it doesn't, it's a
// reload or a dropped connection coming back, and the new one takes the seat as usual. When the account is already
// playing in the very room being joined (`room`), the error says so (`sameRoom`): that device can be the room's
// central device instead, straight away for the host (`isHost`), or if the host accepts it for anyone else.
async function assertAccountFree(io, rooms, socket, userId, room = null) {
  for (const seat of rooms.otherSeatSockets(userId, socket.id)) {
    const other = io.sockets.sockets.get(seat.socketId);
    if (!other?.connected) continue;
    const alive = await other.timeout(SEAT_PING_MS).emitWithAck("room:ping").then(
      () => true,
      () => false,
    );
    if (!alive) continue;
    if (room && seat.code === room.code) {
      const err = new Error("Ya estás jugando en esta sala desde otro dispositivo.");
      err.busy = true;
      err.sameRoom = true;
      err.isHost = room.hostId === userId;
      err.hostName = room.players.get(room.hostId)?.name || "el anfitrión";
      throw err;
    }
    const err = new Error("Ya estás en una sala con esta cuenta (en otra pestaña o dispositivo). Sal de ella primero.");
    err.busy = true;
    throw err;
  }
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

// The room of a player's connection. The central device only shows the match: nothing it sends is taken, even when
// its account is the host's (the host controls everything from the device they play on).
function requireRoom(rooms, socket) {
  const ref = rooms.socketToRoom.get(socket.id);
  if (!ref) throw new Error("No estás en una sala");
  if (ref.central) throw new Error("El dispositivo central solo muestra la partida: se juega desde los teléfonos");
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
