import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import Stepper from "../../components/home/Stepper.jsx";
import { DIFFICULTIES, KINDS, LOCATION_SECONDS, ROUNDS_LIMITS, SECONDS_LIMITS, geoConfig } from "./geoInfo.js";

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

// Settings of a Geografía match: which kinds of question, the difficulty, how many rounds and the seconds to write an
// answer (map rounds always last 10 s). Every tap is saved straight away for the whole room. With `readOnly` (players
// without permission) everything shows but nothing can be tapped.
export default function GeoSettings({ room, updateConfig, onToast, readOnly = false }) {
  const saved = geoConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulty, saved.kinds.join()]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ geo: next });
    } catch (err) {
      setDraft(saved);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  function toggleKind(id) {
    const on = draft.kinds.includes(id);
    if (on && draft.kinds.length === 1) {
      onToast?.("Deja al menos un tipo de pregunta");
      return;
    }
    save({ kinds: KINDS.map((k) => k.id).filter((k) => (k === id ? !on : draft.kinds.includes(k))) });
  }

  const writtenKinds = draft.kinds.some((k) => k !== "location");

  return (
    <section className="tv-card tv-settings tv-geo-settings" aria-labelledby="tv-geo-settings-title">
      <h2 id="tv-geo-settings-title" className="tv-card-title">Ajustes de la partida</h2>
      {readOnly && (
        <p className="tv-readonly-note">
          <Icon name="lock" size={15} strokeWidth={2.6} />
          Solo {room.hostName || "el host"} puede cambiar los ajustes
        </p>
      )}

      <fieldset className="tv-fieldset" disabled={readOnly}>
        <legend className="tv-label">Tipos de pregunta</legend>
        <div className="tv-geo-kinds">
          {KINDS.map((k) => {
            const on = draft.kinds.includes(k.id);
            return (
              <button
                key={k.id}
                type="button"
                className="tv-geo-kind tv-c-world"
                aria-pressed={on}
                onClick={() => toggleKind(k.id)}
              >
                <span className="tv-geo-kind-icon" aria-hidden="true">
                  <Icon name={k.icon} size={22} strokeWidth={2.4} />
                </span>
                <strong>{k.label}</strong>
                <small>{k.hint}</small>
                <span className="tv-geo-kind-check" aria-hidden="true">
                  <Icon name={on ? "check" : "plus"} size={14} strokeWidth={3.2} />
                </span>
              </button>
            );
          })}
        </div>
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

      <fieldset className="tv-steppers" disabled={readOnly}>
        <Stepper label="Rondas" value={draft.rounds} limits={ROUNDS_LIMITS} onChange={(n) => save({ rounds: n })} />
        {writtenKinds && (
          <Stepper
            label="Segundos para escribir"
            value={Math.round(draft.roundMs / 1000)}
            unit="s"
            limits={SECONDS_LIMITS}
            onChange={(n) => save({ roundMs: n * 1000 })}
          />
        )}
      </fieldset>
      {draft.kinds.includes("location") && (
        <p className="tv-hint tv-geo-note">
          <Icon name="pin" size={15} strokeWidth={2.6} />
          En ubicación todos tienen {LOCATION_SECONDS} s para poner su pin.
        </p>
      )}
    </section>
  );
}
