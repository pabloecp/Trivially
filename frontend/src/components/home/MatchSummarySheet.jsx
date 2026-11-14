import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import { findMode } from "../../modes/index.js";

import { locale, translate as tr } from "../../lib/i18n.js";
// How many rounds show at once; the arrows at the foot move on to the next ones.
const PAGE = 5;

// How each round went (RoomManager.recordRound): green won it all, yellow scored without winning, red lost with no points,
// grey no points and nothing answered (or a board the time ran out on).
const STATUS = {
  ok: { get label() { return tr("Acertaste"); } },
  near: { get label() { return tr("Cerca"); } },
  bad: { get label() { return tr("Fallaste"); } },
  none: { get label() { return tr("Sin responder"); } },
};
// What the card counts as "won", in each game's own words.
const WON = { historia: "exactas", minas: "superados", get lluvia() { return tr("con aciertos"); } };
// The modes of play a round can come from (Encuentra el país's and Adivina la canción's): named in its row only when the
// match had more than one.
const STYLES = { get nombre() { return tr("Nombre"); }, get sombra() { return tr("Sombra"); }, get bandera() { return tr("Bandera"); }, get titulo() { return tr("Título"); }, get letra() { return tr("Letra"); } };

// The whole match round by round for this player (results[].rounds), in the same panel as every other one (Modal):
//  - the game's card on top, in its colour (or "Varios juegos", in a playlist or a Clásico, whose rows then say their
//    game), with how many rounds they won and their points;
//  - the rounds, PAGE at a time, one row each: its number in a square coloured by how it went, the question, what they
//    answered (and the right answer after an arrow when they missed it) and the points;
//  - at the foot, which rounds are showing and the arrows to move through them.
export default function MatchSummarySheet({ open, rounds, onClose, title = tr("Tu partida") }) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (open) setPage(0);
  }, [open]);

  const games = [...new Set(rounds.map((r) => r.game).filter(Boolean))];
  const single = games.length === 1 ? findMode(games[0]) : null;
  const styles = new Set(rounds.map((r) => r.style).filter(Boolean));
  const won = rounds.filter((r) => r.status === "ok").length;
  const total = rounds.reduce((sum, r) => sum + (r.points || 0), 0);
  const pages = Math.max(1, Math.ceil(rounds.length / PAGE));
  const at = Math.min(page, pages - 1);
  const from = at * PAGE;
  const shown = rounds.slice(from, from + PAGE);
  const count = rounds.length === 1 ? tr("1 ronda") : tr("{n} rondas", { n: rounds.length });
  const sub = single ? `${count} · ${won} ${tr(WON[games[0]] || "acertadas")}` : tr("{count} · varios juegos", { count });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      className={`tv-summary-modal tv-c-${single?.color || "playlist"}`}
      foot={
        <>
          <span className="tv-summary-where">
            {tr("Rondas")}{" "}
            <b>
              {rounds.length ? from + 1 : 0}–{from + shown.length}
            </b>{" "}
            {tr("de")} {rounds.length}
          </span>
          <span className="tv-summary-nav">
            <button type="button" className="tv-iconbtn tv-summary-prev" aria-label={tr("Rondas anteriores")} disabled={at <= 0} onClick={() => setPage(at - 1)}>
              <Icon name="chevron" size={20} strokeWidth={3} />
            </button>
            <button type="button" className="tv-iconbtn" aria-label={tr("Rondas siguientes")} disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
              <Icon name="chevron" size={20} strokeWidth={3} />
            </button>
          </span>
        </>
      }
    >
      <div className="tv-summary-hero">
        <span className="tv-summary-hero-icon">
          <Icon name={single?.icon || "playlist"} size={28} strokeWidth={2.4} />
        </span>
        <span className="tv-summary-hero-text">
          <b>{single?.name || tr("Varios juegos")}</b>
          <small>{sub}</small>
        </span>
        <span className="tv-summary-hero-score">
          <b>{total.toLocaleString(locale())}</b>
          <small>{tr("puntos")}</small>
        </span>
      </div>
      <ol className="tv-summary">
        {shown.map((r) => {
          const status = STATUS[r.status] || STATUS.none;
          const yours = r.yours ? (r.status === "ok" && r.answer ? r.answer : r.yours) : status.label;
          const tag = [!single && r.game ? findMode(r.game)?.name : "", styles.size > 1 && r.style ? STYLES[r.style] : ""].filter(Boolean).join(" · ");
          return (
            <li key={`${r.round}-${r.game}-${r.prompt}`} className={`tv-summary-round is-${r.status}`}>
              <span className="tv-summary-mark" title={status.label}>
                <span className="tv-sr-only">{status.label}{tr(", ronda")} </span>
                {r.round}
              </span>
              <div className="tv-summary-body">
                <p className="tv-summary-prompt" title={r.prompt || undefined}>
                  {tag && <small>{tag}</small>}
                  {r.prompt}
                </p>
                <p className="tv-summary-answers">
                  <span className={`tv-summary-yours${r.status === "bad" && r.answer ? " is-cut" : ""}`}>{yours}</span>
                  {r.answer && r.status !== "ok" && (
                    <>
                      <Icon name="chevron" size={14} strokeWidth={3} />
                      <span className="tv-summary-right">{r.answer}</span>
                    </>
                  )}
                </p>
              </div>
              <span className="tv-summary-points">+{(r.points || 0).toLocaleString(locale())}</span>
            </li>
          );
        })}
        {/* The last page keeps the panel's height: empty rows hold the places of the missing ones. */}
        {Array.from({ length: PAGE - shown.length }, (_, i) => (
          <li key={`empty-${i}`} className="tv-summary-round is-empty" aria-hidden="true" />
        ))}
      </ol>
    </Modal>
  );
}
