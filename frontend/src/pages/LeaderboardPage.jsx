import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useApp } from "../lib/store.jsx";
import { TriviallySymbol } from "../components/TriviallySymbol.jsx";
import UserAvatar from "../components/UserAvatar.jsx";

const SORTS = [
  { id: "totalScore", label: "Puntuación Total", icon: "🏆" },
  { id: "bestScore", label: "Mejor Partida", icon: "⭐" },
  { id: "wins", label: "Victorias", icon: "👑" },
  { id: "gamesPlayed", label: "Partidas Jugadas", icon: "🎮" },
  { id: "bestStreak", label: "Mejor Racha", icon: "🔥" },
];

export default function LeaderboardPage() {
  const { user } = useApp();
  const [sort, setSort] = useState("totalScore");
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/leaderboard?sort=${sort}`)
      .then((d) => {
        setEntries(d.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sort]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, search]);

  const getRankBadge = (pos) => {
    if (pos === 1) return <span style={{ fontSize: 20 }}>🥇</span>;
    if (pos === 2) return <span style={{ fontSize: 20 }}>🥈</span>;
    if (pos === 3) return <span style={{ fontSize: 20 }}>🥉</span>;
    return <span style={{ color: "var(--text-muted)", fontWeight: 800 }}>#{pos}</span>;
  };

  return (
    <div className="grid page-container" style={{ gap: 28 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="kicker">
            <TriviallySymbol size={16} /> Clasificación Global
          </div>
          <h1 style={{ margin: "4px 0" }}>Leaderboard Trivially</h1>
          <p className="muted" style={{ margin: 0 }}>
            Los mejores jugadores clasificados por rendimiento, velocidad y rachas de reconocimiento.
          </p>
        </div>
        <Link to="/" className="btn primary sm">
          + Jugar Ahora
        </Link>
      </div>

      {/* Sorting Tabs & Search */}
      <div className="card grid" style={{ padding: 18, gap: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 8 }}>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`btn ${sort === s.id ? "primary" : "ghost"} sm`}
                onClick={() => setSort(s.id)}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          <div style={{ minWidth: 220 }}>
            <input
              className="field"
              placeholder="🔍 Buscar jugador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "8px 14px", fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 70, textAlign: "center" }}>Pos</th>
                <th>Jugador</th>
                <th style={{ textAlign: "right" }}>Total Puntos</th>
                <th style={{ textAlign: "right" }}>Mejor Partida</th>
                <th style={{ textAlign: "right" }}>Victorias</th>
                <th style={{ textAlign: "right" }}>Partidas</th>
                <th style={{ textAlign: "right" }}>Mejor Racha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isMe = e.id === user?.id;
                return (
                  <tr
                    key={e.id}
                    style={{
                      background: isMe ? "var(--brand-subtle)" : undefined,
                    }}
                  >
                    <td style={{ textAlign: "center" }}>{getRankBadge(e.position)}</td>
                    <td>
                      <Link
                        to={`/profile/${e.id}`}
                        className="row interactive-user-cell"
                        style={{
                          gap: 10,
                          textDecoration: "none",
                          color: "inherit",
                          display: "inline-flex",
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                        title={`Ver perfil de ${e.name}`}
                      >
                        <UserAvatar
                          avatar={e.avatar}
                          name={e.name}
                          size={34}
                          style={{ transition: "transform 0.15s ease" }}
                        />
                        <div>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <strong style={{ fontSize: 15 }} className="user-name-link">
                              {e.name}
                            </strong>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {isMe && <span className="chip sm" style={{ fontSize: 10 }}>Tú</span>}
                            {e.isGuest && (
                              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                (Invitado)
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong style={{ color: "var(--brand)", fontSize: 16 }}>{e.totalScore}</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>{e.bestScore}</td>
                    <td style={{ textAlign: "right" }}>
                      {e.wins > 0 ? (
                        <span className="chip active sm" style={{ fontSize: 11 }}>
                          👑 {e.wins}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{e.gamesPlayed}</td>
                    <td style={{ textAlign: "right" }}>
                      {e.bestStreak > 1 ? (
                        <span className="chip streak sm" style={{ fontSize: 11 }}>
                          🔥 {e.bestStreak}
                        </span>
                      ) : (
                        e.bestStreak
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p className="muted">Cargando puntuaciones...</p>
          </div>
        )}

        {!loading && !filtered.length && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎵</div>
            <p className="muted" style={{ margin: 0 }}>
              {search
                ? `No se encontró ningún jugador con "${search}".`
                : "Aún no hay partidas registradas en este ranking. ¡Juega una partida para aparecer aquí!"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
