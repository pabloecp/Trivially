import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { YoavllySymbol } from "../../components/YoavllySymbol.jsx";
import AlbumShowcase from "../../components/AlbumShowcase.jsx";

export default function MusicHome() {
  const { user } = useApp();

  return (
    <div className="grid" style={{ gap: 48 }}>
      {/* Hero Section */}
      <section className="hero">
        <div>
          <div className="kicker">
            <YoavllySymbol size={16} /> La música es el reto
          </div>

          <h1 style={{ marginBottom: 16 }}>
            Reconoce la canción antes de que se acabe el tiempo.
          </h1>

          <p className="lead" style={{ marginBottom: 28 }}>
            Identifica canciones en segundos, escribe el título con nuestro buscador predictivo inteligente y compite en salas multijugador sincronizadas en tiempo real.
          </p>

          <div className="row" style={{ gap: 14 }}>
            <Link className="btn primary lg" to="/play">
              Jugar ahora →
            </Link>

            <Link className="btn ghost lg" to="/leaderboard">
              Leaderboard
            </Link>
          </div>
        </div>

        {/* Dynamic Animated Albums Showcase */}
        <AlbumShowcase />
      </section>

      {/* Artists Showcase */}
      <section className="grid" style={{ gap: 20 }}>
        <div>
          <div className="kicker">Catálogo Inicial</div>
          <h2>Artistas destacados</h2>
          <p style={{ margin: 0 }}>
            Catálogo curado con fragmentos de audio reales de alta fidelidad.
          </p>
        </div>

        <div className="grid grid-3">
          <div className="artist-card">
            <img
              src="/artists/bad-bunny.jpg"
              alt="Bad Bunny"
              className="artist-photo"
              onError={(e) => { e.currentTarget.src = "https://cdn-images.dzcdn.net/images/artist/044a3f315b041864887a8dd8709e6926/500x500-000000-80-0-0.jpg"; }}
            />
            <div>
              <div className="kicker" style={{ fontSize: 10, marginBottom: 2 }}>Artista Oficial</div>
              <strong style={{ fontSize: 16, display: "block" }}>Bad Bunny</strong>
              <span className="muted" style={{ fontSize: 13 }}>Un Verano Sin Ti · YHLQMDLG</span>
            </div>
          </div>

          <div className="artist-card">
            <img
              src="/artists/mora.jpg"
              alt="Mora"
              className="artist-photo"
              onError={(e) => { e.currentTarget.src = "https://cdn-images.dzcdn.net/images/artist/f44bb8e98463bc41d195c63c43768701/500x500-000000-80-0-0.jpg"; }}
            />
            <div>
              <div className="kicker" style={{ fontSize: 10, marginBottom: 2 }}>Artista Oficial</div>
              <strong style={{ fontSize: 16, display: "block" }}>Mora</strong>
              <span className="muted" style={{ fontSize: 13 }}>MICRODOSIS · ESTRELLA</span>
            </div>
          </div>

          <div className="artist-card">
            <img
              src="/artists/rauw-alejandro.jpg"
              alt="Rauw Alejandro"
              className="artist-photo"
              onError={(e) => { e.currentTarget.src = "https://cdn-images.dzcdn.net/images/artist/0e7b2b93b91789a054bc3f08bb3df3a8/500x500-000000-80-0-0.jpg"; }}
            />
            <div>
              <div className="kicker" style={{ fontSize: 10, marginBottom: 2 }}>Artista Oficial</div>
              <strong style={{ fontSize: 16, display: "block" }}>Rauw Alejandro</strong>
              <span className="muted" style={{ fontSize: 13 }}>SATURNO · VICE VERSA</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-3" style={{ gap: 24 }}>
        <div className="card">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-subtle)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <YoavllySymbol size={24} />
          </div>
          <h3>Filtros y Búsqueda en vivo</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Combina artistas, géneros, álbumes y años. Al escuchar, escribe y el buscador predictivo te sugerirá los títulos al instante.
          </p>
        </div>

        <div className="card">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-subtle)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
          </div>
          <h3>Multiplayer en tiempo real</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Salas privadas con código XO (ej. XO4K9M). Reloj centralizado y sincronización exacta de audio entre todos los jugadores.
          </p>
        </div>

        <div className="card">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-subtle)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>🔥</span>
          </div>
          <h3>Modo Invitado instantáneo</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Entra con tu nombre sin registro obligatorio. Tus estadísticas se guardan localmente y podrás asociarlas si decides crear una cuenta.
          </p>
        </div>
      </section>
    </div>
  );
}
