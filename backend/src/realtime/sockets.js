export function attachSockets(io, rooms) {
  rooms.onPhaseChange = (room) => {
    if (room && room.code) {
      io.to(room.code).emit("room:state", rooms.publicState(room));
    }
  };

  io.on("connection", (socket) => {
    socket.on("identify", (profile) => {
      socket.data.profile = profile;
    });

    socket.on("room:create", (payload, ack) => {
      try {
        // Leave any room this socket is currently in
        const prev = rooms.leave(socket.id);
        if (prev?.room) {
          socket.leave(prev.room.code);
          io.to(prev.room.code).emit("room:state", rooms.publicState(prev.room));
        }
        for (const r of socket.rooms) {
          if (r !== socket.id) socket.leave(r);
        }

        const user = bindUser(socket, payload?.user);
        const room = rooms.create({
          host: user,
          mode: payload.mode || "multi",
          config: payload.config || {},
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
        const user = bindUser(socket, payload?.user);
        const targetCode = (payload.code || "").toUpperCase();

        const currentRef = rooms.socketToRoom.get(socket.id);
        if (currentRef && currentRef.code !== targetCode) {
          const prev = rooms.leave(socket.id);
          if (prev?.room) {
            socket.leave(prev.room.code);
            io.to(prev.room.code).emit("room:state", rooms.publicState(prev.room));
          }
        }
        for (const r of socket.rooms) {
          if (r !== socket.id && r !== targetCode) socket.leave(r);
        }

        const room = rooms.get(targetCode);
        if (!room) throw new Error("Sala no encontrada");
        rooms.addPlayer(room, user);
        socket.join(room.code);
        ack?.({ ok: true, state: rooms.publicState(room, user.id) });
        io.to(room.code).emit("room:state", rooms.publicState(room));
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("room:leave", (ack) => {
      const result = rooms.leave(socket.id);
      if (result?.room) {
        socket.leave(result.room.code);
        io.to(result.room.code).emit("room:state", rooms.publicState(result.room));
      }
      for (const r of socket.rooms) {
        if (r !== socket.id) socket.leave(r);
      }
      ack?.({ ok: true });
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
      const result = rooms.leave(socket.id);
      if (result?.room) io.to(result.room.code).emit("room:state", rooms.publicState(result.room));
    });
  });
}

function bindUser(socket, user) {
  const profile = user || socket.data.profile;
  if (!profile?.id || !profile?.name) throw new Error("Identifícate primero");
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
    if (!rooms.rooms.has(room.code)) return;
    io.to(room.code).emit("room:state", rooms.publicState(room));
    if (room.phase !== "finished") {
      const wait = Math.max(250, (room.phaseEndsAt || Date.now()) - Date.now() + 30);
      setTimeout(tick, Math.min(wait, 1000));
    } else {
      room.watching = false;
    }
  };
  setTimeout(tick, 400);
}
