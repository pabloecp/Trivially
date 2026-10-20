import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SettingsTabs, { countNote } from "../../components/home/SettingsTabs.jsx";
import { CATEGORIES, DIFFICULTIES, MIN_QUESTIONS, ROUND_LIMITS, SECONDS_LIMITS, reyConfig } from "./reyInfo.js";

// Settings of a Rey de la colina match, in the settings panel, in two tabs: "Partida" (rounds, and the seconds the
// challengers have to answer) and "Preguntas" (which categories and difficulties the three offers come from).
// A choice without questions with the other settings (room.questionCounts) can't be ticked. With a list left empty,
// or fewer than MIN_QUESTIONS questions, the match can't start and the tab has a red dot. Every tap is saved straight
// away for the whole room; with `readOnly` everything shows but nothing can be tapped.
export default function ReySettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = reyConfig(room);
  const [draft, setDraft] = useState(saved);
  const counts = room.questionCounts || { categories: {}, difficulties: {} };

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.difficulties.join(), saved.categories.join()]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ rey: next });
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

  // A choice without questions can't be ticked (but can be unticked).
  const disabled = (key, id) => !(counts[key]?.[id] || 0) && !draft[key].includes(id);
  const seconds = Math.round(draft.roundMs / 1000);

  return (
    <SettingsTabs
      readOnly={readOnly}
      storageKey="rey"
      tabs={[
        {
          id: "partida",
          label: "Partida",
          icon: "hourglass",
          note: `${draft.rounds} rondas · ${seconds} s`,
          content: (
            <>
              <OptionRow
                label="Rondas"
                options={rangeOptions(ROUND_LIMITS)}
                value={draft.rounds}
                onChange={(n) => save({ rounds: n })}
              />
              <OptionRow
                label="Segundos para responder"
                hint="Lo que tienen los retadores"
                options={rangeOptions(SECONDS_LIMITS)}
                value={seconds}
                onChange={(n) => save({ roundMs: n * 1000 })}
              />
            </>
          ),
        },
        {
          id: "preguntas",
          label: "Preguntas",
          icon: "bulb",
          note: countNote(draft.categories, CATEGORIES.length),
          alert: !draft.categories.length || !draft.difficulties.length || (room.questionsReady != null && room.questionsReady < MIN_QUESTIONS),
          content: (
            <>
              <OptionRow
                label="Categorías"
                multi
                wrap
                options={CATEGORIES.map((c) => ({ value: c.id, label: c.label, disabled: disabled("categories", c.id) }))}
                value={draft.categories}
                onChange={(id) => toggle("categories", CATEGORIES, id)}
                onSetAll={(categories) => save({ categories })}
              />
              <OptionRow
                label="Dificultad"
                hint="El rey suma 1, 3 o 5 puntos según la que elija"
                multi
                options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label, disabled: disabled("difficulties", d.id) }))}
                value={draft.difficulties}
                onChange={(id) => toggle("difficulties", DIFFICULTIES, id)}
                onSetAll={(difficulties) => save({ difficulties })}
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
