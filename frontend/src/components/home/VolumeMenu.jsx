import { useEffect, useRef, useState } from "react";
import {
  SOUND_PACKS,
  onSoundChange,
  setSoundEnabled,
  setSoundPack,
  setSoundVolume,
  soundEnabled,
  soundPack,
  soundVolume,
} from "../../lib/sounds.js";
import Icon from "./Icon.jsx";

// The sounds' volume: the icon turns them off and on, the slider sets how loud (lib/sounds.js; kept in this browser). A
// tap plays at the new volume when the slider is let go.
function VolumeRows() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    return onSoundChange(update);
  }, []);

  const rows = [
    {
      id: "sound",
      label: "Sonidos",
      on: soundEnabled(),
      value: soundVolume(),
      icon: soundEnabled() ? "volume" : "mute",
      toggle: () => setSoundEnabled(!soundEnabled()),
      change: (v) => setSoundVolume(v),
      release: (v) => setSoundVolume(v, { preview: true }),
    },
  ];

  return (
    <div className="tv-volume-rows">
      {rows.map((r) => (
        <div key={r.id} className={`tv-volume-row${r.on ? "" : " is-off"}`}>
          <button
            type="button"
            className="tv-volume-toggle"
            data-sound="none"
            aria-pressed={!r.on}
            aria-label={r.on ? `Quitar ${r.label.toLowerCase()}` : `Poner ${r.label.toLowerCase()}`}
            onClick={r.toggle}
          >
            <Icon name={r.icon} size={18} strokeWidth={2.4} />
          </button>
          <label className="tv-volume-field" data-sound="none">
            <span className="tv-volume-label">
              <strong>{r.label}</strong>
              <span>{r.on ? `${r.value}%` : "Apagado"}</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={r.value}
              disabled={!r.on}
              style={{ "--fill": `${r.value}%` }}
              aria-label={`Volumen de ${r.label.toLowerCase()}`}
              onChange={(e) => r.change(e.target.value)}
              onPointerUp={(e) => r.release(e.currentTarget.value)}
              onKeyUp={(e) => r.release(e.currentTarget.value)}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

// The sound sets (SOUND_PACKS), under the slider: picking one plays a sample of it and keeps it in this browser.
function SoundPacks() {
  const current = soundPack();
  return (
    <section className="tv-volume-packs" aria-label="Tipo de sonido">
      <p className="tv-volume-packs-title">Tipo de sonido</p>
      <div className="tv-volume-packs-list" role="radiogroup" aria-label="Tipo de sonido">
        {SOUND_PACKS.map((p) => {
          const on = p.id === current;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-sound="none"
              className={`tv-volume-pack${on ? " is-on" : ""}`}
              onClick={() => setSoundPack(p.id)}
            >
              <span>
                <strong>{p.label}</strong>
                <small>{p.hint}</small>
              </span>
              {on && <Icon name="check" size={16} strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// The volume button: a speaker (crossed out when the sounds are off) that opens the slider and the sound sets. It is in the top bar and in
// the phones' room header (RoomBars.jsx); with `floating` it is pinned to the top right corner (App.jsx), only shown
// where neither is (home.css: a Geografía match on a phone).
export default function VolumeMenu({ floating = false }) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const rootRef = useRef(null);

  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    return onSoundChange(update);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const silent = !soundEnabled() || !soundVolume();
  return (
    <div className={`tv-volume${floating ? " tv-volume--floating" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="tv-chip tv-chip--icon tv-chip--sound"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Volumen"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tv-avatar tv-avatar--empty">
          <Icon name={silent ? "mute" : "volume"} size={18} strokeWidth={2.4} />
        </span>
      </button>
      {open && (
        <div className="tv-volume-panel" role="dialog" aria-label="Volumen">
          <VolumeRows />
          <SoundPacks />
        </div>
      )}
    </div>
  );
}
