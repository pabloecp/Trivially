import { useEffect, useState } from "react";
import { GAME_MODES } from "../../modes/index.js";
import Icon from "./Icon.jsx";

// Side panels shown next to the logo on Home. They are about Trivially as a whole, not one game.

const SAMPLES = [
  { mode: "musica", q: "¿Quién canta «Tití Me Preguntó»?", options: ["Feid", "Bad Bunny", "Mora", "Rauw Alejandro"], answer: 1 },
  { mode: "cultura", q: "¿Cuántos huesos tiene el cuerpo humano adulto?", options: ["186", "196", "206", "212"], answer: 2 },
  { mode: "cine", q: "¿Qué película ganó el Óscar a Mejor Película en 2020?", options: ["1917", "Joker", "Parásitos", "Mujercitas"], answer: 2 },
  { mode: "mundo", q: "¿Cuál es la capital de Australia?", options: ["Sídney", "Canberra", "Melbourne", "Perth"], answer: 1 },
];

const DAILY = [
  { mode: "mundo", q: "¿Cuál es el río más largo de América del Sur?", options: ["Paraná", "Orinoco", "Amazonas", "Magdalena"], answer: 2, pct: 71 },
  { mode: "cine", q: "¿En qué saga aparece el personaje de Hermione Granger?", options: ["Crepúsculo", "Harry Potter", "Narnia", "Los juegos del hambre"], answer: 1, pct: 88 },
  { mode: "cultura", q: "¿Qué planeta es conocido como el planeta rojo?", options: ["Venus", "Júpiter", "Marte", "Mercurio"], answer: 2, pct: 83 },
  { mode: "musica", q: "¿De qué país es la cantante Shakira?", options: ["México", "Colombia", "Argentina", "España"], answer: 1, pct: 79 },
  { mode: "mundo", q: "¿Cuántos continentes hay en la Tierra?", options: ["5", "6", "7", "8"], answer: 2, pct: 64 },
  { mode: "cultura", q: "¿Quién pintó «La noche estrellada»?", options: ["Picasso", "Van Gogh", "Monet", "Dalí"], answer: 1, pct: 67 },
  { mode: "cine", q: "¿Cómo se llama el muñeco vaquero de «Toy Story»?", options: ["Buzz", "Woody", "Rex", "Jessie"], answer: 1, pct: 91 },
];

const LETTERS = ["A", "B", "C", "D"];

function modeOf(id) {
  return GAME_MODES.find((m) => m.id === id) || GAME_MODES[0];
}

function CategoryChip({ mode }) {
  return (
    <span className={`tv-qchip tv-c-${mode.color}`}>
      <Icon name={mode.icon} size={14} strokeWidth={2.6} />
      {mode.name}
    </span>
  );
}

