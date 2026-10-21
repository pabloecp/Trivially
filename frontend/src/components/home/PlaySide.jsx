import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useFriends } from "../../lib/friends.jsx";
import { rankInfo } from "../../lib/rank.js";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

const STATS = [
  { key: "gamesPlayed", label: "Partidas" },
  { key: "wins", label: "Victorias" },
  { key: "bestStreak", label: "Mejor racha" },
];
/**
 * Who plays: name and @username (or the guest's way to an account), and under it, in a public match (Casual or
 * Competitivo, `match`) the rank, or in Privada a few stats. The card at the top of a public match's room column
 * (PartyPanel). `refreshOn` changing asks the server
 * for the account again (a finished match moves its rank and history).
 */
export function PlayerCard({ match = false, refreshOn = null }) {
  const { user, refreshUser } = useApp();
  const isAccount = useFriends().isAccount;
  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, [refreshOn]);
  const stats = user?.stats || {};
  return (
    <div className="tv-party-codebox tv-play-me">
        <div className="tv-play-me-row">
          <Avatar name={user?.name || "?"} avatar={user?.avatar} className="tv-avatar--lg" />
          <span className="tv-play-me-text">
            <strong>{user?.name || "Sin nombre"}</strong>
            <small>{isAccount ? (user.username ? `@${user.username}` : "Tu cuenta") : user?.name ? "Invitado" : "Aún no tienes nombre"}</small>
          </span>
        </div>
        {isAccount && match ? (
          <RankCard rank={user?.rank} />
        ) : isAccount ? (
          <dl className="tv-play-me-stats">
            {STATS.map((s) => (
              <div key={s.key}>
                <dt>{s.label}</dt>
                <dd>{stats[s.key] || 0}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="tv-play-me-guest">
            <p>Juegas como invitado: tus puntos no se guardan.</p>
            <span className="tv-play-me-links">
              <Link to="/login" className="tv-btn tv-btn--sm tv-c-violet">
                Crear cuenta
              </Link>
              <Link to="/login?mode=login" className="tv-play-me-login">
                Iniciar sesión
              </Link>
            </span>
          </div>
        )}
    </div>
  );
}

// The rank (lib/rank.js): the tier's crown in its colour, "Oro II" and the points, and a bar to the next step.
function RankCard({ rank }) {
  const info = rankInfo(rank);
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
