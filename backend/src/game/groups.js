import { hasLink, NAME_LINK_ERROR } from "../moderation/links.js";
import { AUDIENCES, PUBLIC_CLASSIC, PUBLIC_GAMES } from "./matchmaking.js";
import { createRoomCode, GAME_IDS } from "./roomManager.js";

// A group ("Tu grupo"): the players who go together. It isn't a room: a room is a match (its lobby, its rounds, its
// scoreboard), and a group goes from one to the next with all its players. Nobody has one when they arrive; "Crear
// grupo" makes one, and its code (or link, or a friend's invitation) brings the others in. Its leader decides where it
// goes and everyone goes with them (sockets.js moves them): a private match of the group's (a room only for it,
// whose host is the leader) or a public one (a room it shares with strangers). Without a group you play alone.
// Everything is in memory, like the rooms.

// How long a dropped player keeps their place in the group (a reload, a network blip), like a room's seat.
export const GROUP_GRACE_MS = 20000;
// What the leader's friends can do from their friends list: join straight away, ask to join, or nothing (only the code).
export const JOIN_MODES = ["abierta", "solicitud", "invitacion"];
// A friend's request to join stays this long, and the same friend can ask again after this wait.
const JOIN_REQUEST_TTL_MS = 60000;
export const JOIN_ASK_GAP_MS = 10000;
const JOIN_REQUESTS_KEEP = 8;

const DEFAULT_PLAN = { game: "opciones", audience: "publica" };

/**
 * "Vas a jugar": a game and who it's for ("publica" or "grupo"); a public one only of the games played in public, or
 * the Clásico (the roulette's public match).
 */
export function cleanPlan(plan) {
  const audience = AUDIENCES.includes(plan?.audience) ? plan.audience : DEFAULT_PLAN.audience;
  const game = GAME_IDS.includes(plan?.game) ? plan.game : DEFAULT_PLAN.game;
  const inPublic = PUBLIC_GAMES.includes(game) || game === PUBLIC_CLASSIC;
  return { game: audience === "publica" && !inPublic ? DEFAULT_PLAN.game : game, audience };
}

export class GroupManager {
  constructor({ rooms, reconnectGraceMs = GROUP_GRACE_MS }) {
    this.rooms = rooms;
    this.reconnectGraceMs = reconnectGraceMs;
    this.groups = new Map();
    // socket id -> { code, userId }: the connection each player of a group has.
    this.socketToGroup = new Map();
    // Called when a group changes on its own (a dropped player's place running out): sockets.js tells its players.
    this.onChange = null;
  }

  get(code) {
    return this.groups.get(String(code || "").toUpperCase());
  }

  /** The group a player is in, or null. */
  ofUser(userId) {
    for (const group of this.groups.values()) if (group.members.has(userId)) return group;
    return null;
  }

  /** The group of a connection, or null. */
  ofSocket(socketId) {
    const ref = this.socketToGroup.get(socketId);
    const group = ref ? this.get(ref.code) : null;
    return group?.members.get(ref.userId)?.socketId === socketId ? group : null;
  }

  /** The group a code opens (before asking for a name, and to join it). */
  findToJoin(code, userId = null) {
    const group = this.get(code);
    if (!group) throw new Error("No hay ningún grupo con ese código");
    if (userId && group.blocked.has(userId)) throw new Error("El líder te bloqueó de este grupo");
    return group;
  }

  /**
   * A new group with `user` as its leader (out of the one they were in, if any). `plan` is what they were going to play.
   * Its code never repeats a room's or another group's, so a code says what it is.
   */
  create(user, plan) {
    if (hasLink(user?.name)) throw new Error(NAME_LINK_ERROR);
    const taken = { has: (code) => this.groups.has(code) || this.rooms.rooms.has(code) };
    const group = {
      code: createRoomCode(taken),
      leaderId: user.id,
      members: new Map(),
      joinMode: "solicitud",
      joinRequests: [],
      joinAsked: new Map(),
      blocked: new Set(),
      plan: cleanPlan(plan),
      // The room the group went to last (its private match or a public one); where it is while any of its players
      // is still in it (place).
      roomCode: null,
      createdAt: Date.now(),
    };
    this.groups.set(group.code, group);
    this.addMember(group, user);
    return group;
  }