function Options({ item, picked, reveal, onPick }) {
  return (
    <div className="tv-qopts">
      {item.options.map((text, i) => {
        const state = reveal ? (i === item.answer ? " is-right" : i === picked ? " is-wrong" : " is-dim") : "";
        return (
          <button
            key={text}
            type="button"
            className={`tv-qopt${state}`}
            style={{ "--i": i }}
            onClick={() => onPick(i)}
            disabled={reveal}
          >
            <span className="tv-qopt-letter">{LETTERS[i]}</span>
            <span className="tv-qopt-text">{text}</span>
            {reveal && i === item.answer && <Icon name="check" size={18} strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

// Option 1: sample questions from every category. No timer: it waits for your answer, then you move on.
export function SampleQuestion() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);

  const item = SAMPLES[index];
  const mode = modeOf(item.mode);
  const reveal = picked !== null;
  const right = picked === item.answer;

  function next() {
    setPicked(null);
    setIndex((n) => (n + 1) % SAMPLES.length);
  }

  return (
    <section className={`tv-card tv-qcard tv-c-${mode.color}`} aria-label="Pregunta de muestra">
      <div className="tv-qcard-head">
        <CategoryChip mode={mode} />
        <div className="tv-qdots" aria-hidden="true">
          {SAMPLES.map((s, i) => (
            <span key={s.mode} className={i === index ? "is-on" : ""} />
          ))}
        </div>
      </div>
      <div key={index} className="tv-qbody">
        <h2 className="tv-qtitle">{item.q}</h2>
        <Options item={item} picked={picked} reveal={reveal} onPick={setPicked} />
      </div>
      <div className="tv-qfoot-row" aria-live="polite">
        <p className="tv-hint">
          {!reveal ? "Toca una respuesta para probar." : right ? "¡Correcto! Imagina esto contra tus amigos." : "¡Casi! En una partida de verdad tendrías revancha."}
        </p>
        {reveal && (
          <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={next}>
            Siguiente
            <Icon name="chevron" size={16} strokeWidth={3} />
          </button>
        )}
      </div>
    </section>
  );
}

const DAILY_KEY = "trivially_daily";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadDailyAnswer(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
    return saved?.day === key ? saved.picked : null;
  } catch {
    return null;
  }
}

// Option 2: one question per day, the same for everybody; your answer is remembered until tomorrow.
export function DailyQuestion() {
  const day = todayKey();
  const dayNumber = Math.floor(Date.now() / 86400000);
  const item = DAILY[dayNumber % DAILY.length];
  const mode = modeOf(item.mode);
  const [picked, setPicked] = useState(() => loadDailyAnswer(day));
  const reveal = picked !== null;
  const right = picked === item.answer;

  function pick(i) {
    setPicked(i);
    try {
      localStorage.setItem(DAILY_KEY, JSON.stringify({ day, picked: i }));
    } catch {}
  }

  const date = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className={`tv-card tv-qcard tv-c-${mode.color}`} aria-label="Pregunta del día">
      <div className="tv-qcard-head">
        <span className="tv-daily-kicker">
          <Icon name="calendar" size={16} strokeWidth={2.6} />
          Pregunta del día
        </span>
        <span className="tv-hint tv-daily-date">{date}</span>
      </div>
      <CategoryChip mode={mode} />
      <h2 className="tv-qtitle">{item.q}</h2>
      <Options item={item} picked={picked} reveal={reveal} onPick={pick} />
      {reveal ? (
        <div className="tv-daily-result" aria-live="polite">
          <strong className={right ? "is-right" : "is-wrong"}>{right ? "¡Acertaste!" : "¡Esta vez no!"}</strong>
          <span className="tv-daily-bar" style={{ "--pct": `${item.pct}%` }}>
            <span />
          </span>
          <span className="tv-hint">El {item.pct}% de los jugadores acertó · Vuelve mañana por otra</span>
        </div>
      ) : (
        <p className="tv-hint tv-qfoot">Una pregunta nueva cada día. ¿La sabes?</p>
      )}
    </section>
  );
}

const STEPS = [
  { icon: "users", color: "pink", title: "Elige un modo", text: "Música, cultura general, cine, geografía… lo que más te guste." },
  { icon: "hash", color: "violet", title: "Crea una sala", text: "Comparte el código con tus amigos o juega solo.", code: "XOYOAV" },
  { icon: "bolt", color: "sky", title: "Responde antes que nadie", text: "Cuanto más rápido aciertes, más puntos sumas." },
];

// Option 3: how a game works, in three steps that fit every mode.
export function HowToPlay() {
  return (
    <section className="tv-card tv-howto" aria-labelledby="tv-howto-title">
      <h2 id="tv-howto-title" className="tv-card-title">Cómo se juega</h2>
      <ol className="tv-steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="tv-step" style={{ "--i": i }}>
            <span className={`tv-badge tv-c-${step.color}`}>
              <Icon name={step.icon} size={24} />
            </span>
            <div className="tv-step-text">
              <strong>
                <span className="tv-step-num">{i + 1}</span>
                {step.title}
              </strong>
              <span>{step.text}</span>
            </div>
            {step.code && <code className="tv-step-code">{step.code}</code>}
          </li>
        ))}
      </ol>
    </section>
  );
}

