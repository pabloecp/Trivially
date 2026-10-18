import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// Every player: "Reportar", left of "Pausar", sends the question being played to be checked later (with its settings
// and who was in the room; RoomManager.questionReport). The first tap turns it red to confirm, the second sends it, and
// it stays "Reportada" until the next round.
export function ReportButton({ room, onError }) {
  const { isCentral, reportQuestion } = useApp();
  const [state, setState] = useState("idle");
  const round = `${room?.currentRound}|${room?.tiebreak?.round ?? ""}`;

  // A new round can be reported again.
  useEffect(() => setState("idle"), [round]);
  // Not confirmed in a few seconds: back to the start.
  useEffect(() => {
    if (state !== "confirm") return undefined;
    const t = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(t);
  }, [state]);

  // Not on the room's central device: it only shows the match.
  if (isCentral || !["countdown", "playing", "reveal"].includes(room?.phase)) return null;

  async function onClick() {
    if (state === "idle") return setState("confirm");
    if (state !== "confirm") return;
    setState("sending");
    try {
      await reportQuestion();
      setState("sent");
    } catch (e) {
      setState("idle");
      onError?.(e.message || "No se pudo enviar el reporte");
    }
  }

  const label = { idle: "Reportar", confirm: "¿Enviar reporte?", sending: "Enviando…", sent: "Reportada" }[state];
  return (
    <button
      type="button"
      className={`tv-mini-btn tv-report-btn${state === "confirm" ? " is-on" : ""}`}
      onClick={onClick}
      onBlur={() => state === "confirm" && setState("idle")}
      disabled={state === "sending" || state === "sent"}
      aria-label={label}
    >
      <Icon name={state === "sent" ? "check" : "flag"} size={13} strokeWidth={2.6} />
      <span className="tv-pause-label">{label}</span>
    </button>
  );
}

// Owners only: "Saltar", beside "Reportar", goes straight to the next question for everyone, with no reveal and no
// countdown (RoomManager.skipRound; what was already answered still counts). Not on the room's central device.
export function SkipButton({ room, onError }) {
  const { user, isCentral, skipRound } = useApp();
  const [busy, setBusy] = useState(false);
  if (isCentral || user?.role !== "owner" || !["countdown", "playing", "reveal"].includes(room?.phase)) return null;

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await skipRound();
    } catch (e) {
      onError?.(e.message || "No se pudo saltar la pregunta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="tv-mini-btn tv-skip-btn" onClick={onClick} disabled={busy} aria-label="Saltar a la siguiente pregunta">
      <Icon name="skip" size={13} filled strokeWidth={2.2} />
      <span className="tv-pause-label">Saltar</span>
    </button>
  );
}

// The host's "Pausar" / "Reanudar", next to "Terminar" on every game's screen: it stops the clock for everyone
// (RoomManager.pause), and nobody can answer until it goes on. On phones only its icon shows, so the round's title
// keeps its room.
export function PauseButton({ room, isHost, onError }) {
  const { pauseGame } = useApp();
  if (!isHost || !["countdown", "playing", "reveal"].includes(room?.phase)) return null;
  return (
    <button
      type="button"
      className={`tv-mini-btn tv-pause-btn${room.paused ? " is-on" : ""}`}
      onClick={() => pauseGame(!room.paused).catch((e) => onError?.(e.message || "No se pudo pausar la partida"))}
      aria-label={room.paused ? "Reanudar" : "Pausar"}
    >
      <Icon name={room.paused ? "play" : "pause"} size={13} filled strokeWidth={0} />
      <span className="tv-pause-label">{room.paused ? "Reanudar" : "Pausar"}</span>
    </button>
  );
}

// Over a game's stage while the match is paused, so nobody tries to answer.
export function PauseVeil({ room, isHost }) {
  if (!room?.paused) return null;
  return (
    <div className="tv-pause-veil" role="status">
      <Icon name="pause" size={30} filled strokeWidth={0} />
      <strong>Partida en pausa</strong>
      <span>{isHost ? "Toca ▶ arriba para seguir." : "El anfitrión la reanudará en breve."}</span>
    </div>
  );
}