  /** Into the group, or back into it (a reload keeps the same place). Out of any other group first. */
  join(group, user) {
    if (group.blocked.has(user.id)) throw new Error("El líder te bloqueó de este grupo");
    if (hasLink(user?.name)) throw new Error(NAME_LINK_ERROR);
    return this.addMember(group, user);
  }

  addMember(group, user) {
    const other = this.ofUser(user.id);
    if (other && other !== group) this.removeMember(other, user.id);
    const existing = group.members.get(user.id);
    if (existing?.socketId && existing.socketId !== user.socketId) this.socketToGroup.delete(existing.socketId);
    const member = existing || { id: user.id, joinedAt: Date.now() };
    clearTimeout(member.dropTimer);
    member.dropTimer = null;
    member.name = user.name;
    member.avatar = user.avatar;
    member.isGuest = Boolean(user.isGuest ?? (user.id?.startsWith("gst_") || !user.email));
    member.connected = true;
    member.socketId = user.socketId || null;
    group.members.set(user.id, member);
    group.joinRequests = group.joinRequests.filter((r) => r.userId !== user.id);
    if (member.socketId) this.socketToGroup.set(member.socketId, { code: group.code, userId: user.id });
    return member;
  }

  /** "Salir del grupo" (or taken out of it). Returns the group, or null when nobody is left in it. */
  removeMember(group, userId) {
    const member = group.members.get(userId);
    if (!member) return group;
    clearTimeout(member.dropTimer);
    if (member.socketId) this.socketToGroup.delete(member.socketId);
    group.members.delete(userId);
    if (!group.members.size) {
      this.destroy(group);
      return null;
    }
    if (group.leaderId === userId) this.passLeader(group);
    return group;
  }

  destroy(group) {
    for (const member of group.members.values()) {
      clearTimeout(member.dropTimer);
      if (member.socketId) this.socketToGroup.delete(member.socketId);
    }
    // Its private match no longer shows its code.
    const room = group.roomCode ? this.rooms.get(group.roomCode) : null;
    if (room?.groupCode === group.code) room.groupCode = null;
    this.groups.delete(group.code);
  }

  /** The leader is gone: the first one still connected leads (or the first one, if nobody is). */
  passLeader(group) {
    const members = [...group.members.values()];
    group.leaderId = (members.find((m) => m.connected) || members[0]).id;
  }

  /**
   * Lost connection: the player keeps their place (and the leader their role) for a while (GROUP_GRACE_MS), so a reload
   * changes nothing. Returns the group.
   */
  disconnect(socketId) {
    const group = this.ofSocket(socketId);
    const ref = this.socketToGroup.get(socketId);
    this.socketToGroup.delete(socketId);
    const member = group?.members.get(ref.userId);
    if (!member) return null;
    member.connected = false;
    member.socketId = null;
    clearTimeout(member.dropTimer);
    member.dropTimer = setTimeout(() => {
      member.dropTimer = null;
      if (member.connected || this.groups.get(group.code) !== group) return;
      const left = this.removeMember(group, member.id);
      if (left) this.onChange?.(left);
    }, this.reconnectGraceMs);
    member.dropTimer.unref?.();
    return group;
  }

  assertLeader(group, userId, what = "Solo el líder del grupo puede hacer eso") {
    if (group.leaderId !== userId) throw new Error(what);
  }

  /** The leader makes someone else the leader. */
  setLeader(group, leaderId, targetId) {
    this.assertLeader(group, leaderId, "Solo el líder puede pasar el liderazgo");
    if (leaderId === targetId) throw new Error("Ya eres el líder");
    const member = group.members.get(targetId);
    if (!member) throw new Error("Esa persona no está en el grupo");
    if (!member.connected) throw new Error("Esa persona no está conectada ahora");
    group.leaderId = targetId;
    return member;
  }

  /** The leader takes someone out of the group; with `block` they can't come back with the code. */
  kick(group, leaderId, targetId, { block = false } = {}) {
    this.assertLeader(group, leaderId, "Solo el líder puede sacar a alguien del grupo");
    if (leaderId === targetId) throw new Error("No puedes sacarte a ti mismo");
    const member = group.members.get(targetId);
    if (!member) throw new Error("Esa persona no está en el grupo");
    if (block) group.blocked.add(targetId);
    this.removeMember(group, targetId);
    return member;
  }

