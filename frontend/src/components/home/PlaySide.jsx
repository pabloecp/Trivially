import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useFriends } from "../../lib/friends.jsx";
import { rankInfo } from "../../lib/rank.js";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import { statusOf } from "./FriendsSheet.jsx";
import Icon from "./Icon.jsx";
import MatchHistory from "./MatchHistory.jsx";

// How many online friends the column lists; the rest are in the friends sheet.
const SHOWN = 4;
const STATS = [
  { key: "gamesPlayed", label: "Partidas" },
  { key: "wins", label: "Victorias" },
  { key: "bestStreak", label: "Mejor racha" },
];
// What a guest gets by making an account.
const PERKS = [
  { icon: "star", text: "Tus puntos y estadísticas se guardan" },
  { icon: "scroll", text: "Historial de tus partidas" },
  { icon: "users", text: "Amigos: ve sus salas y entra con un toque" },
  { icon: "crown", text: "Apareces en la clasificación" },
];

/**
 * Who plays: name and @username (or the guest's way to an account), and under it, in a public match (Casual or
 * Competitivo, `match`) the rank, or in Privada a few stats. The same card at the top of /jugar's column and of a
 * public match's room column (PartyPanel), so it stays put from one to the other. `refreshOn` changing asks the server
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

// /jugar's column, where the room's column (PartyPanel) is once in a room, so the page keeps the room's widths: the
// player (PlayerCard), their history and, in Privada only, the friends who are online and the friends sheet. `kind` is
// the option on screen; `out` while it goes (back to the three options), sinking with the card and the settings.
export default function PlaySide({ kind = null, out = false }) {
  const { user } = useApp();
  const match = kind === "casual" || kind === "competitivo";
  // Friends only matter for a private room: a public match is with strangers.
  const social = kind === "privada";
  const perks = match ? [{ icon: "crown", text: "Tu rango en Competitivo" }, ...PERKS] : PERKS;
  const friends = useFriends();
  const isAccount = friends.isAccount;
  const online = (friends.view?.friends || []).filter((f) => f.online);
  const matches = Array.isArray(user?.history) ? user.history : [];

  return (
    <aside className={`tv-party tv-play-side${out ? " is-out" : ""}`} aria-label="Tú">
      <PlayerCard match={match} />

      {!isAccount && (
        <div className="tv-play-friends">
          <div className="tv-party-title">
            <h2>Con una cuenta</h2>
          </div>
          <ul className="tv-play-perks">
            {perks.map((p) => (
              <li key={p.text}>
                <Icon name={p.icon} size={18} strokeWidth={2.4} />
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAccount && (
        <div className="tv-play-friends tv-play-history">
          <MatchHistory matches={matches} title="Historial" />
        </div>
      )}

      {isAccount && social && (
        <div className="tv-play-friends">
          <div className="tv-party-title">
            <h2>Amigos conectados</h2>
            {online.length > 0 && <span>{online.length === 1 ? "1 conectado" : `${online.length} conectados`}</span>}
          </div>
          {online.length ? (
            <ul className="tv-invite-friends-list">
              {online.slice(0, SHOWN).map((f) => (
                <li key={f.id} className="tv-invite-friend">
                  <Avatar name={f.name} avatar={f.avatar} />
                  <span className="tv-invite-friend-text">
                    <strong>{f.name}</strong>
                    <small>{statusOf(f)}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tv-invite-friends-none">Ninguno de tus amigos está conectado ahora</p>
          )}
        </div>
      )}

      {isAccount && social && (
        <div className="tv-party-chatbar">
          <button type="button" className="tv-party-chatbtn" onClick={() => friends.setOpen(true)}>
            <Icon name="users" size={18} strokeWidth={2.4} />
            Amigos
            {friends.pending > 0 && <span className="tv-play-side-badge">{friends.pending}</span>}
          </button>
        </div>
      )}
    </aside>
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
