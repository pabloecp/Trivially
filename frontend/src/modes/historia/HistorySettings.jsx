import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import { DIFFICULTIES, ERAS, ROUNDS_LIMITS, SECONDS_LIMITS, historyConfig } from "./historyInfo.js";

// Settings of a Historia match, in the settings panel: which ages the events come from, the difficulty, how many
// rounds and the seconds to choose a year. Every tap is saved straight away for the whole room. With `readOnly`
// (players without permission) everything shows but nothing can be tapped.
export default function HistorySettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = historyConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulty, saved.eras.join()]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ history: next });
    } catch (err) {
      setDraft(saved);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  function toggleEra(id) {
    const on = draft.eras.includes(id);
    save({ eras: ERAS.map((e) => e.id).filter((e) => (e === id ? !on : draft.eras.includes(e))) });
  }

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      <div className="tv-hist-eras">
        <OptionRow
          label="Épocas"
          multi
          options={ERAS.map((e) => ({ value: e.id, label: e.label, title: e.hint }))}
          value={draft.eras}
          onChange={toggleEra}
          onSetAll={(eras) => save({ eras })}
        />
      </div>
      <OptionRow
        label="Dificultad"
        options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
        value={draft.difficulty}
        onChange={(v) => save({ difficulty: v })}
      />
      <OptionRow label="Rondas" options={rangeOptions(ROUNDS_LIMITS)} value={draft.rounds} onChange={(n) => save({ rounds: n })} />
      <OptionRow
        label="Segundos para elegir"
        options={rangeOptions(SECONDS_LIMITS)}
        value={Math.round(draft.roundMs / 1000)}
        onChange={(n) => save({ roundMs: n * 1000 })}
      />
      {children}
    </fieldset>
  );
}
