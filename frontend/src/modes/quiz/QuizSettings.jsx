import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SettingsTabs, { countNote } from "../../components/home/SettingsTabs.jsx";
import { FORMATS, LEVELS, QUESTIONS_LIMITS, SECONDS_LIMITS, STYLES, TOPICS, quizConfig } from "./quizInfo.js";
import { useT } from "../../lib/i18n.js";

import { translate as tr } from "../../lib/i18n.js";
// Settings of a "Trivia" match, in the settings panel, in two tabs: "Partida" (the modes of play, Clásico and
// Imágenes; closed or open questions,
// how many questions and the seconds to answer each one) and "Preguntas" (the categories and the difficulties; tick
// as many as you like). A choice with no questions with the other
// settings (room.questionCounts) is greyed out and can't be ticked. Each list has "Seleccionar todos" / "Deseleccionar todos"; with one left empty the match can't start.
// Every tap is saved straight away for the whole room. With `readOnly` (players without permission) everything shows
// but nothing can be tapped.
export default function QuizSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const t = useT();
  const saved = quizConfig(room);
  const [draft, setDraft] = useState(saved);
  const counts = room.questionCounts || { categories: {}, formats: {}, difficulties: {}, styles: {} };

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulties.join(), saved.categories.join(), saved.formats.join(), saved.styles.join()]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ quiz: next });
    } catch (err) {
      setDraft(saved);
      onToast?.(err.message || t("No se pudieron guardar los ajustes"));
    }
  }

  // Ticks or unticks one choice of a list, keeping the list's order.
  function toggle(key, all, id) {
    const list = draft[key];
    const on = list.includes(id);
    save({ [key]: all.filter((v) => (v === id ? !on : list.includes(v))) });
  }

  // A choice without questions can't be ticked (but can be unticked).
  const choice = (key, group) => (item) => {
    const count = counts[group]?.[item.id] || 0;
    return { value: item.id, label: item.label, title: item.hint, disabled: !count && !draft[key].includes(item.id) };
  };

  const topicIds = TOPICS.map((t) => t.id);
  const formatIds = FORMATS.map((f) => f.id);
  const styleIds = STYLES.map((st) => st.id);
  const levelIds = LEVELS.map((d) => d.id);

  const seconds = Math.round(draft.roundMs / 1000);

  return (
    <SettingsTabs
      readOnly={readOnly}
      storageKey="opciones"
      tabs={[
        {
          id: "partida",
          label: tr("Partida"),
          icon: "hourglass",
          note: `${draft.rounds} rondas · ${seconds} s`,
          alert: !draft.formats.length || !draft.styles.length,
          content: (
            <>
              <OptionRow
                label={tr("Modos de juego")}
                multi
                wrap
                options={STYLES.map(choice("styles", "styles"))}
                value={draft.styles}
                onChange={(id) => toggle("styles", styleIds, id)}
                onSetAll={(list) => save({ styles: list })}
              />
              <OptionRow
                label={tr("Tipo de respuestas")}
                multi
                wrap
                options={FORMATS.map(choice("formats", "formats"))}
                value={draft.formats}
                onChange={(id) => toggle("formats", formatIds, id)}
                onSetAll={(list) => save({ formats: list })}
              />
              <OptionRow label={tr("Rondas")} options={rangeOptions(QUESTIONS_LIMITS)} value={draft.rounds} onChange={(n) => save({ rounds: n })} />
              <OptionRow
                label={tr("Segundos por pregunta")}
                options={rangeOptions(SECONDS_LIMITS)}
                value={seconds}
                onChange={(n) => save({ roundMs: n * 1000 })}
              />
            </>
          ),
        },
        {
          id: "preguntas",
          label: tr("Preguntas"),
          icon: "bulb",
          note: countNote(draft.categories, topicIds.length),
          alert: !draft.categories.length || !draft.difficulties.length,
          content: (
            <>
              <OptionRow
                label={tr("Categorías")}
                multi
                wrap
                options={TOPICS.map(choice("categories", "categories"))}
                value={draft.categories}
                onChange={(id) => toggle("categories", topicIds, id)}
                onSetAll={(list) => save({ categories: list })}
              />
              <OptionRow
                label={tr("Dificultad")}
                multi
                wrap
                options={LEVELS.map(choice("difficulties", "difficulties"))}
                value={draft.difficulties}
                onChange={(id) => toggle("difficulties", levelIds, id)}
                onSetAll={(list) => save({ difficulties: list })}
              />
            </>
          ),
        },
      ]}
    >
      {children}
    </SettingsTabs>
  );
}
