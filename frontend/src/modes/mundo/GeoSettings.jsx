import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import { DIFFICULTIES, KINDS, ROUNDS_LIMITS, SECONDS_LIMITS, geoConfig } from "./geoInfo.js";

// Settings of a Geografía match, in the settings panel: which kinds of question and difficulties (tick as many as you
// like, all by default), how many rounds and
// the seconds to write an answer (map rounds always last 10 s). Every tap is saved straight away for the whole room.
// With `readOnly` (players without permission) everything shows but nothing can be tapped.
export default function GeoSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = geoConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulties.join(), saved.kinds.join()]);

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

  // Ticks or unticks one choice of a list, keeping the list's order.
  function toggle(key, all, id) {
    const list = draft[key];
    const on = list.includes(id);
    save({ [key]: all.map((c) => c.id).filter((c) => (c === id ? !on : list.includes(c))) });
  }

  const writtenKinds = draft.kinds.some((k) => k !== "location");

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      <OptionRow
        label="Modos de juego"
        multi
        options={KINDS.map((k) => ({ value: k.id, label: k.label, title: k.hint }))}
        value={draft.kinds}
        onChange={(id) => toggle("kinds", KINDS, id)}
        onSetAll={(kinds) => save({ kinds })}
      />
      <OptionRow
        label="Dificultad"
        multi
        options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label, title: d.hint }))}
        value={draft.difficulties}
        onChange={(id) => toggle("difficulties", DIFFICULTIES, id)}
        onSetAll={(difficulties) => save({ difficulties })}
      />
      <OptionRow label="Rondas" options={rangeOptions(ROUNDS_LIMITS)} value={draft.rounds} onChange={(n) => save({ rounds: n })} />
      {writtenKinds && (
        <OptionRow
          label="Segundos para escribir"
          options={rangeOptions(SECONDS_LIMITS)}
          value={Math.round(draft.roundMs / 1000)}
          onChange={(n) => save({ roundMs: n * 1000 })}
        />
      )}
      {children}
    </fieldset>
  );
}
