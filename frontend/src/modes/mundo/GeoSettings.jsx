import { useEffect, useState } from "react";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SettingsTabs from "../../components/home/SettingsTabs.jsx";
import { DIFFICULTIES, ROUNDS_LIMITS, SECONDS_LIMITS, STYLES, geoConfig } from "./geoInfo.js";

// Settings of an Encuentra el país match, in the settings panel, in two tabs like every game's: "Partida" (how many
// rounds and the seconds to put the pin, like Adivina la canción's) and "Preguntas" (how the country is given, "Modos
// de juego": by its name, its silhouette or its flag; and the difficulties; tick as many as you like of each, all by
// default). Every tap is saved straight away for the whole room. With `readOnly` (players without permission)
// everything shows but nothing can be tapped.
export default function GeoSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = geoConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.roundMs, saved.styles.join(), saved.difficulties.join()]);

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

  // "Sombra · Bandera" when not every way is ticked (all three need no word).
  const stylesNote =
    draft.styles.length === STYLES.length ? "" : draft.styles.length ? STYLES.filter((st) => draft.styles.includes(st.id)).map((st) => st.label).join(" · ") : "Ningún modo";
  const levelsNote = draft.difficulties.length
    ? DIFFICULTIES.filter((d) => draft.difficulties.includes(d.id)).map((d) => d.label).join(" · ")
    : "Ninguna dificultad";

  return (
    <SettingsTabs
      readOnly={readOnly}
      storageKey="mundo"
      tabs={[
        {
          id: "partida",
          label: "Partida",
          icon: "hourglass",
          note: `${draft.rounds} rondas · ${Math.round(draft.roundMs / 1000)} s`,
          content: (
            <>
              <OptionRow label="Rondas" options={rangeOptions(ROUNDS_LIMITS)} value={draft.rounds} onChange={(n) => save({ rounds: n })} />
              <OptionRow
                label="Segundos por ronda"
                options={rangeOptions(SECONDS_LIMITS)}
                value={Math.round(draft.roundMs / 1000)}
                onChange={(n) => save({ roundMs: n * 1000 })}
              />
            </>
          ),
        },
        {
          id: "preguntas",
          label: "Preguntas",
          icon: "globe",
          note: [stylesNote, levelsNote].filter(Boolean).join(" · "),
          alert: !draft.styles.length || !draft.difficulties.length,
          content: (
            <>
              <OptionRow
                label="Modos de juego"
                multi
                options={STYLES.map((st) => ({ value: st.id, label: st.label, title: st.hint }))}
                value={draft.styles}
                onChange={(id) => toggle("styles", STYLES, id)}
                onSetAll={(styles) => save({ styles })}
              />
              <OptionRow
                label="Dificultad"
                multi
                options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label, title: d.hint }))}
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
