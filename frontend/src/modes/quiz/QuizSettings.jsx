import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import Stepper from "../../components/home/Stepper.jsx";
import { DIFFICULTIES, QUESTIONS_LIMITS, SECONDS_LIMITS, quizConfig } from "./quizInfo.js";

function Stars({ count }) {
  if (!count) return <Icon name="swap" size={18} strokeWidth={2.8} />;
  return (
    <span className="tv-diff-stars">
      {Array.from({ length: count }, (_, i) => (
        <Icon key={i} name="star" size={14} filled strokeWidth={1.4} />
      ))}
    </span>
  );
}

// Settings of an "Opción múltiple" match: how many questions, seconds to answer each one and the difficulty.
// Every tap is saved straight away for the whole room, like the music settings. With `readOnly` (players without
// permission) everything shows but nothing can be tapped.
export default function QuizSettings({ room, updateConfig, onToast, readOnly = false }) {
  const saved = quizConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulty]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ quiz: next });
    } catch (err) {
      setDraft(saved);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  return (
    <section className="tv-card tv-settings tv-quiz-settings" aria-labelledby="tv-quiz-settings-title">
      <h2 id="tv-quiz-settings-title" className="tv-card-title">Ajustes de la partida</h2>
      {readOnly && (
        <p className="tv-readonly-note">
          <Icon name="lock" size={15} strokeWidth={2.6} />
          Solo {room.hostName || "el host"} puede cambiar los ajustes
        </p>
      )}

      <fieldset className="tv-steppers" disabled={readOnly}>
        <Stepper label="Preguntas" value={draft.rounds} limits={QUESTIONS_LIMITS} onChange={(n) => save({ rounds: n })} />
        <Stepper
          label="Segundos por pregunta"
          value={Math.round(draft.roundMs / 1000)}
          unit="s"
          limits={SECONDS_LIMITS}
          onChange={(n) => save({ roundMs: n * 1000 })}
        />
      </fieldset>

      <fieldset className="tv-fieldset" disabled={readOnly}>
        <legend className="tv-label">Dificultad</legend>
        <div className="tv-diffs">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`tv-diff tv-c-${d.color}`}
              aria-pressed={draft.difficulty === d.id}
              onClick={() => save({ difficulty: d.id })}
            >
              <span className="tv-diff-icon" aria-hidden="true">
                <Stars count={d.stars} />
              </span>
              <span className="tv-diff-text">
                <strong>{d.label}</strong>
                <small>{d.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
