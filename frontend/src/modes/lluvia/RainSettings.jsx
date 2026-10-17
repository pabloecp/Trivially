import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SettingsTabs, { countNote } from "../../components/home/SettingsTabs.jsx";
import { CATEGORIES, DIFFICULTIES, ROUND_OPTIONS, SECONDS_LIMITS, rainConfig } from "./rainInfo.js";

// Settings of a Lluvia match, in the settings panel, in two tabs: "Partida" (how many rounds and how long it rains in
// each) and "Preguntas" (which categories and difficulties the questions come from, tick as many as you like, like
// Trivia's; each difficulty with its colour on screen and its points). A choice without questions with the other
// settings (room.questionCounts) can't be ticked. With a list left empty the match can't start. Every tap is saved
// straight away for the whole room. With `readOnly` (players without permission) everything shows but nothing can be
// tapped.
export default function RainSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = rainConfig(room);
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
      await updateConfig({ rain: next });
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
      storageKey="lluvia"
      tabs={[
        {
          id: "partida",
          label: "Partida",
          icon: "hourglass",
          note: `${draft.rounds} ${draft.rounds === 1 ? "ronda" : "rondas"} · ${seconds} s`,
          content: (
            <>
              <OptionRow
                label="Rondas"
                options={ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                value={draft.rounds}
                onChange={(n) => save({ rounds: n })}
              />
              <OptionRow
                label="Segundos de lluvia"
                hint="Lo que dura cada ronda"
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
          alert: !draft.categories.length || !draft.difficulties.length,
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
                hint="Verde 1 punto, amarilla 3 y roja 5"
                multi
                options={DIFFICULTIES.map((d) => ({
                  value: d.id,
                  label: (
                    <>
                      <span className={`tv-rain-dot is-${d.id}`} aria-hidden="true" />
                      {d.label}
                    </>
                  ),
                  disabled: disabled("difficulties", d.id),
                }))}
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