  /** The leader's "¿Qué quieren jugar?" while the group is on Inicio. */
  setPlan(group, userId, plan) {
    this.assertLeader(group, userId, "Solo el líder elige qué juega el grupo");
    group.plan = cleanPlan({ ...group.plan, ...plan });
  }

  /** A player of the group changed their name or colour. */
  updateMember(userId, { name, avatar } = {}) {
    const group = this.ofUser(userId);
    const member = group?.members.get(userId);
    if (!member) return null;
    if (typeof name === "string" && name.trim()) member.name = name.trim();
    if (avatar) member.avatar = avatar;
    return group;
  }

  /**
   * Where the group is: the room it went to last while one of its players is still in it (and in its match, for a public
   * one); null when it's on Inicio.
   */
  place(group) {
    const room = group.roomCode ? this.rooms.get(group.roomCode) : null;
    if (!room) return null;
    for (const id of group.members.keys()) {
      const player = room.players.get(id);
      if (player?.connected && !player.forfeit) return room;
    }
    return null;
  }

  /** The leader decides what their friends can do from the friends list: join, ask to join, or nothing. */
  setJoinMode(group, userId, mode) {
    this.assertLeader(group, userId, "Solo el líder puede cambiar quién se une");
    if (!JOIN_MODES.includes(mode)) throw new Error("Esa opción no existe");
    group.joinMode = mode;
    if (mode !== "solicitud") group.joinRequests = [];
  }

  /** The requests to join that are still valid. */
  openJoinRequests(group) {
    const now = Date.now();
    group.joinRequests = group.joinRequests.filter((r) => now - r.at < JOIN_REQUEST_TTL_MS && !group.members.has(r.userId));
    return group.joinRequests;
  }

  /** A friend asks the leader to let them in (only when the group is "solicitud"). */
  addJoinRequest(group, user, now = Date.now()) {
    if (group.joinMode !== "solicitud") throw new Error("Ese grupo no recibe solicitudes");
    if (group.blocked.has(user.id)) throw new Error("No puedes unirte a ese grupo");
    if (group.members.has(user.id)) throw new Error("Ya estás en ese grupo");
    const wait = (group.joinAsked.get(user.id) || 0) + JOIN_ASK_GAP_MS - now;
    if (wait > 0) throw new Error(`Espera ${Math.ceil(wait / 1000)} s para pedirlo otra vez`);
    const open = this.openJoinRequests(group).filter((r) => r.userId !== user.id);
    if (open.length >= JOIN_REQUESTS_KEEP) throw new Error("Ese grupo ya tiene muchas solicitudes. Inténtalo en un momento.");
    group.joinAsked.set(user.id, now);
    group.joinRequests = [...open, { userId: user.id, name: user.name, avatar: user.avatar, at: now }];
  }

  /** The requester takes their request back. */
  cancelJoinRequest(group, userId) {
    group.joinRequests = group.joinRequests.filter((r) => r.userId !== userId);
  }

  /** The leader lets a friend in (the friend then joins with the code) or turns them down. Returns the request. */
  answerJoinRequest(group, leaderId, userId) {
    this.assertLeader(group, leaderId, "Solo el líder responde a las solicitudes");
    const found = this.openJoinRequests(group).find((r) => r.userId === userId);
    if (!found) throw new Error("Esa solicitud ya no está");
    group.joinRequests = group.joinRequests.filter((r) => r.userId !== userId);
    return found;
  }

  /**
   * What the group's players see of it: its code, leader, players (and whether each is where the group is: `here`),
   * the plan, who can join, the friends asking to, and where it is (`place`: its private match or a public one).
   */
  publicGroup(group) {
    const place = this.place(group);
    const leader = group.members.get(group.leaderId);
    return {
      code: group.code,
      leaderId: group.leaderId,
      leaderName: leader?.name || "el líder",
      members: [...group.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        isGuest: m.isGuest,
        connected: m.connected,
        here: place ? Boolean(place.players.get(m.id)?.connected) : !this.rooms.roomOfUser(m.id),
      })),
      plan: group.plan,
      joinMode: group.joinMode,
      joinRequests: this.openJoinRequests(group).map((r) => ({ userId: r.userId, name: r.name, avatar: r.avatar, at: r.at })),
      place: place
        ? { code: place.code, public: Boolean(place.matchmaking), game: place.game, own: place.groupCode === group.code }
        : null,
    };
  }
}
