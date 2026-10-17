import { isAccount } from "./friendCode.js";

// What each account sees in its friends tab, and how it stays up to date: who is online, who is in a room (and what
// they could do about it), and the requests. The view is pushed to the friends' connections (`friends:state`) a
// moment after anything changes; a connection only gets it again when what it would show is different.
const FLUSH_MS = 250;

export class FriendsHub {
  constructor({ store, friends, rooms }) {
    this.store = store;
    this.friends = friends;
    this.rooms = rooms;
    this.io = null;
    this.online = new Map(); // userId -> ids of their connections
    this.sent = new Map(); // userId -> the JSON last pushed to them
    this.pending = new Set(); // accounts to push their view to
    this.timer = null;
  }

  attach(io) {
    this.io = io;
  }

  isOnline(userId) {
    return (this.online.get(userId)?.size || 0) > 0;
  }

  connect(socket) {
    const id = socket.data.userId;
    if (!isAccount(this.store.users[id])) return;
    socket.join(`user:${id}`);
    if (!this.online.has(id)) this.online.set(id, new Set());
    this.online.get(id).add(socket.id);
    this.sent.delete(id);
    this.touch(id);
  }

  disconnect(socket) {
    const id = socket.data.userId;
    const sockets = this.online.get(id);
    if (!sockets) return;
    sockets.delete(socket.id);
    if (!sockets.size) {
      this.online.delete(id);
      this.sent.delete(id);
    }
    this.touch(id);
  }

  /** What `userId` sees in the friends tab. */
  view(userId) {
    const entry = (id) => {
      const u = this.store.users[id];
      return { id, name: u?.name || "Jugador", avatar: u?.avatar };
    };
    const friends = this.friends.friendsOf(userId).map((id) => {
      const room = this.rooms.roomOfUser(id);
      return {
        ...entry(id),
        online: this.isOnline(id) || Boolean(room),
        room: room
          ? {
              game: room.game,
              inMatch: room.phase !== "lobby" && room.phase !== "finished",
              players: [...room.players.values()].filter((p) => p.connected && !p.spectator).length,
              hostName: room.players.get(room.hostId)?.name || "el anfitrión",
              joinMode: room.joinMode || "solicitud",
              // This person already asked to join it.
              requested: this.rooms.openJoinRequests(room).some((r) => r.userId === userId),
            }
          : null,
      };
    });
    friends.sort((x, y) => Number(y.online) - Number(x.online) || Number(Boolean(y.room)) - Number(Boolean(x.room)) || x.name.localeCompare(y.name));
    return {
      code: this.friends.codeOf(userId),
      friends,
      incoming: this.friends.incoming(userId).map(entry),
      outgoing: this.friends.outgoing(userId).map(entry),
    };
  }

  /** Something about `userId` changed (online, room...): their friends' views need refreshing. */
  touch(...userIds) {
    for (const id of userIds) {
      for (const friend of this.friends.friendsOf(id)) this.pending.add(friend);
      this.pending.add(id);
    }
    this.schedule();
  }

  /** The views of these accounts themselves changed (a request came or was answered). */
  refresh(...userIds) {
    for (const id of userIds) this.pending.add(id);
    this.schedule();
  }

  /** A room's seats or state changed: whoever is in it. */
  touchRoom(room) {
    if (room) this.touch(...room.players.keys());
  }

  schedule() {
    if (this.timer || !this.io) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_MS);
    this.timer.unref?.();
  }

  flush() {
    const ids = [...this.pending];
    this.pending.clear();
    for (const id of ids) {
      if (!this.isOnline(id) || !isAccount(this.store.users[id])) continue;
      const view = this.view(id);
      const json = JSON.stringify(view);
      if (this.sent.get(id) === json) continue;
      this.sent.set(id, json);
      this.io.to(`user:${id}`).emit("friends:state", view);
    }
  }
}
