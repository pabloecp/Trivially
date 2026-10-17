import { Router } from "express";
import { userByFriendCode, isAccount } from "./friendCode.js";

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

  router.get("/", guard((req) => hub.view(req.userId)));

  // Who a code belongs to, before sending the request ("Añadir a Dani").
  router.get("/code/:code", guard((req) => {
    const target = userByFriendCode(store, req.params.code);
    if (!target) throw new Error("No encontramos ese código de amigo");
    const relation =
      target.id === req.userId ? "self" : friends.areFriends(req.userId, target.id) ? "friends" : friends.get(req.userId, target.id) ? (friends.get(req.userId, target.id).by === req.userId ? "asked" : "asking") : "none";
    return { name: target.name, avatar: target.avatar, relation };
  }));

  // By code, or (for someone in the same room) by id: "Añadir amigo" in a player's menu.
  router.post("/request", guard((req) => {
    const { code, userId } = req.body || {};
    let result;
    if (code) {
      result = friends.requestByCode(req.userId, code);
    } else if (userId) {
      const room = rooms.roomOfUser(req.userId);
      if (!room || rooms.roomOfUser(String(userId)) !== room) throw new Error("Solo puedes añadir a quien está en tu sala");
      result = { status: friends.request(req.userId, String(userId)), other: String(userId) };
    } else {
      throw new Error("Falta el código de amigo");
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
