import { useEffect, useRef } from "react";
import { useApp } from "./store.jsx";
import { installClickSounds, play } from "./sounds.js";

// Whether a player's round counts as right for the sounds (a near answer, a pin or a year, from half the points on).
const isRight = (p) => Boolean(p?.lastAnswer && !p.lastAnswer.skipped && (p.lastAnswer.correct || p.lastPoints >= 500));

// The sounds that come from the room rather than from a click of this player's:
//  - a round's reveal: right or wrong (a near answer, a pin or a year, counts as right from half the points on);
//  - Campo de minas, while it is played: each right answer found, and the mine stepped on, at once (Lluvia's own
//    answers sound on the screen that sent them, lluvia/Game.jsx);
//  - what the host does, for everyone else: a game picked or a match started (next), back to the menu or the lobby
//    (back). The host already heard their own click.
// With a central device in the room the match's sounds are its own: it plays every round's start, the reveal (right
// when anyone got it) and everyone's hits and mines (Lluvia's hits too), while the players' phones keep quiet about them (their screen
// still says how they did).
// It also installs the clicks' sounds (lib/sounds.js).
export default function RoomSounds() {
  const { user, room, isCentral } = useApp();
  const prev = useRef(null);

  useEffect(() => installClickSounds(), []);

  useEffect(() => {
    const before = prev.current;
    const players = (room?.players || []).filter((p) => !p.spectator);
    const me = isCentral ? null : room?.players?.find((p) => p.id === user?.id) || null;
    prev.current = room
      ? {
          code: room.code,
          phase: room.phase,
          game: room.game,
          round: room.currentRound,
          hits: me?.hits || 0,
          out: me?.out || null,
          allHits: players.reduce((n, p) => n + (p.hits || 0), 0),
          allOut: players.filter((p) => p.out === "mina").length,
        }
      : null;
    if (!room || !before || before.code !== room.code) return;

    const mines = room.game === "minas";
    const rain = room.game === "lluvia";
    const countdown = room.phase === "countdown" && (before.phase !== "countdown" || before.round !== room.currentRound);

    if (isCentral) {
      if (room.phase === "reveal" && before.phase !== "reveal") {
        if (!mines) play(players.some(isRight) ? "correct" : "wrong");
      } else if ((mines || rain) && room.phase === "playing" && before.phase === "playing") {
        if (players.filter((p) => p.out === "mina").length > before.allOut) play("wrong");
        else if (players.reduce((n, p) => n + (p.hits || 0), 0) > before.allHits) play("correct");
      } else if (countdown) play("next");
      else if (room.phase === "lobby" && before.phase === "finished") play("back");
      else if (room.phase === "lobby" && before.phase === "lobby" && room.game !== before.game) play(room.game ? "next" : "back");
      return;
    }

    if (!me) return;
    // A player's phone while the room's central device shows the match: the match's sounds are that screen's.
    const quiet = Boolean(room.central?.connected);
    if (room.phase === "reveal" && before.phase !== "reveal") {
      const a = me.lastAnswer;
      if (quiet || mines || me.spectator || !a || a.skipped) return;
      play(isRight(me) ? "correct" : "wrong");
      return;
    }
    if (mines && room.phase === "playing" && before.phase === "playing") {
      if (quiet) return;
      if (me.out && !before.out) play("wrong");
      else if ((me.hits || 0) > before.hits) play("correct");
      return;
    }

    if (room.hostId === user?.id) return;
    if (room.phase === "countdown" && (before.phase === "lobby" || before.phase === "finished")) play("next");
    else if (room.phase === "lobby" && before.phase === "finished") play("back");
    else if (room.phase === "lobby" && before.phase === "lobby" && room.game !== before.game) play(room.game ? "next" : "back");
  }, [room, user?.id, isCentral]);

  return null;
}
