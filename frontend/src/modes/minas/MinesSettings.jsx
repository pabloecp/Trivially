import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SettingsTabs, { countNote } from "../../components/home/SettingsTabs.jsx";
import { CATEGORIES, DIFFICULTIES, RACE_SECONDS_LIMITS, ROUND_OPTIONS, SECONDS_LIMITS, STYLES, minesConfig } from "./minesInfo.js";

// Settings of a Campo de minas match, in the settings panel, in two tabs: "Partida" (how it's played, by turns or a
// race with no turns, with both ticked each round is played one way or the other; how many rounds, one board each;
// and the seconds of each turn, or of each round in a race) and "Tableros" (which categories and difficulties the
// boards come from, tick as many as you like, with "Seleccionar todos" / "Deseleccionar todos", like Trivia's). A category or difficulty without boards with
// the other settings (room.questionCounts) can't be ticked; the counts themselves aren't shown. With a list left
// empty the match can't start. Every tap is saved straight away for the whole room. With `readOnly` (players without
// permission) everything shows but nothing can be tapped.
export default function MinesSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = minesConfig(room);
  const [draft, setDraft] = useState(saved);
  const counts = room.questionCounts || { categories: {}, difficulties: {} };

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.styles.join(), saved.rounds, saved.turnMs, saved.roundMs, saved.difficulties.join(), saved.categories.join()]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ mines: next });
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

  // A choice without boards can't be ticked (but can be unticked).
  const choice = (key) => (item) => {
    const count = counts[key]?.[item.id] || 0;
    return { value: item.id, label: item.label, disabled: !count && !draft[key].includes(item.id) };
  };

  const styleNote =
    draft.styles.length === 2 ? "Turnos y carrera" : draft.styles.includes("carrera") ? "Carrera" : draft.styles.length ? "Por turnos" : "";

  return (
    <SettingsTabs
      readOnly={readOnly}
      storageKey="minas"
      tabs={[
        {
          id: "partida",
          label: "Partida",
          icon: "hourglass",
          note: [`${draft.rounds} rondas`, styleNote].filter(Boolean).join(" · "),
          alert: !draft.styles.length,
          content: (
            <>
              <OptionRow
                label="Modos de juego"
                multi
                options={STYLES.map((s) => ({ value: s.id, label: s.label, title: s.hint }))}
                value={draft.styles}
                onChange={(id) => toggle("styles", STYLES, id)}
                onSetAll={(styles) => save({ styles })}
              />
              <OptionRow
                label="Rondas"
                options={ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                value={draft.rounds}
                onChange={(n) => save({ rounds: n })}
              />
              {/* The seconds of each way that is ticked: per turn, and per round in a race. */}
              {(draft.styles.includes("turnos") || !draft.styles.length) && (
                <OptionRow
                  label="Segundos por turno"
                  options={rangeOptions(SECONDS_LIMITS)}
                  value={Math.round(draft.turnMs / 1000)}
                  onChange={(n) => save({ turnMs: n * 1000 })}
                />
              )}
              {draft.styles.includes("carrera") && (
                <OptionRow
                  label="Segundos por ronda en carrera"
                  options={rangeOptions(RACE_SECONDS_LIMITS)}
                  value={Math.round(draft.roundMs / 1000)}
                  onChange={(n) => save({ roundMs: n * 1000 })}
                />
              )}
            </>
          ),
        },
        {
          id: "tableros",
          label: "Tableros",
          icon: "grid",
          note: countNote(draft.categories, CATEGORIES.length),
          alert: !draft.categories.length || !draft.difficulties.length,
          content: (
            <>
              <OptionRow
                label="Categorías"
                multi
                wrap
                options={CATEGORIES.map(choice("categories"))}
                value={draft.categories}
                onChange={(id) => toggle("categories", CATEGORIES, id)}
                onSetAll={(categories) => save({ categories })}
              />
              <OptionRow
                label="Dificultad"
                multi
                options={DIFFICULTIES.map(choice("difficulties"))}
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
