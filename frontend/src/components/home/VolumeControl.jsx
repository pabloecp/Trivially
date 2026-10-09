import { useEffect, useRef, useState } from "react";
import { setVolume, toggleMute, useVolume } from "../../lib/volume.js";
import Icon from "./Icon.jsx";

// The page's volume (see lib/volume.js): a round button that opens a small panel with a mute button and a slider.
// It sits in the top bar on every screen. On phones the room screen has no top bar and its own header is full, so
// there it is the "dock" variant: a button like the invite one in the bar at the bottom, whose panel opens upwards.
export default function VolumeControl({ variant = "chip" }) {
  const { muted, shown } = useVolume();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const dock = variant === "dock";
  const percent = Math.round(shown * 100);
  const icon = percent === 0 ? "volume-off" : percent < 50 ? "volume-low" : "volume";

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`tv-vol${dock ? " tv-vol--dock" : ""}`}>
      <button
        type="button"
        className={`tv-vol-btn ${dock ? "tv-btn tv-c-neutral tv-roomdock-vol" : "tv-chip tv-chip--icon"}`}
        aria-label={muted ? "Volumen: silenciado" : `Volumen: ${percent}%`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {dock ? (
          <Icon name={icon} size={24} strokeWidth={2.6} />
        ) : (
          <span className="tv-avatar tv-avatar--empty">
            <Icon name={icon} size={18} strokeWidth={2.6} />
          </span>
        )}
      </button>
      {open && (
        <div className="tv-vol-pop" role="group" aria-label="Volumen">
          <button
            type="button"
            className="tv-vol-mute"
            aria-label={muted ? "Activar el sonido" : "Silenciar"}
            aria-pressed={muted}
            onClick={toggleMute}
          >
            <Icon name={icon} size={20} strokeWidth={2.6} />
          </button>
          <input
            type="range"
            className="tv-vol-slider"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-label="Volumen"
            aria-valuetext={`${percent}%`}
            style={{ "--fill": `${percent}%` }}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
          />
          <output className="tv-vol-num" aria-hidden="true">
            {percent}%
          </output>
        </div>
      )}
    </div>
  );
}
