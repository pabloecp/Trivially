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
import { setVolume, toggleMute, useVolume } from "../../lib/volume.js";
import Icon from "./Icon.jsx";

// The volume rows: "Canciones" (the songs of Adivina la canción and any other <audio>, lib/volume.js) and "Sonidos"
// (the taps and results, lib/sounds.js). In each the icon turns it off and on and the slider sets how loud (kept in this
// browser). The sounds' tap plays at the new volume when the slider is let go.
function VolumeRows() {
  const [, refresh] = useState(0);
  const songs = useVolume();
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    return onSoundChange(update);
  }, []);

  const rows = [
    {
      id: "songs",
      label: "Canciones",
      on: !songs.muted,
      value: Math.round(songs.level * 100),
      icon: songs.shown === 0 ? "mute" : "volume",
      toggle: toggleMute,
      change: (v) => setVolume(Number(v) / 100),
      release: () => {},
    },
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

// The sound sets (SOUND_PACKS): only the chosen one shows, with ‹ › to go through them; each change plays a sample of it
// and keeps it in this browser. Only in the owners' panel (AdminPanel.jsx); everyone else hears the default one, Madera.
export function SoundPacks() {
  const [, refresh] = useState(0);
  useEffect(() => onSoundChange(() => refresh((n) => n + 1)), []);
  const index = Math.max(0, SOUND_PACKS.findIndex((p) => p.id === soundPack()));
  const pack = SOUND_PACKS[index];
  const step = (by) => setSoundPack(SOUND_PACKS[(index + by + SOUND_PACKS.length) % SOUND_PACKS.length].id);
  return (
    <div className="tv-sound-pick">
      <button type="button" className="tv-sound-step" data-sound="none" aria-label="Sonido anterior" onClick={() => step(-1)}>
        <Icon name="chevron" size={18} strokeWidth={3} className="is-back" />
      </button>
      <span key={pack.id} className="tv-sound-now" aria-live="polite">
        <strong>{pack.label}</strong>
        <small>
          {pack.hint} · {index + 1} de {SOUND_PACKS.length}
        </small>
      </span>
      <button type="button" className="tv-sound-step" data-sound="none" aria-label="Sonido siguiente" onClick={() => step(1)}>
        <Icon name="chevron" size={18} strokeWidth={3} />
      </button>
    </div>
  );
}

// The volume button: a speaker (crossed out when the sounds are off) that opens the two sliders. It is in the top bar and in
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

  const songs = useVolume();
  // Crossed out only when nothing makes a sound: neither the songs nor the effects.
  const silent = (!soundEnabled() || !soundVolume()) && songs.shown === 0;
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
          <Icon name={silent ? "mute" : "volume"} size={20} strokeWidth={2.6} />
        </span>
      </button>
      {open && (
        <div className="tv-volume-panel" role="dialog" aria-label="Volumen">
          <VolumeRows />
        </div>
      )}
    </div>
  );
}
