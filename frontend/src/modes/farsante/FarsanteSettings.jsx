import { useEffect, useState } from "react";
import OptionRow from "../../components/home/OptionRow.jsx";
import SettingsTabs from "../../components/home/SettingsTabs.jsx";
import { KINDS, ROUND_OPTIONS, SECONDS_OPTIONS, farsanteConfig } from "./farsanteInfo.js";

// Settings of a Farsante match, in the settings panel, in two tabs: "Partida" (rounds and the seconds to write) and
// "Rondas" (which kinds of round, tick as many as you like). With no kind ticked the match can't start and the tab has
// a red dot. Every tap is saved straight away for the whole room; with `readOnly` everything shows but nothing taps.
export default function FarsanteSettings({ room, updateConfig, onToast, children, readOnly = false }) {
  const saved = farsanteConfig(room);
  const [draft, setDraft] = useState(saved);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(saved);
  }, [saved.rounds, saved.writeMs, saved.kinds.join()]);

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ farsante: next });
    } catch (err) {
      setDraft(saved);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  function toggle(id) {
    const on = draft.kinds.includes(id);
    save({ kinds: KINDS.map((k) => k.id).filter((k) => (k === id ? !on : draft.kinds.includes(k))) });
  }

  const seconds = Math.round(draft.writeMs / 1000);

  return (
    <SettingsTabs
      readOnly={readOnly}
      storageKey="farsante"
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
                options={ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                value={draft.rounds}
                onChange={(n) => save({ rounds: n })}
              />
              <OptionRow
                label="Segundos para escribir"
                options={SECONDS_OPTIONS.map((n) => ({ value: n, label: `${n} s` }))}
                value={seconds}
                onChange={(n) => save({ writeMs: n * 1000 })}
              />
            </>
          ),
        },
        {
          id: "rondas",
          label: "Rondas",
          icon: "bulb",
          note: draft.kinds.length === KINDS.length ? "Todos los tipos" : `${draft.kinds.length} de ${KINDS.length} tipos`,
          alert: !draft.kinds.length,
          content: (
            <OptionRow
              label="Tipos de ronda"
              hint="Se reparten por igual"
              multi
              wrap
              options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
              value={draft.kinds}
              onChange={toggle}
              onSetAll={(kinds) => save({ kinds })}
            />
          ),
        },
      ]}
    >
      {children}
    </SettingsTabs>
  );
}
