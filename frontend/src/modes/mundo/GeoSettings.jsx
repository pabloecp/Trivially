import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import { DIFFICULTIES, ROUNDS_LIMITS, STYLES, geoConfig } from "./geoInfo.js";

// Settings of an Encuentra el país match, in the settings panel: the way of playing ("Modos de juego": only "Ubicación",
// ticked and locked), the difficulties (tick as many as you like, all by default) and how many rounds. Every tap is
// saved straight away for the whole room. With `readOnly` (players without permission) everything shows but nothing
// can be tapped.
export default function GeoSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = geoConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.difficulties.join()]);

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

  // Ticks or unticks one difficulty, keeping the list's order.
  function toggle(id) {
    const on = draft.difficulties.includes(id);
    save({ difficulties: DIFFICULTIES.map((d) => d.id).filter((d) => (d === id ? !on : draft.difficulties.includes(d))) });
  }

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      {/* The only way of playing: always ticked, nothing to change. */}
      <OptionRow
        label="Modos de juego"
        multi
        options={STYLES.map((s) => ({ value: s.id, label: s.label, title: `${s.hint}. Es el único modo.`, disabled: true }))}
        value={STYLES.map((s) => s.id)}
        onChange={() => {}}
      />
      <OptionRow
        label="Dificultad"
        multi
        options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label, title: d.hint }))}
        value={draft.difficulties}
        onChange={toggle}
        onSetAll={(difficulties) => save({ difficulties })}
      />
      <OptionRow label="Rondas" options={rangeOptions(ROUNDS_LIMITS)} value={draft.rounds} onChange={(n) => save({ rounds: n })} />
      {children}
    </fieldset>
  );
}