const FACTS = [
  { mode: "mundo", text: "Canadá tiene más lagos que todos los demás países del mundo juntos." },
  { mode: "cultura", text: "Un día en Venus dura más que un año en Venus: tarda más en girar sobre sí mismo que en dar la vuelta al Sol." },
  { mode: "musica", text: "«Despacito» fue el primer video de YouTube en superar los 5.000 millones de reproducciones." },
  { mode: "cine", text: "El rugido del dinosaurio T. rex de «Jurassic Park» mezcla sonidos de un elefante bebé, un tigre y un cocodrilo." },
  { mode: "cultura", text: "Los pulpos tienen tres corazones y su sangre es de color azul." },
  { mode: "mundo", text: "Rusia abarca 11 husos horarios: cuando en un extremo es de noche, en el otro ya es de día." },
  { mode: "musica", text: "Freddie Mercury tenía cuatro dientes de más, y decía que le daban más espacio en la boca para su voz." },
  { mode: "cine", text: "«Toy Story» (1995) fue la primera película hecha por completo con animación por computadora." },
];

// Option 4: a fun fact each day from a different category; you can peek at more.
export function DailyFact() {
  const dayNumber = Math.floor(Date.now() / 86400000);
  const [offset, setOffset] = useState(0);
  const item = FACTS[(dayNumber + offset) % FACTS.length];
  const mode = modeOf(item.mode);

  return (
    <section className={`tv-card tv-qcard tv-c-${mode.color}`} aria-label="Dato curioso del día">
      <div className="tv-qcard-head">
        <span className="tv-daily-kicker">
          <Icon name="bulb" size={16} strokeWidth={2.6} />
          {offset === 0 ? "Dato curioso del día" : "Otro dato curioso"}
        </span>
        <CategoryChip mode={mode} />
      </div>
      <div key={offset} className="tv-qbody">
        <p className="tv-fact">{item.text}</p>
      </div>
      <div className="tv-qfoot-row">
        <p className="tv-hint">¿Lo sabías? Hay más como este en las partidas.</p>
        <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={() => setOffset((n) => n + 1)}>
          Otro dato
          <Icon name="chevron" size={16} strokeWidth={3} />
        </button>
      </div>
    </section>
  );
}

const MODE_BLURBS = {
  musica: "Escucha 30 segundos y adivina la canción antes que nadie.",
  cultura: "Historia, ciencia, arte y todo lo demás en preguntas rápidas.",
  cine: "Películas, series, actores y frases que todo el mundo conoce.",
  mundo: "Capitales, banderas, mapas y maravillas de todo el planeta.",
};
const CAROUSEL_MS = 3800;

// Option 5: a big card per game mode that slides by on its own; the dots and arrows move it by hand.
export function ModeCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const mode = GAME_MODES[index];

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setIndex((n) => (n + 1) % GAME_MODES.length), CAROUSEL_MS);
    return () => clearTimeout(t);
  }, [index, paused]);

  function go(step) {
    setIndex((n) => (n + step + GAME_MODES.length) % GAME_MODES.length);
  }

  return (
    <section
      className="tv-carousel"
      aria-roledescription="carrusel"
      aria-label="Categorías de Trivially"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div key={mode.id} className={`tv-slide tv-c-${mode.color}`} aria-live="polite">
        <Icon name={mode.icon} size={220} strokeWidth={1.4} className="tv-slide-watermark" />
        <span className="tv-badge tv-slide-badge">
          <Icon name={mode.icon} size={30} />
        </span>
        <span className="tv-slide-status">
          {mode.available ? (
            "Disponible"
          ) : (
            <>
              <Icon name="lock" size={12} strokeWidth={3} />
              Pronto
            </>
          )}
        </span>
        <h2 className="tv-slide-name">{mode.name}</h2>
        <p className="tv-slide-text">{MODE_BLURBS[mode.id]}</p>
      </div>
      <div className="tv-carousel-nav">
        <button type="button" className="tv-icon-btn tv-icon-btn--sm" onClick={() => go(-1)} aria-label="Categoría anterior">
          <Icon name="back" size={18} strokeWidth={2.8} />
        </button>
        <div className="tv-qdots">
          {GAME_MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`tv-carousel-dot${i === index ? " is-on" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={m.name}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
        <button type="button" className="tv-icon-btn tv-icon-btn--sm" onClick={() => go(1)} aria-label="Siguiente categoría">
          <Icon name="chevron" size={18} strokeWidth={2.8} />
        </button>
      </div>
    </section>
  );
}
