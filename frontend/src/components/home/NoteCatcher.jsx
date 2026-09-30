import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

const GAME_MS = 15000;
const BEST_KEY = "trivially_note_best";

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function randomSpot() {
  // Percentages that keep the note fully inside the arena.
  return { x: 8 + Math.random() * 84, y: 12 + Math.random() * 76 };
}

// Tiny waiting-room game: tap the note as many times as you can in 15 seconds.
export default function NoteCatcher() {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);
  const [left, setLeft] = useState(GAME_MS);
  const [spot, setSpot] = useState({ x: 50, y: 50 });
  const [hit, setHit] = useState(0);
  const endsAt = useRef(0);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const ms = Math.max(0, endsAt.current - Date.now());
      setLeft(ms);
      if (ms === 0) {
        setPlaying(false);
        setBest((prev) => {
          const next = Math.max(prev, scoreRef.current);
          try { localStorage.setItem(BEST_KEY, String(next)); } catch {}
          return next;
        });
      }
    }, 100);
    return () => clearInterval(t);
  }, [playing]);

  function start() {
    scoreRef.current = 0;
    setScore(0);
    setLeft(GAME_MS);
    setSpot(randomSpot());
    endsAt.current = Date.now() + GAME_MS;
    setPlaying(true);
  }

  function catchNote() {
    if (!playing) return;
    scoreRef.current += 1;
    setScore(scoreRef.current);
    setHit((h) => h + 1);
    setSpot(randomSpot());
  }

  const finished = !playing && left === 0;

  return (
    <section className="tv-card tv-notes" aria-label="Mini juego mientras esperas">
      <div className="tv-card-head">
        <h2 className="tv-card-title">Mientras esperas</h2>
        <span className="tv-notes-score" aria-live="polite">
          {playing ? `${score} · ${Math.ceil(left / 1000)} s` : `Récord ${best}`}
        </span>
      </div>

      <div className="tv-notes-arena">
        {playing ? (
          <button
            key={hit}
            type="button"
            className="tv-notes-note tv-c-green"
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              catchNote();
            }}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), catchNote())}
            aria-label={`Atrapa la nota (${score})`}
          >
            <Icon name="music" size={24} strokeWidth={2.6} />
          </button>
        ) : (
          <div className="tv-notes-intro">
            <p className="tv-notes-text">
              {finished
                ? score > 0 && score >= best
                  ? `¡Nuevo récord: ${score} notas!`
                  : `Atrapaste ${score} notas.`
                : "Atrapa todas las notas que puedas en 15 segundos."}
            </p>
            <button type="button" className="tv-btn tv-btn--sm tv-c-green" onClick={start}>
              <Icon name="play" size={16} filled strokeWidth={1.5} />
              {finished ? "Otra vez" : "Jugar"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
