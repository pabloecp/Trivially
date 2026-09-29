import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import AlbumShowcase from "../components/AlbumShowcase.jsx";

const FEATURED_ARTISTS = [
  {
    id: "bad-bunny",
    name: "Bad Bunny",
    tag: "ARTISTA OFICIAL",
    albums: "Un Verano Sin Ti · YHLQMDLG",
    image: "/artists/bad-bunny.jpg",
    spotifyUrl: "https://open.spotify.com/artist/4q3ewBCX7sLwd24euuV69X",
  },
  {
    id: "mora",
    name: "Mora",
    tag: "ARTISTA OFICIAL",
    albums: "MICRODOSIS · ESTRELLA",
    image: "/artists/mora.jpg",
    spotifyUrl: "https://open.spotify.com/artist/0Q8NcsJwoCbZOHHW63su5S",
  },
  {
    id: "rauw-alejandro",
    name: "Rauw Alejandro",
    tag: "ARTISTA OFICIAL",
    albums: "SATURNO · VICE VERSA",
    image: "/artists/rauw-alejandro.jpg",
    spotifyUrl: "https://open.spotify.com/artist/1mcTU81TzQhprhouKaTkpq",
  },
  {
    id: "travis-scott",
    name: "Travis Scott",
    tag: "ARTISTA OFICIAL",
    albums: "ASTROWORLD · UTOPIA",
    image: "/artists/travis-scott.jpg",
    spotifyUrl: "https://open.spotify.com/artist/0Y5tJX1MQlPlqiwlOH1tJY",
  },
  {
    id: "drake",
    name: "Drake",
    tag: "ARTISTA OFICIAL",
    albums: "Views · Scorpion",
    image: "/artists/drake.jpg",
    spotifyUrl: "https://open.spotify.com/artist/3TVXtAsR1Inumwj472S9r4",
  },
  {
    id: "jvke",
    name: "JVKE",
    tag: "ARTISTA OFICIAL",
    albums: "golden hour · this is what feels like",
    image: "/artists/jvke.jpg",
    spotifyUrl: "https://open.spotify.com/artist/164Uj4eKjl6zTBKfJLFKKK",
  },
];

