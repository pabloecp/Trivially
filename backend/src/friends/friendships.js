import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "../db/store.js";
import { botProfile } from "../game/bots.js";
import { findByUsername, isAccount } from "../auth/username.js";

// Friendships between accounts: a pair is `pending` (someone asked) or `accepted`. They live in the Supabase table
// `friendships` (backend/supabase/schema.sql); without Supabase, in backend/private/friends.json (never committed).
// Tests point FRIENDS_FILE somewhere else.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = process.env.FRIENDS_FILE || path.join(__dirname, "../../private/friends.json");
const TABLE = "friendships";

export const FRIEND_LIMITS = { friends: 100, pending: 30, asksPerMinute: 10, searchesPerMinute: 40 };

const keyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class Friendships {
  constructor({ store, local = !supabaseEnabled() }) {
    this.store = store;
    this.local = local;
    this.pairs = new Map(); // "a|b" -> { a, b, status, by, at, acceptedAt }
    this.recent = new Map(); // userId -> times of their latest requests
    this.searches = new Map(); // userId -> times of their latest searches
  }

  /** Loads every pair at boot. */
  async init() {
    if (this.local) {
      try {
        for (const rec of JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8"))) this.pairs.set(keyOf(rec.a, rec.b), rec);
      } catch {
        // no file yet
      }
      return;
    }
    const { data, error } = await getSupabase().from(TABLE).select("user_a, user_b, status, requested_by, created_at, accepted_at");
    if (error) {
      console.error(`[Amigos] No se pudo leer la tabla ${TABLE}: ${error.message}. Los amigos no se guardarán.`);
      this.local = true;
      return;
    }
    for (const r of data) {
      this.pairs.set(keyOf(r.user_a, r.user_b), {
        a: r.user_a,
        b: r.user_b,
        status: r.status,
        by: r.requested_by,
        at: Date.parse(r.created_at) || Date.now(),
        acceptedAt: r.accepted_at ? Date.parse(r.accepted_at) : null,
      });
    }
    console.log(`[Amigos] ${this.pairs.size} amistades cargadas`);
  }

  save(rec) {
    this.pairs.set(keyOf(rec.a, rec.b), rec);
    this.persist(rec);
  }

  drop(a, b) {
    const key = keyOf(a, b);
    if (!this.pairs.delete(key)) return;
    if (this.local) return this.writeLocal();
    getSupabase()
      .from(TABLE)
      .delete()
      .eq("user_a", a < b ? a : b)
      .eq("user_b", a < b ? b : a)
      .then(({ error }) => error && console.error("[Amigos] No se pudo borrar:", error.message));
  }

  persist(rec) {
    if (this.local) return this.writeLocal();
    getSupabase()
      .from(TABLE)
      .upsert(
        {
          user_a: rec.a,
          user_b: rec.b,
          status: rec.status,
          requested_by: rec.by,
          created_at: new Date(rec.at).toISOString(),
          accepted_at: rec.acceptedAt ? new Date(rec.acceptedAt).toISOString() : null,
        },
        { onConflict: "user_a,user_b" }
      )
      .then(({ error }) => error && console.error("[Amigos] No se pudo guardar:", error.message));
  }

  writeLocal() {
    try {
      fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
      fs.writeFileSync(LOCAL_PATH, JSON.stringify([...this.pairs.values()]));
    } catch (err) {
      console.error("[Amigos] No se pudo guardar el archivo:", err.message);
    }
  }

  // ---------- Reading ----------
  get(a, b) {
    return this.pairs.get(keyOf(a, b)) || null;
  }

  mine(userId, status) {
    return [...this.pairs.values()].filter((r) => (r.a === userId || r.b === userId) && r.status === status);
  }

  other(rec, userId) {
    return rec.a === userId ? rec.b : rec.a;
  }

  areFriends(a, b) {
    return this.get(a, b)?.status === "accepted";
  }

  friendsOf(userId) {
    return this.mine(userId, "accepted").map((r) => this.other(r, userId));
  }

  incoming(userId) {
    return this.mine(userId, "pending").filter((r) => r.by !== userId).map((r) => this.other(r, userId));
  }

  outgoing(userId) {
    return this.mine(userId, "pending").filter((r) => r.by === userId).map((r) => this.other(r, userId));
  }

  // ---------- Changing ----------
  assertAccount(userId) {
    if (!isAccount(this.store.users[userId])) throw new Error("Inicia sesión con una cuenta para tener amigos");
  }

  assertCanAsk(userId, now) {
    const times = (this.recent.get(userId) || []).filter((t) => now - t < 60_000);
    if (times.length >= FRIEND_LIMITS.asksPerMinute) throw new Error("Estás enviando muchas solicitudes. Espera un momento.");
    times.push(now);
    this.recent.set(userId, times);
  }

  /**
   * `userId` asks `targetId` to be friends. When they had already asked, they become friends right away. Returns
   * "pending" or "accepted".
   */
  request(userId, targetId, now = Date.now()) {
    this.assertAccount(userId);
    // A bot with an account's look (game/bots.js) takes the request like anyone; nothing comes of it.
    if (botProfile(targetId)) return "pending";
    if (!isAccount(this.store.users[targetId])) throw new Error("No encontramos a esa persona");
    if (userId === targetId) throw new Error("Ese es tu propio código");
    const rec = this.get(userId, targetId);
    if (rec?.status === "accepted") throw new Error("Ya son amigos");
    if (rec && rec.by === userId) throw new Error("Ya le enviaste una solicitud");
    if (rec) return this.accept(userId, targetId, now);
    this.assertCanAsk(userId, now);
    if (this.outgoing(userId).length >= FRIEND_LIMITS.pending) throw new Error("Tienes demasiadas solicitudes pendientes");
    if (this.friendsOf(userId).length >= FRIEND_LIMITS.friends) throw new Error("Llegaste al máximo de amigos");
    this.save({ a: userId < targetId ? userId : targetId, b: userId < targetId ? targetId : userId, status: "pending", by: userId, at: now, acceptedAt: null });
    return "pending";
  }

  /** Asks the account with this username (typed, or from a link). */
  requestByUsername(userId, username, now = Date.now()) {
    const target = findByUsername(this.store, username);
    if (!target) throw new Error("No encontramos a nadie con ese usuario");
    return { status: this.request(userId, target.id, now), other: target.id };
  }

  /** Searching people is limited per account, so the usernames can't be listed. */
  assertCanSearch(userId, now = Date.now()) {
    const times = (this.searches.get(userId) || []).filter((t) => now - t < 60_000);
    if (times.length >= FRIEND_LIMITS.searchesPerMinute) throw new Error("Estás buscando muy rápido. Espera un momento.");
    times.push(now);
    this.searches.set(userId, times);
  }

  /** Where this account stands with another: "friends", "asked" (we asked), "asking" (they asked us) or "none". */
  relation(userId, otherId) {
    if (userId === otherId) return "self";
    const rec = this.get(userId, otherId);
    if (!rec) return "none";
    return rec.status === "accepted" ? "friends" : rec.by === userId ? "asked" : "asking";
  }

  accept(userId, otherId, now = Date.now()) {
    const rec = this.get(userId, otherId);
    if (!rec || rec.status !== "pending" || rec.by === userId) throw new Error("No hay una solicitud de esa persona");
    if (this.friendsOf(userId).length >= FRIEND_LIMITS.friends) throw new Error("Llegaste al máximo de amigos");
    if (this.friendsOf(otherId).length >= FRIEND_LIMITS.friends) throw new Error("Esa persona llegó al máximo de amigos");
    this.save({ ...rec, status: "accepted", acceptedAt: now });
    return "accepted";
  }

  /** Declines a request sent to you, cancels one you sent, or ends a friendship. */
  remove(userId, otherId) {
    if (!this.get(userId, otherId)) throw new Error("No son amigos");
    this.drop(userId, otherId);
  }

  /** Everything of an account that is going away. Returns who had a pair with it. */
  removeAllOf(userId) {
    const others = [...this.pairs.values()].filter((r) => r.a === userId || r.b === userId).map((r) => this.other(r, userId));
    for (const other of others) this.drop(userId, other);
    return others;
  }
}
