import { useEffect, useRef, useState } from "react";
import { loadMusicOptions, musicOption, onMusicChange, setMusicOption } from "../../lib/music.js";
import { SOUND_PACKS, onSoundChange, setSoundPack, soundPack } from "../../lib/sounds.js";
import Icon from "./Icon.jsx";
import { VolumeRows } from "./VolumeMenu.jsx";

// TEMPORARY, while the music and the sounds are chosen: a button that opens a panel with the music options
// (lib/music.js) and the sound sets (lib/sounds.js). Picking one lets it be heard at once and keeps it in this browser.
// It is a chip of the top bar (TvTopbar.jsx); with `floating`, a round button in the bottom left corner (App.jsx), only
// shown where the top bar isn't (home.css: phones in a room, a Geografía match). To remove, with `.tv-tempmenu` in
// home.css, once one of each is chosen as the only one.
export default function TempSoundMenu({ floating = false }) {
  const [open, setOpen] = useState(false);
  const [music, setMusic] = useState([]);
  const [musicId, setMusicId] = useState(musicOption);
  const [pack, setPack] = useState(soundPack);
  const rootRef = useRef(null);

  useEffect(() => {
    const offMusic = onMusicChange(() => setMusicId(musicOption()));
    const offSound = onSoundChange(() => setPack(soundPack()));
    return () => {
      offMusic();
      offSound();
    };
  }, []);

  // The music options are downloaded when the panel opens (again if they failed before).
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadMusicOptions().then((list) => {
      if (!alive) return;
      setMusic(list);
      setMusicId(musicOption());
    });
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const section = (title, options, value, onPick, empty) => (
    <section className="tv-tempmenu-section">
      <p className="tv-tempmenu-title">{title}</p>
      {options.length === 0 && <p className="tv-tempmenu-empty">{empty}</p>}
      {options.map((o) => {
        const on = o.id === value || (!options.some((x) => x.id === value) && o === options[0]);
        return (
          <button
            key={o.id}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            data-sound="none"
            className={`tv-tempmenu-item${on ? " is-on" : ""}`}
            onClick={() => onPick(o.id)}
          >
            <span>
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
            </span>
            {on && <Icon name="check" size={16} strokeWidth={3} />}
          </button>
        );
      })}
    </section>
  );

  return (
    <div className={`tv-tempmenu${floating ? " tv-tempmenu--floating" : ""}`} ref={rootRef}>
      {open && (
        <div className="tv-tempmenu-panel" role="menu" aria-label="Música y sonidos (prueba)">
          {/* The floating copy stands in for the top bar, volume included. */}
          {floating && (
            <div className="tv-tempmenu-volume">
              <VolumeRows />
            </div>
          )}
          {section("Música", music, musicId, setMusicOption, "Cargando…")}
          {section("Sonidos", SOUND_PACKS, pack, setSoundPack, "")}
        </div>
      )}
      {floating ? (
        <button
          type="button"
          className="tv-tempmenu-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Probar música y sonidos"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "bolt"} size={22} strokeWidth={2.6} />
        </button>
      ) : (
        <button
          type="button"
          className="tv-chip tv-chip--sound tv-tempmenu-chip"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tv-avatar tv-avatar--empty">
            <Icon name={open ? "close" : "bolt"} size={18} strokeWidth={2.4} />
          </span>
          <span className="tv-chip-name">Probar sonidos</span>
        </button>
      )}
    </div>
  );
}
