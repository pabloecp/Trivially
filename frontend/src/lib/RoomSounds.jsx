import { useEffect, useRef } from "react";
import { useApp } from "./store.jsx";
import { installClickSounds, play } from "./sounds.js";

// The sounds that come from the room rather than from a click of this player's:
//  - a round's reveal: right or wrong (a near answer, a pin or a year, counts as right from half the points on);
//  - Campo de minas, while it is played: each right answer found, and the mine stepped on, at once;
//  - a chat message from someone else: a soft tap;
//  - what the host does, for everyone else: a game picked or a match started (next), back to the menu or the lobby
//    (back). The host already heard their own click.
// It also installs the clicks' sounds (lib/sounds.js).
export default function RoomSounds() {
  const { user, room } = useApp();
  const prev = useRef(null);

  useEffect(() => installClickSounds(), []);

  // A chat message from someone else (not the ones already there when the room was entered).
  const lastChat = useRef(null);
  const newestChat = room?.chat?.at(-1) || null;
  useEffect(() => {
    const key = room ? `${room.code}:${newestChat?.id ?? 0}` : null;
    const was = lastChat.current;
    lastChat.current = key;
    if (!was || !key || was === key || was.split(":")[0] !== room.code) return;
    if (newestChat && newestChat.userId !== user?.id) play("tap");
  }, [room?.code, newestChat?.id]);

  useEffect(() => {
    const before = prev.current;
    const me = room?.players?.find((p) => p.id === user?.id) || null;
    prev.current = room ? { code: room.code, phase: room.phase, game: room.game, hits: me?.hits || 0, out: me?.out || null } : null;
    if (!room || !before || before.code !== room.code || !me) return;

    const mines = room.game === "minas";
    if (room.phase === "reveal" && before.phase !== "reveal") {
      const a = me.lastAnswer;
      if (mines || me.spectator || !a || a.skipped) return;
      play(a.correct || me.lastPoints >= 500 ? "correct" : "wrong");
      return;
    }
    if (mines && room.phase === "playing" && before.phase === "playing") {
      if (me.out && !before.out) play("wrong");
      else if ((me.hits || 0) > before.hits) play("correct");
      return;
    }

    if (room.hostId === user?.id) return;
    if (room.phase === "countdown" && (before.phase === "lobby" || before.phase === "finished")) play("next");
    else if (room.phase === "lobby" && before.phase === "finished") play("back");
    else if (room.phase === "lobby" && before.phase === "lobby" && room.game !== before.game) play(room.game ? "next" : "back");
  }, [room, user?.id]);

  return null;
}
