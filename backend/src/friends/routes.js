import { Router } from "express";
import { findByUsername, isAccount, searchUsernames } from "../auth/username.js";

// The friends API. Who is asking always comes from the session, never from the request.
export function createFriendsRouter({ store, friends, hub, rooms }) {
  const router = Router();

  router.use((req, res, next) => {
    const user = req.session?.userId ? store.users[req.session.userId] : null;
    if (!isAccount(user)) return res.status(401).json({ error: "Inicia sesión con una cuenta para tener amigos" });
    req.userId = user.id;
    next();
  });

  const guard = (fn) => (req, res) => {
    try {
      res.json(fn(req) ?? { ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };

  // What the friends tab shows about someone found by username (never their email or id history).
  const card = (me, user) => ({ id: user.id, name: user.name, username: user.username, avatar: user.avatar, relation: friends.relation(me, user.id) });

  router.get("/", guard((req) => hub.view(req.userId)));

  // People by username, as they type (from 3 letters, at most 8 results).
  router.get("/search", guard((req) => {
    friends.assertCanSearch(req.userId);
    return { results: searchUsernames(store, req.query.q, { exceptId: req.userId }).map((u) => card(req.userId, u)) };
  }));

  // One person by exact username, for the /amigo/usuario link.
  router.get("/user/:username", guard((req) => {
    friends.assertCanSearch(req.userId);
    const user = findByUsername(store, req.params.username);
    if (!user) throw new Error("No encontramos a nadie con ese usuario");
    return card(req.userId, user);
  }));

  // By username, or (for someone in the same room) by id: "Añadir amigo" in a player's menu.
  router.post("/request", guard((req) => {
    const { username, userId } = req.body || {};
    let result;
    if (username) {
      result = friends.requestByUsername(req.userId, username);
    } else if (userId) {
      const room = rooms.roomOfUser(req.userId);
      if (!room || rooms.roomOfUser(String(userId)) !== room) throw new Error("Solo puedes añadir a quien está en tu sala");
      result = { status: friends.request(req.userId, String(userId)), other: String(userId) };
    } else {
      throw new Error("Falta el usuario");
    }
    hub.refresh(req.userId, result.other);
    return { status: result.status };
  }));

  router.post("/:id/accept", guard((req) => {
    friends.accept(req.userId, req.params.id);
    hub.refresh(req.userId, req.params.id);
  }));

  // Declines a request, cancels one you sent, or ends a friendship.
  router.post("/:id/decline", guard((req) => {
    friends.remove(req.userId, req.params.id);
    hub.refresh(req.userId, req.params.id);
  }));
  router.delete("/:id", guard((req) => {
    friends.remove(req.userId, req.params.id);
    hub.refresh(req.userId, req.params.id);
  }));

  return router;
}
