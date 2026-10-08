import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import { ERAS, LEVELS, ROUNDS_LIMITS, SECONDS_LIMITS, TOPICS, historyConfig } from "./historyInfo.js";

const ALL_ERAS = ERAS.map((e) => e.id);

// Settings of a Línea del tiempo match, in the settings panel: the categories the events come from and the
// difficulties (tick as many as you like; every age is played), how many rounds and the seconds to choose a year. A choice with no events
// with the other settings (room.questionCounts) is greyed out and can't be ticked. Each list has "Seleccionar todos" /
// "Deseleccionar todos"; with one left empty the match can't start. Every tap is saved straight away for the whole
// room. With `readOnly` (players without permission) everything shows but nothing can be tapped.
export default function HistorySettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = historyConfig(room);
  const [draft, setDraft] = useState(saved);
  const counts = room.questionCounts || { categories: {}, eras: {}, difficulties: {} };

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulties.join(), saved.categories.join(), saved.eras.join()]);

  async function save(change) {
    if (readOnly) return;
    // Every age is played (there is no "Épocas" setting any more).
    const next = { ...draft, ...change, eras: ALL_ERAS };
    setDraft(next);
    try {
      await updateConfig({ history: next });
    } catch (err) {
      setDraft(saved);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  // Ticks or unticks one choice of a list, keeping the list's order.
  function toggle(key, all, id) {
    const list = draft[key];
    const on = list.includes(id);
    save({ [key]: all.filter((v) => (v === id ? !on : list.includes(v))) });
  }

  // A choice without events can't be ticked (but can be unticked).
  const choice = (key, group) => (item) => {
    const count = counts[group]?.[item.id] || 0;
    return { value: item.id, label: item.label, title: item.hint, disabled: !count && !draft[key].includes(item.id) };
  };

  const topicIds = TOPICS.map((t) => t.id);
  const levelIds = LEVELS.map((d) => d.id);

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      <OptionRow
        label="Categorías"
        multi
        wrap
        options={TOPICS.map(choice("categories", "categories"))}
        value={draft.categories}
        onChange={(id) => toggle("categories", topicIds, id)}
        onSetAll={(list) => save({ categories: list })}
      />
      <OptionRow
        label="Dificultad"
        multi
        wrap
        options={LEVELS.map(choice("difficulties", "difficulties"))}
        value={draft.difficulties}
        onChange={(id) => toggle("difficulties", levelIds, id)}
        onSetAll={(list) => save({ difficulties: list })}
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
