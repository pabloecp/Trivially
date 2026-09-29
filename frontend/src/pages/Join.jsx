import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";

export default function Join() {
  const [code, setCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, saveGuest, joinRoom } = useApp();
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;

    setLoading(true);
    setErr("");
    try {
      let currentUser = user;
      if (!currentUser?.name) {
        const clean = guestName.trim() || `Jugador${Math.floor(100 + Math.random() * 900)}`;
        currentUser = await saveGuest(clean);
      }
      const state = await joinRoom(cleanCode, currentUser);
      nav(`/lobby/${state.code}`);
    } catch (error) {
      setErr(error.message || "No se pudo conectar a la sala");
      setLoading(false);
    }
  }

  return (
    <div className="grid page-compact" style={{ margin: "40px auto" }}>
      <form className="card grid" style={{ padding: 36, gap: 20 }} onSubmit={onSubmit}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <YoavllySymbol size={44} />
          </div>
          <div className="kicker">Partida Multijugador</div>
          <h1 style={{ fontSize: 26, margin: "4px 0" }}>Unirse a una Sala</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Introduce el código de sala compartido por tu amigo (inicia con XO)
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
            Código de la sala
          </label>
          <input
            className="field"
            placeholder="XO...."
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().slice(0, 6));
              setErr("");
            }}
            style={{
              textAlign: "center",
              fontSize: 26,
              fontFamily: "'Outfit', monospace",
              fontWeight: 900,
              letterSpacing: "0.2em",
              padding: "14px 12px",
            }}
            autoFocus
          />
        </div>

        {/* If user does not have a name yet */}
        {!user?.name && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
              Nombre de usuario
            </label>
            <input
              className="field"
              placeholder="(Ej. Singularity)"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={20}
              required
            />
          </div>
        )}

        {err && (
          <div className="card" style={{ padding: 12, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
            <p className="error" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>{err}</p>
          </div>
        )}

        <button
          className="btn primary lg"
          disabled={loading || code.trim().length < 4}
          type="submit"
        >
          {loading ? "Entrando..." : "Unirse a la Sala"}
        </button>

        <div style={{ textAlign: "center" }}>
          <Link to="/play" className="btn ghost sm">
            Volver a Modos de Juego
          </Link>
        </div>
      </form>
    </div>
  );
}
