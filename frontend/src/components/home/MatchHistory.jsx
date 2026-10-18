import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { api } from "../../lib/api.js";
import { findMode } from "../../modes/index.js";
// Each game's colour lives in its own styles.
import "../../styles/quiz.css";
import "../../styles/history.css";
import "../../styles/mines.css";
import "../../styles/playlist.css";

// "Hoy, 18:30", "Ayer, 21:05", "12 oct".
function whenText(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(date)) / 86400000);
  if (days === 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return date.toLocaleDateString("es", { day: "numeric", month: "short", ...(days > 300 ? { year: "numeric" } : {}) });
}

// How many matches show before "Ver todas" (the server keeps the last ten).
const FIRST = 3;

// "1 jugador", "4 jugadores".
const playersText = (n) => `${n} ${n === 1 ? "jugador" : "jugadores"}`;

// "Reportar" on one of this account's matches: the first tap turns it red to confirm, the second sends the whole match
// as a question report (POST /api/history/report: every question with its answer), and it stays "Reportada".
function ReportMatch({ match, onError, onReported }) {
  const [state, setState] = useState(match.reported ? "sent" : "idle");
  // Reported from the other list (the profile's or "Ver todas"): this one shows it too.
  useEffect(() => {
    if (match.reported) setState("sent");
  }, [match.reported]);

  // Not confirmed in a few seconds: back to the start.
  useEffect(() => {
    if (state !== "confirm") return undefined;
    const t = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(t);
  }, [state]);

  async function onClick() {
    if (state === "idle") return setState("confirm");
    if (state !== "confirm") return;
    setState("sending");
    try {
      await api("/api/history/report", { method: "POST", body: { at: match.at } });
      setState("sent");
      onReported?.(match.at);
    } catch (e) {
      setState("idle");
      onError?.(e.message || "No se pudo enviar el reporte");
    }
  }

  const label = { idle: "Reportar", confirm: "¿Enviar?", sending: "Enviando…", sent: "Reportada" }[state];
  return (
    <button
      type="button"
      className={`tv-history-report${state === "confirm" ? " is-on" : ""}`}
      onClick={onClick}
      onBlur={() => state === "confirm" && setState("idle")}
      disabled={state === "sending" || state === "sent"}
      aria-label={state === "idle" ? "Reportar esta partida" : label}
    >
      <Icon name={state === "sent" ? "check" : "flag"} size={13} strokeWidth={2.6} />
      <span>{label}</span>
    </button>
  );
}

// One match of the history: the game with its icon and colour, when, how many played, the place and the points, and
// on this account's own profile its "Reportar" (a match saved before the questions were kept sends only the match).
function MatchRow({ match: m, canReport, onError, onReported }) {
  const mode = findMode(m.game);
  const first = m.position === 1 && m.players > 1;
  return (
    <li className={`tv-history-row tv-c-${mode?.color || "neutral"}`}>
      <span className="tv-history-icon" aria-hidden="true">
        <Icon name={mode?.icon || "play"} size={20} />
      </span>
      <span className="tv-history-main">
        <strong>{mode?.name || "Partida"}</strong>
        <small>
          {whenText(m.at)} · {playersText(m.players || 1)}
        </small>
      </span>
      {canReport && <ReportMatch match={m} onError={onError} onReported={onReported} />}
      <span className={`tv-history-place${first ? " is-first" : ""}`}>
        {first && <Icon name="crown" size={14} filled strokeWidth={1.6} />}
        <strong>{m.position}.º</strong>
        <small>{(m.score || 0).toLocaleString("es-ES")} pts</small>
      </span>
    </li>
  );
}

// How many matches show at once in "Ver todas"; the rest scroll under the fixed head.
const SHEET_VISIBLE = 5;

// "Ver todas": every match kept, in the same window as a match's answers (MatchSummarySheet: the Jugar sheet's look,
// the head fixed, the list scrolling under it SHEET_VISIBLE at a time with the same thin bar). Escape, the close
// button and a tap outside close it.
function HistorySheet({ open, matches, canReport, onError, onReported, onClose }) {
  const [mounted, setMounted] = useState(open);
  const closeRef = useRef(null);
  const listRef = useRef(null);
  const [listHeight, setListHeight] = useState(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return undefined;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, mounted]);

  // The list's height: exactly its first SHEET_VISIBLE matches.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !mounted || !list) return undefined;
    function fit() {
      const items = list.children;
      if (items.length <= SHEET_VISIBLE) return setListHeight(null);
      const last = items[SHEET_VISIBLE - 1];
      setListHeight(last.offsetTop + last.offsetHeight - items[0].offsetTop);
    }
    fit();
    list.scrollTop = 0;
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, mounted, matches.length]);

  if (!mounted) return null;

  function onAnimationEnd(e) {
    if (!open && e.target === e.currentTarget) setMounted(false);
  }

  return (
    <div className={`tv-sheet-root ${open ? "is-open" : "is-closing"}`}>
      <div className="tv-sheet-backdrop" onClick={onClose} />
      <div className="tv-sheet-pos">
        <div
          className="tv-sheet tv-sheet--summary"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-history-sheet-title"
          onAnimationEnd={onAnimationEnd}
        >
          <div className="tv-sheet-head">
            <span className="tv-badge tv-c-accent">
              <Icon name="list" size={24} strokeWidth={2.4} />
            </span>
            <span className="tv-summary-head">
              <h2 id="tv-history-sheet-title" className="tv-sheet-title">
                Historial
              </h2>
              <small>{matches.length === 1 ? "1 partida" : `Tus últimas ${matches.length} partidas`}</small>
            </span>
            <button
              ref={closeRef}
              type="button"
              className="tv-summary-close"
              data-sound="back"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <ol
            ref={listRef}
            className="tv-summary tv-history-sheet"
            style={listHeight ? { maxHeight: listHeight } : undefined}
          >
            {matches.map((m) => (
              <MatchRow key={m.at} match={m} canReport={canReport} onError={onError} onReported={onReported} />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * The profile's match history (user.history, newest first; the server keeps the last ten, db/store.js
 * applyMatchStats). The first FIRST show; "Ver todas" opens every match in a window (HistorySheet). On this account's
 * own profile (`canReport`), each match can be reported, all its questions at once.
 */
export default function MatchHistory({ matches: saved = [], canReport = false, onError }) {
  const [open, setOpen] = useState(false);
  // Matches reported on this visit, so both lists show "Reportada" without reloading the profile.
  const [reported, setReported] = useState(() => new Set());
  const onReported = (at) => setReported((set) => new Set(set).add(at));
  const matches = saved.map((m) => (reported.has(m.at) ? { ...m, reported: true } : m));
  if (!matches.length) return <p className="tv-hint tv-history-empty">Aún no hay partidas terminadas.</p>;
  return (
    <>
      <ol className="tv-history">
        {matches.slice(0, FIRST).map((m) => (
          <MatchRow key={m.at} match={m} canReport={canReport} onError={onError} onReported={onReported} />
        ))}
      </ol>
      {matches.length > FIRST && (
        <button type="button" className="tv-history-more" onClick={() => setOpen(true)}>
          Ver todas ({matches.length})
        </button>
      )}
      <HistorySheet
        onReported={onReported}
        open={open}
        matches={matches}
        canReport={canReport}
        onError={onError}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