export default function ModeSelect() {
  const { user, saveGuest, updatePlayer, createRoom, joinRoom } = useApp();
  const [code, setCode] = useState("");
  const [playerName, setPlayerName] = useState(
    () => user?.name || localStorage.getItem("yoavlly_guest_name") || ""
  );
  const [joinErr, setJoinErr] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (user?.name && !playerName) {
      setPlayerName(user.name);
    }
  }, [user?.name]);

  async function handleCreateRoom(e) {
    if (e) e.preventDefault();
    setJoinErr("");
    setCreating(true);
    try {
      const clean = playerName.trim() || user?.name || `Jugador${Math.floor(100 + Math.random() * 900)}`;
      let currentUser = user;
      if (!currentUser || currentUser.isGuest || currentUser.name !== clean) {
        if (!currentUser || currentUser.isGuest) {
          currentUser = await saveGuest(clean);
        } else {
          currentUser = await updatePlayer({ name: clean });
        }
      }
      const state = await createRoom("multi", undefined, currentUser);
      nav(`/lobby/${state.code}`);
    } catch (err) {
      setJoinErr(err.message || "Error al crear la sala");
      setCreating(false);
    }
  }

  async function handleJoinSubmit(e) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;
    setJoinErr("");
    setJoining(true);
    try {
      const clean = playerName.trim() || user?.name || `Jugador${Math.floor(100 + Math.random() * 900)}`;
      let currentUser = user;
      if (!currentUser || currentUser.isGuest || currentUser.name !== clean) {
        if (!currentUser || currentUser.isGuest) {
          currentUser = await saveGuest(clean);
        } else {
          currentUser = await updatePlayer({ name: clean });
        }
      }
      await joinRoom(cleanCode, currentUser);
      nav(`/lobby/${cleanCode}`);
    } catch (err) {
      setJoinErr(err.message || "No se pudo unir a la sala");
      setJoining(false);
    }
  }

  return (
    <div className="grid page-container" style={{ maxWidth: 1080, margin: "24px auto", gap: 28 }}>
      {/* Intro Header */}
      <div style={{ textAlign: "center", maxWidth: 780, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 900,
            margin: "0 0 14px",
            letterSpacing: "-0.025em",
            lineHeight: 1.25,
            color: "var(--text)",
          }}
        >
          Adivina antes de que acabe
        </h1>
        <p
          className="muted"
          style={{
            margin: "0 auto",
            fontSize: 16,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          Identifica canciones rápidamente y compite con amigos en salas multijugador en tiempo real
        </p>
      </div>

      {joinErr && (
        <div className="card" style={{ padding: 14, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
          <p className="error" style={{ margin: 0, fontSize: 14, textAlign: "center" }}>{joinErr}</p>
        </div>
      )}

      {/* Main Grid: Action Card + Album Showcase */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        {/* Left Column: Crear Sala & Unirse */}
        <div
          className="card"
          style={{
            padding: 32,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 24,
            boxShadow: "var(--shadow-lg)",
            borderRadius: 20,
            height: "100%",
            boxSizing: "border-box",
          }}
        >
          {/* 1. Crear Sala */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ marginBottom: 4, marginTop: 20 }}>
              <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>Crear una Nueva Sala</h2>
              <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                Crea tu sala privada al instante. Inicia solo o comparte el enlace con tus amigos para jugar juntos en tiempo real
              </p>
            </div>

            <div style={{ width: "100%", maxWidth: 360, textAlign: "left", marginTop: 40 }}>
              <label style={{ fontSize: 18, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
                Nombre de Usuario
              </label>
              <input
                className="field"
                placeholder="(Ej. Singularity)"
                value={playerName}
                onChange={(e) => {
                  const val = e.target.value;
                  setPlayerName(val);
                  if (val.trim()) {
                    localStorage.setItem("yoavlly_guest_name", val.trim());
                  }
                }}
                maxLength={20}
                style={{ width: "100%", fontSize: 14, fontWeight: 400 }}
              />
            </div>

            <button
              type="button"
              className="btn primary lg"
              onClick={handleCreateRoom}
              disabled={creating}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "16px 24px",
                fontSize: 16,
                fontWeight: 800,
                marginTop: 8,
              }}
            >
              {creating ? "Creando sala..." : "Crear Sala"}
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              o si ya tienes un código
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* 2. Unirse con Código */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <form onSubmit={handleJoinSubmit} style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ textAlign: "left" }}>
                <label style={{ fontSize: 18, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
                  Código de Sala
                </label>
                <input
                  className="field"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="(Ej. XOYOAV)"
                  maxLength={8}
                  style={{
                    width: "100%",
                    fontSize: 14,
                    fontWeight: 400,
                    letterSpacing: code ? "0.08em" : "normal",
                    textTransform: code ? "uppercase" : "none",
                  }}
                />
              </div>
              <button
                type="submit"
                className="btn secondary lg"
                disabled={joining || !code.trim()}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                {joining ? "Entrando..." : "Unirse a la Sala"}
              </button>

              {!user?.name && (
                <div style={{ textAlign: "center", marginTop: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    ¿Tienes una cuenta registrada?{" "}
                    <Link to="/login" style={{ color: "var(--brand)", fontWeight: 700 }}>
                      Inicia sesión
                    </Link>
                  </span>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column: Álbumes en Rotación (AlbumShowcase) */}
        <AlbumShowcase style={{ height: "100%" }} />
      </div>

      {/* Featured Artists Section */}
      <div style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 20 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              margin: "0 0 6px",
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            Artistas Destacados
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            Catálogo de canciones con audio de alta calidad
          </p>
        </div>

        <div className="featured-artists-grid">
                  {FEATURED_ARTISTS.map((artist) => (
            <a
              key={artist.id}
              href={artist.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="featured-artist-card"
              style={{ textDecoration: "none" }}
            >
              <img
                src={artist.image}
                alt={artist.name}
                className="featured-artist-img"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/600x600bb.jpg";
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--brand)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 3,
                  }}
                >
                  {artist.tag}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "var(--text)",
                    marginBottom: 3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {artist.name}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {artist.albums}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
