import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import { FORMATS, LEVELS, QUESTIONS_LIMITS, SECONDS_LIMITS, TOPICS, quizConfig } from "./quizInfo.js";

// Settings of a "Trivia" match, in the settings panel: the topics, how to answer and the difficulties (tick as
// many as you like), how many questions and the seconds to answer each one. Next to each topic, way of answering and
// difficulty, how many questions it has with the other settings (room.questionCounts); one without any can't be
// ticked. Each list has "Seleccionar todos" / "Deseleccionar todos"; with one left empty the match can't start.
// Every tap is saved straight away for the whole room. With `readOnly` (players without permission) everything shows
// but nothing can be tapped.
export default function QuizSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = quizConfig(room);
  const [draft, setDraft] = useState(saved);
  const counts = room.questionCounts || { categories: {}, formats: {}, difficulties: {} };

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulties.join(), saved.categories.join(), saved.formats.join()]);

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

  // Ticks or unticks one choice of a list, keeping the list's order.
  function toggle(key, all, id) {
    const list = draft[key];
    const on = list.includes(id);
    save({ [key]: all.filter((v) => (v === id ? !on : list.includes(v))) });
  }

  // A choice with its count; one without questions can't be ticked (but can be unticked).
  const choice = (key, group) => (item) => {
    const count = counts[group]?.[item.id] || 0;
    return { value: item.id, label: item.label, title: item.hint, count, disabled: !count && !draft[key].includes(item.id) };
  };

  const topicIds = TOPICS.map((t) => t.id);
  const formatIds = FORMATS.map((f) => f.id);
  const levelIds = LEVELS.map((d) => d.id);

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      <OptionRow
        label="Temas"
        multi
        wrap
        options={TOPICS.map(choice("categories", "categories"))}
        value={draft.categories}
        onChange={(id) => toggle("categories", topicIds, id)}
        onSetAll={(list) => save({ categories: list })}
      />
      <OptionRow
        label="Cómo responder"
        multi
        options={FORMATS.map(choice("formats", "formats"))}
        value={draft.formats}
        onChange={(id) => toggle("formats", formatIds, id)}
        onSetAll={(list) => save({ formats: list })}
      />
      <OptionRow
        label="Dificultad"
        multi
        options={LEVELS.map(choice("difficulties", "difficulties"))}
        value={draft.difficulties}
        onChange={(id) => toggle("difficulties", levelIds, id)}
        onSetAll={(list) => save({ difficulties: list })}
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
