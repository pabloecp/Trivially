import { YoavllySymbol } from "./YoavllySymbol.jsx";

const ALBUMS_ROW_1 = [
  {
    id: "un-verano-sin-ti",
    name: "Un Verano Sin Ti",
    artist: "Bad Bunny",
    year: "2022",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/600x600bb.jpg",
  },
  {
    id: "microdosis",
    name: "MICRODOSIS",
    artist: "Mora",
    year: "2022",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/5b/4f/71/5b4f715a-5323-cc45-382a-7d0b4b69f418/196626706898.jpg/600x600bb.jpg",
  },
  {
    id: "saturno",
    name: "SATURNO",
    artist: "Rauw Alejandro",
    year: "2022",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/99/0f/ef/990fefcb-db12-0cf0-90f9-44115c095c73/196589764720.jpg/600x600bb.jpg",
  },
  {
    id: "dtmf",
    name: "DeBÍ TiRAR MáS FOToS",
    artist: "Bad Bunny",
    year: "2025",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/90/5e/7e/905e7ed5-a8fa-a8f3-cd06-0028fdf3afaa/199066342442.jpg/600x600bb.jpg",
  },
  {
    id: "estrella",
    name: "ESTRELLA",
    artist: "Mora",
    year: "2023",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ff/e3/6d/ffe36d58-d153-826d-4f7f-7ba38e81c75a/197189639050.jpg/600x600bb.jpg",
  },
];

const ALBUMS_ROW_2 = [
  {
    id: "vice-versa",
    name: "VICE VERSA",
    artist: "Rauw Alejandro",
    year: "2021",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/58/13/c3/5813c326-a7fa-f792-77e1-8310d9c80742/886449738724.jpg/600x600bb.jpg",
  },
  {
    id: "yhlqmdlg",
    name: "YHLQMDLG",
    artist: "Bad Bunny",
    year: "2020",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/8c/0f/81/8c0f81f2-9f10-5e3d-b9de-5961a73e8e52/195081078724.jpg/600x600bb.jpg",
  },
  {
    id: "cosa-nuestra",
    name: "Cosa Nuestra",
    artist: "Rauw Alejandro",
    year: "2024",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ab/e8/09/abe8092d-ef44-61b9-6b50-ab7efb78ca51/196872401516.jpg/600x600bb.jpg",
  },
  {
    id: "rr",
    name: "RR",
    artist: "Rauw Alejandro & Rosalía",
    year: "2023",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/b0/e4/ac/b0e4ac99-eb38-7370-ea50-0bcf0bcbb054/196589949080.jpg/600x600bb.jpg",
  },
  {
    id: "el-ultimo-tour",
    name: "EL ÚLTIMO TOUR DEL MUNDO",
    artist: "Bad Bunny",
    year: "2020",
    image: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/c4/a0/65/c4a0650a-87b0-3514-4e0c-e32e5afbb3a6/194491183394.jpg/600x600bb.jpg",
  },
];

// Duplicate items for infinite seamless looping
const ROW_1_LOOP = [...ALBUMS_ROW_1, ...ALBUMS_ROW_1];
const ROW_2_LOOP = [...ALBUMS_ROW_2, ...ALBUMS_ROW_2];

export default function AlbumShowcase() {
  return (
    <div className="album-showcase-box" aria-label="Catálogo de Álbumes en Movimiento">
      {/* Top Header of the Showcase Card */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "0 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <YoavllySymbol size={20} />
          <div>
            <div className="kicker" style={{ fontSize: 11, margin: 0 }}>
              Álbumes en Rotación
            </div>
            <h3 style={{ margin: "2px 0 0", fontSize: 17, color: "var(--text)" }}>
              Catálogo de Canciones
            </h3>
          </div>
        </div>
        <span
          className="chip"
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: "var(--brand-subtle)",
            color: "var(--brand)",
            border: "1px solid rgba(29, 185, 84, 0.25)",
          }}
        >
          En Vivo
        </span>
      </div>

      {/* Row 1: Moving smoothly Left */}
      <div className="album-marquee-viewport">
        <div className="album-marquee-track track-left">
          {ROW_1_LOOP.map((album, index) => (
            <div key={`r1-${album.id}-${index}`} className="album-cover-card" title={`${album.name} - ${album.artist} (${album.year})`}>
              <img
                src={album.image}
                alt={album.name}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/600x600bb.jpg";
                }}
              />
              <div className="album-title">{album.name}</div>
              <div className="album-artist">{album.artist}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Moving smoothly Right */}
      <div className="album-marquee-viewport">
        <div className="album-marquee-track track-right">
          {ROW_2_LOOP.map((album, index) => (
            <div key={`r2-${album.id}-${index}`} className="album-cover-card" title={`${album.name} - ${album.artist} (${album.year})`}>
              <img
                src={album.image}
                alt={album.name}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/8c/0f/81/8c0f81f2-9f10-5e3d-b9de-5961a73e8e52/195081078724.jpg/600x600bb.jpg";
                }}
              />
              <div className="album-title">{album.name}</div>
              <div className="album-artist">{album.artist}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
