import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../../modes/index.js";
import Modal from "./Modal.jsx";

// The game's settings, hidden behind a summary: at the bottom of the game's card (`card`, given `{ summary, onOpen }`
// for ModeStage's `settings`), one line of what's chosen ("5 rondas · 15 s · Todas las categorías", the notes of its
// tabs, SettingsTabs) and "Ajustes", which opens them in a panel ("Ajustes de Trivia") with "Restablecer" (back to a
// new room's) and "Listo" at the bottom. Each mode puts its own settings (and any warning) inside. Players who can't
// change them still open them to look ("Los elige Ana"). A public match's can't be changed: its card only says them.
// `inline` keeps the old card beside the game's (the playlist, whose games each have their settings): a title, who
// chooses, `actions` at the end of the title's row, and the settings under it.
const SummaryContext = createContext(null);
const StackedContext = createContext(false);

/** `{ open, done }`: "Ajustes" was tapped on Inicio before the private match existed (HomeFrame), so the match's
 *  settings open as soon as it shows. */
export const OpenSettingsContext = createContext(null);

/** SettingsTabs sends its tabs' notes here, so the summary line shows them with the panel closed. */
export function useSettingsSummary(text) {
  const set = useContext(SummaryContext);
  useLayoutEffect(() => {
    set?.(text);
  }, [set, text]);
}

/** In the "Ajustes de …" panel the tabs' settings go one after another, the tabs on top jumping to each (SettingsTabs). */
export const useSettingsStacked = () => useContext(StackedContext);

export default function SettingsPanel({ room, readOnly = false, actions = null, inline = false, card = null, children }) {
  const { resetConfig } = useApp();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = findMode(room.game);
  const openAsked = useContext(OpenSettingsContext);

  useEffect(() => {
    if (inline || !openAsked?.open) return;
    openAsked.done();
    setOpen(true);
  }, [openAsked?.open]);

  if (inline) {
    return (
      <section className="tv-settings-card tv-settings-panel" aria-labelledby="tv-settings-title">
        <div className="tv-settings-head">
          <h2 id="tv-settings-title" className="tv-settings-title">
            Ajustes
          </h2>
          {readOnly && <span className="tv-settings-who">Los elige {room.hostName || "el anfitrión"}</span>}
          {actions}
        </div>
        {children}
      </section>
    );
  }

  async function reset() {
    setBusy(true);
    try {
      await resetConfig(room.game);
    } catch {
      // The settings stay as they were; nothing else to say.
    } finally {
      setBusy(false);
    }
  }

  return (
    <SummaryContext.Provider value={setSummary}>
      {card?.({ summary, onOpen: () => setOpen(true) })}
      <Modal
        open={open}
        keep
        onClose={() => setOpen(false)}
        title={`Ajustes de ${mode?.name || "la partida"}`}
        size="lg"
        className="tv-settings-modal"
        foot={
          <>
            {readOnly ? (
              <span className="tv-settings-who">Los elige {room.hostName || "el anfitrión"}</span>
            ) : (
              <button type="button" className="tv-btn tv-btn--neutral" disabled={busy || !room.settingsChanged} onClick={reset}>
                Restablecer
              </button>
            )}
            <button type="button" className="tv-btn tv-btn--primary tv-btn--lg" onClick={() => setOpen(false)}>
              Listo
            </button>
          </>
        }
      >
        <StackedContext.Provider value>{children}</StackedContext.Provider>
      </Modal>
    </SummaryContext.Provider>
  );
}
