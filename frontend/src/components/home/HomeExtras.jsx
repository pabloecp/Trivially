import { useEffect, useRef, useState } from "react";
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

// Option 1: a sample question from a different category every few seconds; you can also answer it.
export function SampleQuestion() {
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [picked, setPicked] = useState(null);
  const timer = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        if (!reveal) setReveal(true);
        else {
          setReveal(false);
          setPicked(null);
          setIndex((n) => (n + 1) % SAMPLES.length);
        }
      },
      reveal ? (picked === null ? 1800 : 2600) : 4200
    );
    return () => clearTimeout(timer.current);
  }, [index, reveal, picked]);

  const item = SAMPLES[index];
  const mode = modeOf(item.mode);
  const result = picked === null ? null : picked === item.answer;

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
        <Options
          item={item}
          picked={picked}
          reveal={reveal}
          onPick={(i) => {
            setPicked(i);
            setReveal(true);
          }}
        />
      </div>
      <p className="tv-hint tv-qfoot" aria-live="polite">
        {result === true ? "¡Correcto! Imagina esto contra tus amigos." : result === false ? "¡Casi! En una partida de verdad tendrías revancha." : "Toca una respuesta para probar."}
      </p>
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
