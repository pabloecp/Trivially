import { useEffect, useRef, useState } from "react";
import { currentSong, musicEnabled, musicVolume, onMusicChange, setMusicEnabled, setMusicVolume } from "../../lib/music.js";
import { onSoundChange, setSoundEnabled, setSoundVolume, soundEnabled, soundVolume } from "../../lib/sounds.js";
import Icon from "./Icon.jsx";

// The music's and the sounds' volume, one row each: the icon turns it off and on, the slider sets how loud (lib/music.js,
// lib/sounds.js; kept in this browser). The sounds play a tap at the new volume when the slider is let go.
export function VolumeRows() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    const offMusic = onMusicChange(update);
    const offSound = onSoundChange(update);
    return () => {
      offMusic();
      offSound();
    };
  }, []);

  const song = currentSong();
  const rows = [
    {
      id: "music",
      label: "Música",
      detail: musicEnabled() && song ? `${song.title} - ${song.artistName}` : null,
      on: musicEnabled(),
      value: musicVolume(),
      icon: musicEnabled() ? "music" : "musicOff",
      toggle: () => setMusicEnabled(!musicEnabled()),
      change: (v) => setMusicVolume(v),
      release: () => {},
    },
    {
      id: "sound",
      label: "Sonidos",
      detail: null,
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
            {r.detail && <small className="tv-volume-detail">{r.detail}</small>}
          </label>
        </div>
      ))}
    </div>
  );
}

// The volume button: a speaker (crossed out when both are off) that opens the two sliders. It is in the top bar and in
// the phones' room header (RoomBars.jsx); with `floating` it is pinned to the top right corner (App.jsx), only shown
// where neither is (home.css: a Geografía match on a phone).
export default function VolumeMenu({ floating = false }) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const rootRef = useRef(null);

  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    const offMusic = onMusicChange(update);
    const offSound = onSoundChange(update);
    return () => {
      offMusic();
      offSound();
    };
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

  const silent = (!musicEnabled() || !musicVolume()) && (!soundEnabled() || !soundVolume());
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
        </div>
      )}
    </div>
  );
}
