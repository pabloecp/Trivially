import Blob from "./Blob.jsx";
import { RankMark } from "./Ratings.jsx";
import { blobColor } from "../../lib/blobColors.js";
import { formatElo } from "../../lib/gameStats.js";
import { rankInfo } from "../../lib/rank.js";

// Beside the Clásico's card (Inicio, before each of its games): your rank, where every game has your elo. The name with
// its division, the way to the next one, and your Blob in the box's empty side.
export default function RankBox({ user }) {
  const info = rankInfo(user?.rank);
  return (
    <div className="tv-stage-box tv-stage-elo tv-stage-rank">
      <div className="tv-stage-elo-text">
        <span className="tv-stage-label">
          Rango en
          <br />
          Clásico
        </span>
        <strong className="tv-stage-rank-name" style={{ color: info.tier.color }}>
          <RankMark info={info} size={26} />
          {info.label}
        </strong>
        <span className="tv-stage-rank-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.progress * 100)} aria-label="Avance del rango" style={{ "--tier": info.tier.color }}>
          <i style={{ width: `${Math.round(info.progress * 100)}%` }} />
        </span>
        <span className="tv-stage-rank-next">{info.toNext != null ? `Faltan ${formatElo(info.toNext)} para ${info.nextLabel}` : `${formatElo(info.points)} puntos`}</span>
      </div>
      <Blob className="tv-stage-blob" color={blobColor(user?.avatar)} mood="neutral" />
    </div>
  );
}
