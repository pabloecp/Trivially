import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";

const ROUND_OPTIONS = [5, 10, 15, 20, 25];
const TIME_OPTIONS = [15, 20, 25, 30];

function configKey(config) {
  return JSON.stringify([config?.playlistIds || [], config?.rounds, config?.roundMs]);
}

// The match settings, right on the room screen. Every tap is saved straight away for the whole room; the local
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
  const rounds = draft?.rounds || 5;
  const seconds = Math.round((draft?.roundMs || 15000) / 1000);
  const songCount = playlists.filter((p) => selected.includes(p.id)).reduce((n, p) => n + p.trackCount, 0);

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
      <h2 id="tv-settings-title" className="tv-card-title">Ajustes</h2>

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
                <span className="tv-pick-count">{p.trackCount}</span>
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

      <fieldset className="tv-fieldset">
        <legend className="tv-label">Rondas</legend>
        <div className="tv-picks">
          {ROUND_OPTIONS.map((n) => (
            <button key={n} type="button" className="tv-pick" aria-pressed={rounds === n} onClick={() => save({ rounds: n })}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="tv-fieldset">
        <legend className="tv-label">Segundos por ronda</legend>
        <div className="tv-picks">
          {TIME_OPTIONS.map((sec) => (
            <button key={sec} type="button" className="tv-pick" aria-pressed={seconds === sec} onClick={() => save({ roundMs: sec * 1000 })}>
              {sec} s
            </button>
          ))}
        </div>
      </fieldset>

      {children}
    </section>
  );
}
