import { rankInfo } from "../../lib/rank.js";
import Icon from "./Icon.jsx";

// The rank (lib/rank.js): the tier's crown in its colour, "Oro II" and the points, and a bar to the next step. Also on
// Competitivo's ticket (PlayPage).
export function RankCard({ rank, card = false }) {
  const info = rankInfo(rank);
  // On the public match's ticket: a card of its own, the badge beside the tier and its points, the progress bar under.
  if (card) {
    return (
      <div className="tv-play-rank is-card" style={{ "--rank": info.tier.color }}>
        <span className="tv-play-rank-badge" aria-hidden="true">
          <Icon name="crown" size={26} strokeWidth={2.2} filled />
        </span>
        <div className="tv-play-rank-main">
          <div className="tv-play-rank-head">
            <strong>{info.label}</strong>
            <span>{info.points.toLocaleString("es-ES")} pts</span>
          </div>
          <div className="tv-play-rank-bar" role="progressbar" aria-label={`Progreso hacia ${info.nextLabel || "el máximo"}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.progress * 100)}>
            <span style={{ width: `${Math.round(info.progress * 100)}%` }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="tv-play-rank" style={{ "--rank": info.tier.color }}>
      <div className="tv-play-rank-row">
        <span className="tv-play-rank-badge" aria-hidden="true">
          <Icon name="crown" size={22} strokeWidth={2.2} filled />
        </span>
        <span className="tv-play-rank-text">
          <small>Tu rango</small>
          <strong>{info.label}</strong>
        </span>
        <span className="tv-play-rank-pts">
          <strong>{info.points.toLocaleString("es-ES")}</strong>
          <small>pts</small>
        </span>
      </div>
      <div className="tv-play-rank-bar" role="progressbar" aria-label={`Progreso hacia ${info.nextLabel || "el máximo"}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.progress * 100)}>
        <span style={{ width: `${Math.round(info.progress * 100)}%` }} />
      </div>
    </div>
  );
}
