import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import { api } from "../../lib/api.js";

// Both steppers move in steps of 5. The server keeps the same limits (roomManager.updateConfig).
const ROUNDS = { min: 5, max: 25, step: 5 };
const SECONDS = { min: 10, max: 30, step: 5 };

function Stepper({ label, value, unit, limits, onChange }) {
  const { min, max, step } = limits;
  return (
    <div className="tv-stepper" role="group" aria-label={label}>
      <span className="tv-label">{label}</span>
      <div className="tv-stepper-row">
        <button
          type="button"
          className="tv-stepper-btn"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`Menos ${label.toLowerCase()}`}
        >
          <Icon name="chevron" size={22} strokeWidth={3} className="tv-stepper-down" />
        </button>
        <span key={value} className="tv-stepper-value" aria-live="polite">
          {value}
          {unit && <small>{unit}</small>}
        </span>
        <button
          type="button"
          className="tv-stepper-btn"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`Más ${label.toLowerCase()}`}
        >
          <Icon name="chevron" size={22} strokeWidth={3} className="tv-stepper-up" />
        </button>
      </div>
      <span className="tv-stepper-range">
        de {min} a {max}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

function configKey(config) {
  return JSON.stringify([config?.playlistIds || [], config?.rounds, config?.roundMs]);
}

// The match settings, right on the room screen. Every tap is saved straight away for the whole room; the local
// Album covers of the chosen playlists sliding by in two rows, so you can see what kind of songs are coming.
// Each row is drawn twice in a row and slides half its width, which loops without a jump.
function CoverStrip({ covers }) {
  const rows = [covers.filter((_, i) => i % 2 === 0), covers.filter((_, i) => i % 2 === 1)];
  return (
    <div className="tv-covers" aria-hidden="true">
      {rows.map((row, r) => (
        <div key={r} className={`tv-covers-row${r ? " is-reverse" : ""}`}>
          <div className="tv-covers-track" style={{ "--n": row.length }}>
            {[...row, ...row].map((src, i) => (
              <img key={i} src={src} alt="" loading="lazy" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// copy only keeps the tap visible until the server's new state arrives. `children` go at the bottom of the card
// (the host's "who may change the settings" chips).
export default function MusicSettings({ room, catalog, updateConfig, onToast, children }) {
  const playlists = catalog?.playlists || [];
  const defaultIds = playlists.filter((p) => p.isDefault).map((p) => p.id);
  const [draft, setDraft] = useState(room.config);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(room.config);
  }, [configKey(room.config)]);

  const known = (draft?.playlistIds || []).filter((id) => playlists.some((p) => p.id === id));
  const selected = known.length ? known : defaultIds;
  const rounds = draft?.rounds || 10;
  const seconds = Math.round((draft?.roundMs || 15000) / 1000);
  const songCount = playlists.filter((p) => selected.includes(p.id)).reduce((n, p) => n + p.trackCount, 0);
  // A server without `covers` in /api/catalog (older deploys) still lists each playlist's songs, images included.
  const [fetched, setFetched] = useState({});
  const missing = playlists.filter((p) => selected.includes(p.id) && !p.covers && !fetched[p.id]).map((p) => p.id);
  useEffect(() => {
    for (const id of missing) {
      api("/api/catalog/preview", { method: "POST", body: { playlistIds: [id] } })
        .then((data) => {
          const urls = (data.songs || []).map((s) => s.image?.replace(/\/\d+x\d+bb\./, "/160x160bb.")).filter(Boolean);
          setFetched((cur) => ({ ...cur, [id]: urls }));
        })
        .catch(() => {});
    }
  }, [missing.join(",")]);

  // Covers of the chosen playlists, taking turns between them so a mix shows both, without repeats.
  const lists = playlists.filter((p) => selected.includes(p.id)).map((p) => p.covers || fetched[p.id] || []);
  const covers = [];
  for (let i = 0; covers.length < 40 && lists.some((l) => i < l.length); i += 1) {
    for (const l of lists) if (l[i] && !covers.includes(l[i]) && covers.length < 40) covers.push(l[i]);
  }

  async function save(change) {
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ playlistIds: next.playlistIds || selected, rounds: next.rounds || rounds, roundMs: next.roundMs || seconds * 1000 });
    } catch (err) {
      setDraft(room.config);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  // One playlist always stays selected: tapping the last one does nothing.
  function togglePlaylist(id) {
    if (selected.includes(id)) {
      if (selected.length > 1) save({ playlistIds: selected.filter((x) => x !== id) });
    } else {
      save({ playlistIds: [...selected, id] });
    }
  }

  return (
    <section className="tv-card tv-settings" aria-labelledby="tv-settings-title">
      <h2 id="tv-settings-title" className="tv-card-title">Ajustes de la partida</h2>

      <fieldset className="tv-fieldset">
        <legend className="tv-label">Playlists</legend>
        <div className="tv-picks">
          {playlists.map((p) => {
            // "Most Streamed Songs on Spotify · Español" shows as "Español"; the full name is the tooltip.
            const label = p.name.split(" · ").pop();
            return (
              <button
                key={p.id}
                type="button"
                className="tv-pick tv-pick--playlist"
                aria-pressed={selected.includes(p.id)}
                title={p.name}
                onClick={() => togglePlaylist(p.id)}
              >
                <span className="tv-pick-art">
                  <Icon name="music" size={18} strokeWidth={2.4} />
                </span>
                {label}
              </button>
            );
          })}
        </div>
        {playlists.length > 0 && songCount < rounds && (
          <p className="tv-playlist-total is-short" role="alert">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Necesitas al menos <strong>{rounds} canciones</strong> (tienes {songCount})
            </span>
          </p>
        )}
      </fieldset>

      {covers.length > 0 && <CoverStrip key={selected.join(",")} covers={covers} />}

      <div className="tv-steppers">
        <Stepper label="Rondas" value={rounds} limits={ROUNDS} onChange={(n) => save({ rounds: n })} />
        <Stepper label="Segundos por ronda" value={seconds} unit="s" limits={SECONDS} onChange={(n) => save({ roundMs: n * 1000 })} />
      </div>

      {children}
    </section>
  );
}
