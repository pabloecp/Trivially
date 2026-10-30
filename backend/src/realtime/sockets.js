import { isDefaultSpotify } from "../catalog/defaultPlaylists.js";
import { verifySocketToken } from "../auth/socketToken.js";
import { prefetchMedia } from "../audio/mediaCache.js";
import { readPublicSpotify, spotifyLinkFrom } from "../catalog/spotifyEmbed.js";
import { readSpotifyPlaylist } from "../catalog/spotifyLibrary.js";
import { saveQuestionReport } from "../db/reports.js";
import { forgetSpotifyLink, playerAvatar, saveSpotifyLink, savedSpotifyLinks } from "../db/store.js";
import { prefetchFlags } from "../geo/flags.js";
import { isAccount } from "../auth/username.js";
import { hasRole } from "../auth/roles.js";
import { GroupManager } from "../game/groups.js";
import { cleanMatchRequest, PUBLIC_GROUP_MAX } from "../game/matchmaking.js";

// The same friend can be invited to a group again after this long (friend:invite).
export const INVITE_GAP_MS = 15000;

export function attachSockets(io, rooms, { friends = null, hub = null, groups = new GroupManager({ rooms }) } = {}) {
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

  // A full public room started by itself (RoomManager.checkMatchFull): like room:start, without anyone pressing it.
  rooms.onMatchStart = (room) => {
    prefetchFlags(room.tracks);
    watchRoom(io, rooms, room);
  };

  // A public match took a player out for being inactive (RoomManager.markIdle): their screen leaves the room.
  rooms.onKicked = (socketId, { code, reason }) => {
    const target = io.sockets.sockets.get(socketId);
    if (!target) return;
    target.leave(code);
    target.emit("room:kicked", { code, reason });
  };

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

  // ---- Groups (game/groups.js): the players who go together, from one room (a match) to the next ----

  // Every player of the group hears how it is now; their friends' lists change too (where they are, who leads it).
  const sendGroup = (group) => {
    if (!group) return;
    const state = groups.publicGroup(group);
    for (const m of group.members.values()) if (m.socketId) io.to(m.socketId).emit("group:state", state);
    hub?.touch(...group.members.keys());
  };

  // The leader is the host of the group's private match: when the group gets a new leader, the match gets a new host.
  const syncHost = (group) => {
    const room = groups.place(group);
    if (!room || room.groupCode !== group.code || room.hostId === group.leaderId) return;
    if (!room.players.get(group.leaderId)?.connected) return;
    room.hostId = group.leaderId;
    room.coHosts = (room.coHosts || []).filter((id) => id !== group.leaderId);
    room.preview = null;
    room.suggestions = [];
    io.to(room.code).emit("room:state", rooms.publicState(room));
  };

  // A dropped player's place in the group ran out.
  groups.onChange = (group) => {
    syncHost(group);
    sendGroup(group);
  };

  // A player of the group as a room's player: the group keeps their name, colour and connection.
  const asUser = (m) => ({ id: m.id, name: m.name, avatar: m.avatar, isGuest: m.isGuest, socketId: m.socketId });

  // The players the group takes with it when it moves (but `exceptUserId`, who moves it): those connected, but a room's
  // central device and anyone in the middle of a public match (they finish it and catch up on the next move).
  const movable = (group, exceptUserId) => {
    const list = [];
    for (const member of group.members.values()) {
      if (member.id === exceptUserId || !member.connected || !member.socketId) continue;
      const socket = io.sockets.sockets.get(member.socketId);
      if (!socket) continue;
      const ref = rooms.socketToRoom.get(member.socketId);
      if (ref?.central) continue;
      const current = ref ? rooms.get(ref.code) : null;
      const seat = current?.players.get(member.id);
      if (current?.matchmaking && !["lobby", "finished"].includes(current.phase) && seat && !seat.forfeit && !seat.spectator) continue;
      list.push({ member, socket, ref });
    }
    return list;
  };

  // Tells a connection the group took it into another room (with the room as it is) or, with null, back to Inicio.
  const tellMoved = (socket, room, userId) =>
    socket.emit("room:moved", room ? { code: room.code, state: rooms.publicState(room, userId) } : { code: null });

  // The group goes into `room` (the private match its leader made): every player it can take, from wherever they are.
  const moveGroupTo = (group, room, exceptUserId) => {
    for (const { member, socket, ref } of movable(group, exceptUserId)) {
      if (ref?.code === room.code) continue;
      leaveCurrentRoom(io, rooms, socket, room.code);
      try {
        rooms.addPlayer(room, asUser(member));
      } catch {
        tellMoved(socket, null);
        continue;
      }
      socket.join(room.code);
      tellMoved(socket, room, member.id);
    }
    group.roomCode = room.code;
    io.to(room.code).emit("room:state", rooms.publicState(room));
    sendGroup(group);
  };

  // The group goes back to Inicio: whoever of it is in the room where it was leaves it (a dropped player's seat too, so
  // a reload doesn't put them back in it alone).
  const moveGroupHome = (group) => {
    const room = group.roomCode ? rooms.get(group.roomCode) : null;
    for (const member of group.members.values()) {
      const socket = member.socketId ? io.sockets.sockets.get(member.socketId) : null;
      const ref = socket ? rooms.socketToRoom.get(socket.id) : null;
      if (room && ref && !ref.central && ref.code === room.code) {
        leaveCurrentRoom(io, rooms, socket);
        tellMoved(socket, null);
      } else if (room?.players.get(member.id) && !room.players.get(member.id).connected && rooms.rooms.get(room.code) === room) {
        const result = rooms.removePlayer(room, member.id);
        if (result.room) io.to(room.code).emit("room:state", rooms.publicState(room));
      }
    }
    group.roomCode = null;
    sendGroup(group);
  };

  // A player of the group goes where it is (joining it, or back after a reload): into its private match (watching it if
  // a round is on) or back to their own seat in its public one. Elsewhere they wait for it on Inicio: out of a room
  // they were in alone (a public match being played is finished first). Returns the room they're in now, or null.
  const follow = (group, socket, user) => {
    const place = groups.place(group);
    const ref = rooms.socketToRoom.get(socket.id);
    const seat = place?.players.get(user.id);
    if (place && (!place.matchmaking || (seat && !seat.forfeit))) {
      if (ref?.code === place.code) return place;
      try {
        leaveCurrentRoom(io, rooms, socket, place.code);
        rooms.addPlayer(place, user);
        socket.join(place.code);
        io.to(place.code).emit("room:state", rooms.publicState(place));
        return place;
      } catch {
        return null;
      }
    }
    const current = ref && !ref.central ? rooms.get(ref.code) : null;
    if (!current) return null;
    const mine = current.players.get(user.id);
    if (current.matchmaking && !["lobby", "finished"].includes(current.phase) && mine && !mine.forfeit) return current;
    leaveCurrentRoom(io, rooms, socket);
    return null;
  };

  // A player leaves the group (or is taken out of it), and so its private match, which is the group's. The last one
  // stays where they are: the group is gone and the match is theirs alone. Returns whether they left a room.
  const leaveGroup = (group, userId, socket) => {
    const place = groups.place(group);
    const own = place?.groupCode === group.code;
    const left = groups.removeMember(group, userId);
    const ref = socket ? rooms.socketToRoom.get(socket.id) : null;
    let leftRoom = false;
    if (left && own && ref && !ref.central && ref.code === place.code) {
      leaveCurrentRoom(io, rooms, socket);
      leftRoom = true;
    }
    if (left) {
      syncHost(left);
      sendGroup(left);
    } else if (place) {
      io.to(place.code).emit("room:state", rooms.publicState(place));
    }
    hub?.touch(userId);
    return leftRoom;
  };

  // Someone of a group entered or left a room: whether each one is with the group changed.
  const touchGroupOf = (socket) => sendGroup(groups.ofSocket(socket.id));

  io.on("connection", (socket) => {
    // Accounts get their friends tab: who is online, where, and the requests. Any event of theirs may change what their
    // friends see (they made, joined or left a room...), so the friends' views are refreshed after it.
    hub?.connect(socket);
    socket.onAny?.(() => hub?.touch(socket.data.userId, ...(rooms.roomOfUser(socket.data.userId)?.players.keys() || [])));

    // A friend joins the group of a friend, as its leader allows: straight in (with its code), or asking the leader first.
    socket.on("friend:join", (payload, ack) => {
      try {
        const userId = socket.data.userId;
        const me = rooms.store.users[userId];
        if (!isAccount(me)) throw new Error("Inicia sesión con una cuenta para unirte a un amigo");
        const friendId = String(payload?.friendId || "");
        if (!friends?.areFriends(userId, friendId)) throw new Error("Esa persona no es tu amiga");
        const group = groups.ofUser(friendId);
        if (!group) throw new Error("Tu amigo no está en un grupo");
        if (group.members.get(userId)?.connected) throw new Error("Ya estás en ese grupo");
        if (group.joinMode === "abierta") return ack?.({ ok: true, action: "join", code: group.code });
        if (group.joinMode !== "solicitud") throw new Error("Ese grupo es solo por invitación");
        groups.addJoinRequest(group, { id: userId, name: me.name, avatar: playerAvatar(me) });
        sendGroup(group);
        hub?.refresh(userId);
        ack?.({ ok: true, action: "requested" });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Someone in a group invites a friend who is online: the friend gets the group's code in a card ("Ana te invita a su
    // grupo", lib/friends.jsx), whatever its join mode (an invitation is how "Solo invitación" groups are joined). The
    // same friend at most once every INVITE_GAP_MS.
    socket.on("friend:invite", (payload, ack) => {
      try {
        const userId = socket.data.userId;
        const me = rooms.store.users[userId];
        if (!isAccount(me)) throw new Error("Inicia sesión con una cuenta para invitar a tus amigos");
        const friendId = String(payload?.friendId || "");
        if (!friends?.areFriends(userId, friendId)) throw new Error("Esa persona no es tu amiga");
        const group = groups.ofUser(userId);
        if (!group) throw new Error("Crea un grupo para invitar a tus amigos");
        if (group.members.get(friendId)?.connected) throw new Error("Ya está en tu grupo");
        if (!hub?.isOnline(friendId)) throw new Error("Tu amigo no está conectado ahora");
        const key = `${userId}>${friendId}`;
        const wait = (invitedAt.get(key) || 0) + INVITE_GAP_MS - Date.now();
        if (wait > 0) throw new Error(`Ya lo invitaste: espera ${Math.ceil(wait / 1000)} s`);
        invitedAt.set(key, Date.now());
        const place = groups.place(group);
        io.to(`user:${friendId}`).emit("friend:invited", { code: group.code, fromName: me.name, fromAvatar: playerAvatar(me), game: place?.game ?? group.plan.game });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("friend:cancelJoin", (payload, ack) => {
      try {
        const userId = socket.data.userId;
        const group = groups.ofUser(String(payload?.friendId || ""));
        if (group) {
          groups.cancelJoinRequest(group, userId);
          sendGroup(group);
        }
        hub?.refresh(userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The leader's answer to a friend who asks to join: if accepted, that friend's device joins with the group's code.
    socket.on("group:answerJoin", (payload, ack) => {
      try {
        const { group, userId } = requireGroup(groups, socket);
        const asked = groups.answerJoinRequest(group, userId, String(payload?.userId || ""));
        const leaderName = group.members.get(group.leaderId)?.name || "El líder";
        io.to(`user:${asked.userId}`).emit(payload?.accept ? "friend:approved" : "friend:declined", {
          code: payload?.accept ? group.code : null,
          hostName: leaderName,
        });
        sendGroup(group);
        hub?.refresh(asked.userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // What the leader's friends can do from their friends list.
    socket.on("group:joinMode", (mode, ack) => {
      try {
        const { group, userId } = requireGroup(groups, socket);
        groups.setJoinMode(group, userId, mode);
        sendGroup(group);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // "Crear grupo": a new group led by this player. A private match they were playing alone becomes the group's (its
    // code brings the others into it).
    socket.on("group:create", (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        if (groups.ofUser(user.id)) throw new Error("Ya estás en un grupo: sal de él para crear otro");
        const ref = rooms.socketToRoom.get(socket.id);
        const room = ref && !ref.central ? rooms.get(ref.code) : null;
        if (room?.matchmaking) throw new Error("Termina la partida pública para crear un grupo");
        const group = groups.create(user, payload?.plan);
        if (room && room.hostId === user.id && !room.groupCode) {
          room.groupCode = group.code;
          group.roomCode = room.code;
          io.to(room.code).emit("room:state", rooms.publicState(room));
        }
        ack?.({ ok: true, group: groups.publicGroup(group) });
        hub?.touch(user.id);
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Whether a code opens a group, before asking for a name ("Unirse con código", an invite link).
    socket.on("group:check", (code, ack) => {
      try {
        groups.findToJoin(code, socket.data.userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Into a group with its code (its link, "Unirse con código", a friend's invitation), or back into it after a reload:
    // out of the group the player was in, and to wherever this one is (follow). The ack says which room that is (null:
    // Inicio). The same account already in it from another device that's still there: that device can be the
    // central one of the group's private match instead (`offerRoom`, its code: the client joins it and CentralOffer asks).
    socket.on("group:join", async (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        const group = groups.findToJoin(payload?.code, user.id);
        const seated = group.members.get(user.id);
        const other = seated?.connected && seated.socketId !== socket.id ? io.sockets.sockets.get(seated.socketId) : null;
        // A reload can arrive before the old connection is noticed gone: it has to answer to count.
        const alive = other?.connected && (await other.timeout(SEAT_PING_MS).emitWithAck("room:ping").then(() => true, () => false));
        if (alive) {
          const place = groups.place(group);
          if (place && !place.matchmaking) return ack?.({ ok: false, offerRoom: place.code, error: "Ya estás en este grupo desde otro dispositivo" });
          throw new Error("Ya estás en este grupo desde otro dispositivo");
        }
        if (!seated) await assertAccountFree(io, rooms, socket, user.id);
        const before = groups.ofUser(user.id);
        if (before && before !== group) leaveGroup(before, user.id, socket);
        groups.join(group, user);
        const room = follow(group, socket, user);
        ack?.({ ok: true, group: groups.publicGroup(group), room: room ? rooms.publicState(room, user.id) : null });
        sendGroup(group);
      } catch (err) {
        ack?.({ ok: false, error: err.message, busy: err.busy });
      }
    });

    // "Salir del grupo": out of it, and of its private match (but the last one, whose match it is now).
    socket.on("group:leave", (payload, ack) => {
      const group = groups.ofSocket(socket.id);
      const leftRoom = group ? leaveGroup(group, socket.data.userId, socket) : false;
      ack?.({ ok: true, leftRoom });
    });

    // The leader's "¿Qué quieren jugar?" while the group is on Inicio.
    socket.on("group:plan", (plan, ack) => {
      try {
        const { group, userId } = requireGroup(groups, socket);
        groups.setPlan(group, userId, plan);
        sendGroup(group);
        ack?.({ ok: true, group: groups.publicGroup(group) });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The leader takes the whole group back to Inicio: "Volver" in its private match, "Cancelar" while it searches for
    // a public one, or "Volver" once that one is over. With `plan`, what it plays next (a private match switched to
    // "Partida pública").
    socket.on("group:home", (payload, ack) => {
      try {
        const { group, userId } = requireGroup(groups, socket);
        groups.assertLeader(group, userId, "Solo el líder puede llevar al grupo al inicio");
        const place = groups.place(group);
        if (place?.matchmaking && !["lobby", "finished"].includes(place.phase)) throw new Error("Espera a que termine la partida");
        if (payload?.plan) groups.setPlan(group, userId, payload.plan);
        moveGroupHome(group);
        // The leader too, wherever they were.
        const ref = rooms.socketToRoom.get(socket.id);
        if (ref && !ref.central) leaveCurrentRoom(io, rooms, socket);
        ack?.({ ok: true, group: groups.publicGroup(group) });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The leader gives the group to someone else (and with it, the host of its private match).
    socket.on("group:leader", (targetUserId, ack) => {
      try {
        const { group, userId } = requireGroup(groups, socket);
        groups.setLeader(group, userId, String(targetUserId || ""));
        syncHost(group);
        sendGroup(group);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // The leader takes someone out of the group (`block`: for good), and so out of its private match.
    socket.on("group:kick", (payload, ack) => {
      try {
        const { group, userId } = requireGroup(groups, socket);
        const block = Boolean(payload?.block);
        const place = groups.place(group);
        const member = groups.kick(group, userId, String(payload?.userId || ""), { block });
        if (place?.groupCode === group.code && place.players.has(member.id)) {
          const { socketId } = rooms.kick(place, place.hostId, member.id, { block });
          const target = socketId && io.sockets.sockets.get(socketId);
          target?.leave(place.code);
          target?.emit("room:kicked", { code: place.code, blocked: block });
          io.to(place.code).emit("room:state", rooms.publicState(place));
        }
        if (member.socketId) io.to(member.socketId).emit("group:left", { code: group.code, reason: block ? "bloqueado" : "sacado" });
        sendGroup(group);
        hub?.touch(member.id);
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
        // In a group, only its leader makes its private match, and the whole group goes into it.
        const group = groups.ofUser(user.id);
        if (group) groups.assertLeader(group, user.id, "Solo el líder del grupo elige la partida");
        await assertAccountFree(io, rooms, socket, user.id);
        leaveCurrentRoom(io, rooms, socket);
        const room = rooms.create({
          host: user,
          mode: payload.mode || "multi",
          config: payload.config || {},
          // Older clients don't send `game` and expect to land in the song lobby.
          game: payload.game === undefined ? "musica" : payload.game,
          groupCode: group?.code || null,
        });
        socket.join(room.code);
        ack?.({ ok: true, state: rooms.publicState(room, user.id) });
        if (group) moveGroupTo(group, room, user.id);
        else io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message, busy: err.busy });
      }
    });

    // "Partida pública" (JUGAR, "Buscar otra partida"): into a public room (RoomManager.findMatch), leaving the room this
    // connection was in. A group's leader searches for the whole group: everyone it can take gets a seat in the same room.
    socket.on("match:find", async (payload, ack) => {
      try {
        const user = bindUser(socket, payload?.user, rooms);
        const group = groups.ofUser(user.id);
        if (group) groups.assertLeader(group, user.id, "Solo el líder del grupo puede buscar partida");
        await assertAccountFree(io, rooms, socket, user.id);
        const party = group ? movable(group, user.id) : [];
        // Checked before anyone leaves where they are.
        cleanMatchRequest(payload);
        if (party.length + 1 > PUBLIC_GROUP_MAX) throw new Error(`Una partida pública es de ${PUBLIC_GROUP_MAX} como mucho y tu grupo es de ${party.length + 1}`);
        leaveCurrentRoom(io, rooms, socket);
        for (const { socket: other } of party) leaveCurrentRoom(io, rooms, other);
        // Only an owner's account (checked here, never the client's word) can force the games of its own match.
        const owner = rooms.store.users[socket.data.userId];
        const force = owner && hasRole(owner, "owner") ? payload?.force : null;
        let room;
        try {
          room = rooms.findMatch(user, { ...payload, force }, party.map(({ member }) => asUser(member)));
        } catch (err) {
          for (const { socket: other } of party) tellMoved(other, null);
          throw err;
        }
        socket.join(room.code);
        for (const { member, socket: other } of party) {
          other.join(room.code);
          tellMoved(other, room, member.id);
        }
        if (group) {
          group.roomCode = room.code;
          sendGroup(group);
        }
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
        touchGroupOf(socket);
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

    // Out of the room alone (a group's player waits for it on Inicio; the leader moves the group with group:home).
    socket.on("room:leave", (ack) => {
      leaveCurrentRoom(io, rooms, socket);
      ack?.({ ok: true });
      touchGroupOf(socket);
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
        const group = room.groupCode ? groups.get(room.groupCode) : null;
        if (group?.members.has(targetUserId)) {
          group.leaderId = targetUserId;
          sendGroup(group);
        }
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
        const group = room.groupCode ? groups.get(room.groupCode) : null;
        const member = group?.members.get(targetUserId);
        if (member) {
          if (block) group.blocked.add(targetUserId);
          groups.removeMember(group, targetUserId);
          if (member.socketId) io.to(member.socketId).emit("group:left", { code: group.code, reason: block ? "bloqueado" : "sacado" });
          sendGroup(group);
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
        // The colour is the account's (changed through PATCH /api/users/:id/avatar, which checks it), not the one sent.
        const changes = { name: data?.name, avatar: playerAvatar(rooms.store?.users?.[socket.data.userId]) };
        const group = groups.ofSocket(socket.id);
        if (group) sendGroup(groups.updateMember(socket.data.userId, changes));
        if (group && !rooms.socketToRoom.has(socket.id)) return ack?.({ ok: true });
        const { room, userId } = requireRoom(rooms, socket);
        rooms.updatePlayer(room, userId, changes);
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
        // The host, or an owner in any match (public ones too): only the socket's verified account counts for that.
        if (paused) rooms.pause(room, userId, socket.data.userId);
        else rooms.resume(room, userId, socket.data.userId);
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

    // An owner adds a test bot to Farsante's lobby (to try it alone).
    // "Sigo aquí": the answer to the card that asks a public match's idle player if they are still there.
    socket.on("room:present", (payload, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.present(room, userId);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:addTestBot", (payload, ack) => {
      // Sent with no payload too: then the first argument is the ack.
      if (typeof payload === "function") ack = payload;
      try {
        const { room } = requireRoom(rooms, socket);
        rooms.addTestBot(room, socket.data.userId);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Farsante: an answer written for the round's prompt (it can be rewritten until the stage ends), and a vote (the
    // position of one of the options).
    socket.on("game:farsante", (text, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.farsanteWrite(room, userId, text);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });
    socket.on("game:farsanteVote", (index, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.farsanteVote(room, userId, index);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Rey de la colina: the king picks one of the three questions (its position) for the round.
    socket.on("game:kingPick", (index, ack) => {
      try {
        const { room, userId } = requireRoom(rooms, socket);
        rooms.reyPick(room, userId, index);
        ack?.({ ok: true });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("disconnect", () => {
      hub?.disconnect(socket);
      for (const room of rooms.dropCentralRequests(socket.id)) io.to(room.code).emit("room:state", rooms.publicState(room));
      const result = rooms.disconnect(socket.id);
      if (result?.room) io.to(result.room.code).emit("room:state", rooms.publicState(result.room));
      sendGroup(groups.disconnect(socket.id));
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

// The player for this socket: the id comes from the verified token; the name from the saved account when there is one
// (so nobody can show up under another player's name), otherwise from what the client sent. The colour always comes
// from the saved account (playerAvatar), never from the client.
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
    avatar: playerAvatar(saved),
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

// The group of a player's connection.
function requireGroup(groups, socket) {
  const group = groups.ofSocket(socket.id);
  if (!group) throw new Error("No estás en un grupo");
  return { group, userId: socket.data.userId };
}

function watchRoom(io, rooms, room) {
  if (room.watching) return;
  room.watching = true;
  const tick = () => {
    if (rooms.rooms.get(room.code) !== room) return;
    io.to(room.code).emit("room:state", rooms.publicState(room));
    // Stop once the match is over or the host sent everyone back to a lobby.
    if (["intro", "countdown", "playing", "reveal"].includes(room.phase)) {
      const wait = Math.max(250, (room.phaseEndsAt || Date.now()) - Date.now() + 30);
      setTimeout(tick, Math.min(wait, 1000));
    } else {
      room.watching = false;
    }
  };
  setTimeout(tick, 400);
}
