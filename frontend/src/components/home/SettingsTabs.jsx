import { useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// Every game's settings, split in tabs so each view fits the panel without scrolling. The usual two: "Partida" (how
// it's played and how long: ways of answering, modes, rounds, seconds) and what comes up ("Preguntas", "Canciones",
// "Eventos", "Tableros": topics, difficulty).
// `tabs` are { id, label, icon?, note?, alert?, content } or, for a tab with parts, { …, sub: [{ id, label, note?,
// alert?, toggle?, content }] }, shown as a smaller row of tabs inside (Adivina la canción's "Catálogo" | "Tus playlists").
// `note` is a short summary under the name ("10 rondas · 20 s", "Todas"), so what a tab holds shows without opening
// it; `alert` puts a red dot on it when something there keeps the match from starting. A falsy tab is left out.
// Each tab's `content` goes in the read-only fieldset, so players without permission can still switch tabs to look.
// They always open on the first tab ("Partida"), and inside a tab with parts on its first part; nothing is remembered
// between visits. (`storageKey` is still accepted, unused.) `children` go under the tabs.
export default function SettingsTabs({ tabs, readOnly = false, storageKey = null, label = "Ajustes", children }) {
  const list = tabs.filter(Boolean);
  const [open, setOpen] = useState(() => list[0].id);
  const [subOpen, setSubOpen] = useState({});
  const current = list.find((t) => t.id === open) || list[0];
  const sub = Array.isArray(current.sub) ? current.sub.filter(Boolean) : null;
  const subCurrent = sub?.find((s) => s.id === subOpen[current.id]) || sub?.[0];
  const shown = subCurrent || current;
  const panelId = useId();

  function choose(id) {
    setOpen(id);
  }

  function chooseSub(id) {
    const next = { ...subOpen, [current.id]: id };
    setSubOpen(next);
  }

  return (
    <div className="tv-settings-tabbed">
      <TabRow tabs={list} value={current.id} onChange={choose} label={label} panelId={panelId} />
      <div className="tv-settab-panel" id={panelId} role="tabpanel" key={`${current.id}:${subCurrent?.id || ""}`}>
        {sub && sub.length > 1 && (
          <TabRow sub tabs={sub} value={subCurrent.id} onChange={chooseSub} label={current.label} panelId={panelId} />
        )}
        <fieldset className="tv-settings" disabled={readOnly}>
          {shown.content}
        </fieldset>
      </div>
      {children}
    </div>
  );
}

// One row of tabs. Arrows (and Inicio / Fin) move between them, like any tab list.
function TabRow({ tabs, value, onChange, label, panelId, sub = false }) {
  const refs = useRef([]);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));

  function onKeyDown(event) {
    const last = tabs.length - 1;
    const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[event.key];
    if (to == null) return;
    event.preventDefault();
    const next = (to + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      className={`tv-settabs${sub ? " is-sub" : ""}`}
      role="tablist"
      aria-label={label}
      style={{ "--n": tabs.length, "--i": index }}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t, i) => {
        const tab = (
        <button
          key={t.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          className={`tv-settab${t.toggle ? " has-toggle" : ""}`}
          aria-selected={t.id === value}
          aria-controls={panelId}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
          data-sound={t.id === value ? "none" : undefined}
        >
          <span className="tv-settab-label">
            {t.icon && <Icon name={t.icon} size={sub ? 15 : 17} strokeWidth={2.6} />}
            {t.label}
            {t.alert && <span className="tv-settab-alert" role="img" aria-label="Falta elegir algo" />}
          </span>
          {t.note && <small className="tv-settab-note">{t.note}</small>}
        </button>
        );
        if (!t.toggle) return tab;
        // A tab with an on/off switch at its end (Adivina la canción's catalog): the switch sits over the tab, beside
        // it in the page's order, so tapping it only switches and tapping the rest opens the tab.
        return (
          <div key={t.id} className="tv-settab-wrap">
            {tab}
            <button
              type="button"
              role="switch"
              className="tv-switch tv-settab-switch"
              aria-checked={t.toggle.on}
              aria-label={t.toggle.label}
              disabled={t.toggle.disabled}
              onClick={() => t.toggle.onChange(!t.toggle.on)}
            >
              <span className="tv-switch-knob" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** A list's summary for a tab's note, `noun` being a feminine plural: "Todas las categorías", "Sin categorías", "3 de 10 categorías". */
export function countNote(chosen, total, noun = "categorías") {
  if (!chosen.length) return `Sin ${noun}`;
  if (chosen.length >= total) return `Todas las ${noun}`;
  return `${chosen.length} de ${total} ${noun}`;
}
