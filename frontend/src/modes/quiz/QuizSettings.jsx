import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import { DIFFICULTIES, QUESTIONS_LIMITS, SECONDS_LIMITS, quizConfig } from "./quizInfo.js";

// Settings of an "Opción múltiple" match, in the settings panel: the difficulty, how many questions and seconds to
// answer each one. Every tap is saved straight away for the whole room, like the music settings. With `readOnly`
// (players without permission) everything shows but nothing can be tapped.
export default function QuizSettings({ room, updateConfig, onToast, children, readOnly = false }) {
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
    <fieldset className="tv-settings" disabled={readOnly}>
      <OptionRow
        label="Dificultad"
        options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
        value={draft.difficulty}
        onChange={(v) => save({ difficulty: v })}
      />
      <OptionRow label="Preguntas" options={rangeOptions(QUESTIONS_LIMITS)} value={draft.rounds} onChange={(n) => save({ rounds: n })} />
      <OptionRow
        label="Segundos por pregunta"
        options={rangeOptions(SECONDS_LIMITS)}
        value={Math.round(draft.roundMs / 1000)}
        onChange={(n) => save({ roundMs: n * 1000 })}
      />
      {children}
    </fieldset>
  );
}
