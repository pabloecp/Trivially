import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { findMode } from "../../modes/index.js";

// How many rounds show at once; the rest scroll under the fixed head.
const VISIBLE = 3;

// How each round went (RoomManager.recordRound): its icon and what the player's line says.
const STATUS = {
  ok: { icon: "check", label: "Acertaste" },
  near: { icon: "target", label: "Cerca" },
  bad: { icon: "close", label: "Fallaste" },
  none: { icon: "hash", label: "Sin responder" },
};

// The whole match round by round for this player (results[].rounds), in the Jugar sheet's look (a card in the
// middle on wide screens, a sheet from the bottom on phones): each question, the right answer, what they answered and
// the points (in a playlist, `showGame` adds each round's game). The head stays put and the rounds scroll under it, VISIBLE at a time, snapping to each one, with the
// same thin scroll bar as a playlist's games. Escape, the close button and a tap outside close it.
export default function MatchSummarySheet({ open, rounds, onClose, title = "Tu partida", showGame = false }) {
  const [mounted, setMounted] = useState(open);
  const closeRef = useRef(null);
  const listRef = useRef(null);
  // The list's height: exactly its first VISIBLE rounds (they aren't all as tall).
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

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !mounted || !list) return undefined;
    function fit() {
      const items = list.children;
      if (items.length <= VISIBLE) return setListHeight(null);
      const first = items[0];
      const last = items[VISIBLE - 1];
      setListHeight(last.offsetTop + last.offsetHeight - first.offsetTop);
    }
    fit();
    list.scrollTop = 0;
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, mounted, rounds.length]);

  if (!mounted) return null;

  function onAnimationEnd(e) {
    if (!open && e.target === e.currentTarget) setMounted(false);
  }

  const right = rounds.filter((r) => r.status === "ok").length;
  const total = rounds.reduce((sum, r) => sum + (r.points || 0), 0);

  return (
    <div className={`tv-sheet-root ${open ? "is-open" : "is-closing"}`}>
      <div className="tv-sheet-backdrop" onClick={onClose} />
      <div className="tv-sheet-pos">
        <div
          className="tv-sheet tv-sheet--summary"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-summary-title"
          onAnimationEnd={onAnimationEnd}
        >
          <div className="tv-sheet-head">
            <span className="tv-badge tv-c-accent">
              <Icon name="list" size={24} strokeWidth={2.4} />
            </span>
            <span className="tv-summary-head">
              <h2 id="tv-summary-title" className="tv-sheet-title">{title}</h2>
              <small>
                {right} de {rounds.length} acertadas · {total.toLocaleString("es-ES")} pts
              </small>
            </span>
            <button ref={closeRef} type="button" className="tv-summary-close" data-sound="back" onClick={onClose} aria-label="Cerrar">
              <Icon name="close" size={20} />
            </button>
          </div>
          <ol ref={listRef} className="tv-summary" style={listHeight ? { maxHeight: listHeight } : undefined}>
            {rounds.map((r) => {
              const status = STATUS[r.status] || STATUS.none;
              return (
                <li key={`${r.round}-${r.game}-${r.prompt}`} className={`tv-summary-round is-${r.status}`}>
                  <span className="tv-summary-top">
                    <span className="tv-summary-num">
                      Ronda {r.round}
                      {showGame && r.game ? ` · ${findMode(r.game)?.name || ""}` : ""}
                    </span>
                    <span className="tv-summary-points">+{(r.points || 0).toLocaleString("es-ES")}</span>
                  </span>
                  {r.prompt && <p className="tv-summary-prompt">{r.prompt}</p>}
                  {r.answer && r.status !== "ok" && (
                    <p className="tv-summary-line is-right">
                      <Icon name="check" size={16} strokeWidth={3} />
                      <span>{r.answer}</span>
                    </p>
                  )}
                  <p className="tv-summary-line is-yours">
                    <Icon name={status.icon} size={16} strokeWidth={3} />
                    <span>{r.yours ? (r.status === "ok" && r.answer ? r.answer : r.yours) : status.label}</span>
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
