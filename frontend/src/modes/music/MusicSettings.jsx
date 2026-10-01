import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import SpotifyIcon from "../../components/home/SpotifyIcon.jsx";
import { api } from "../../lib/api.js";
import { useApp } from "../../lib/store.jsx";

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

// A Spotify playlist's cover, or the Spotify logo when it has none.
function PlaylistArt({ image }) {
  return (
    <span className={`tv-pick-art${image ? "" : " tv-pick-art--spotify"}`}>
      {image ? <img src={image} alt="" loading="lazy" /> : <SpotifyIcon size={22} color="#000" waves="#1DB954" />}
    </span>
  );
}

function configKey(config) {
  return JSON.stringify([config?.playlistIds || [], config?.rounds, config?.roundMs]);
}

// The match settings, right on the room screen. Every tap is saved straight away for the whole room; the local
// Album covers of the chosen playlists sliding by in two rows, so you can see what kind of songs are coming.
// Each row is drawn twice in a row and slides half its width, which loops without a jump.
function CoverStrip({ covers }) {
  // With few covers (a Spotify playlist still loading) each row repeats them so it still fills the card.
  const fill = (row) => (row.length ? Array.from({ length: Math.max(1, Math.ceil(10 / row.length)) }, () => row).flat() : row);
  const rows = covers.length < 4 ? [fill(covers), fill(covers)] : [fill(covers.filter((_, i) => i % 2 === 0)), fill(covers.filter((_, i) => i % 2 === 1))];
  return (
    <div className="tv-covers" aria-hidden="true">
      {rows.map((row, r) => (
        <div key={r} className={`tv-covers-row${r ? " is-reverse" : ""}`}>
          <div className="tv-covers-track" style={{ "--n": row.length }}>
            {[...row, ...row].map((src, i) => (
              <img key={i} src={src} alt="" />
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
  const { user, listSpotifyPlaylists, addSpotifyPlaylist, connectSpotify } = useApp();
  const playlists = catalog?.playlists || [];
  // Spotify playlists the host already added to the room.
  const custom = room.customPlaylists || [];
  // Only an owner who hosts the room gets the "+". Without Spotify connected it asks to connect it; with it, it
  // opens their playlists. Closed, only the chosen ones show.
  const isOwnerHost = room.hostId === user?.id && user?.role === "owner";
  const spotifyLinked = Boolean(user?.spotify);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [askLink, setAskLink] = useState(false);
  const [spotifyLists, setSpotifyLists] = useState(null);
  const [spotifyBusy, setSpotifyBusy] = useState("");
  const defaultIds = playlists.filter((p) => p.isDefault).map((p) => p.id);
  const [draft, setDraft] = useState(room.config);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(room.config);
  }, [configKey(room.config)]);

  const known = (draft?.playlistIds || []).filter((id) => playlists.some((p) => p.id === id) || custom.some((p) => p.id === id));
  const selected = known.length ? known : defaultIds;
  const hasCustom = selected.some((id) => id.startsWith("sp:"));
  const chosenCustom = custom.filter((p) => selected.includes(p.id));
  const customLoading = chosenCustom.some((p) => p.loading);
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
  const lists = [
    ...playlists.filter((p) => selected.includes(p.id)).map((p) => p.covers || fetched[p.id] || []),
    ...chosenCustom.map((p) => p.covers || []),
  ];
  const covers = [];
  for (let i = 0; covers.length < 40 && lists.some((l) => i < l.length); i += 1) {
    for (const l of lists) if (l[i] && !covers.includes(l[i]) && covers.length < 40) covers.push(l[i]);
  }

  // The strip only shows covers that have finished downloading, so none of them pops in half-loaded while it
  // slides. Until they are ready a placeholder of the same size holds the space; while a Spotify playlist loads,
  // the strip keeps its covers and the new ones join once downloaded.
  const coversKey = covers.join("|");
  const selectionKey = selected.join(",");
  const [ready, setReady] = useState({ key: "", selection: "", list: [] });
  useEffect(() => {
    if (!covers.length) return;
    let cancelled = false;
    const loadOne = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => resolve(null), 6000);
        img.onload = () => (clearTimeout(timer), resolve(src));
        img.onerror = () => (clearTimeout(timer), resolve(null));
        img.src = src;
      });
    Promise.all(covers.map(loadOne)).then((list) => {
      if (!cancelled) setReady({ key: coversKey, selection: selectionKey, list: list.filter(Boolean) });
    });
    return () => {
      cancelled = true;
    };
  }, [coversKey]);

  // While Spotify songs are still loading, the strip waits for at least 5 covers; then it starts with those and
  // more join as they are found.
  // Only covers of the current selection: after a change the loading bar shows until the new ones are in, so the
  // strip never shows songs that aren't in the chosen playlists.
  const stripFits = ready.selection === selectionKey;
  const showStrip = stripFits && (ready.list.length >= 5 || (ready.list.length > 0 && !customLoading));

  async function onPlus() {
    if (!spotifyLinked) {
      setAskLink((v) => !v);
      return;
    }
    if (spotifyOpen) {
      setSpotifyOpen(false);
      return;
    }
    setSpotifyOpen(true);
    if (!spotifyLists) await showSpotifyPlaylists();
  }

  async function onConnectSpotify() {
    setSpotifyBusy("connect");
    try {
      await connectSpotify();
    } catch (err) {
      onToast?.(err.message || "No se pudo conectar con Spotify");
      setSpotifyBusy("");
    }
  }

  async function showSpotifyPlaylists() {
    setSpotifyBusy("list");
    try {
      setSpotifyLists(await listSpotifyPlaylists());
    } catch (err) {
      onToast?.(err.message || "No se pudieron leer tus playlists de Spotify");
    } finally {
      setSpotifyBusy("");
    }
  }

  async function addSpotify(id) {
    // Added before and then unselected: it only needs selecting again.
    if (custom.some((c) => c.id === `sp:${id}`)) return togglePlaylist(`sp:${id}`);
    setSpotifyBusy(id);
    try {
      await addSpotifyPlaylist(id);
    } catch (err) {
      onToast?.(err.message || "No se pudo añadir la playlist");
    } finally {
      setSpotifyBusy("");
    }
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
          {chosenCustom.map((p) => (
            <button
              key={p.id}
              type="button"
              className="tv-pick tv-pick--playlist tv-pick--custom"
              aria-pressed={true}
              title={p.name}
              onClick={() => togglePlaylist(p.id)}
            >
              <PlaylistArt image={p.image} />
              <span className="tv-pick-name">{p.name}</span>
            </button>
          ))}
          {isOwnerHost &&
            spotifyOpen &&
            (spotifyLists || [])
              .filter((p) => !selected.includes(`sp:${p.id}`))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="tv-pick tv-pick--playlist tv-pick--custom"
                  aria-pressed={false}
                  title={`${p.name} · ${p.total} canciones`}
                  disabled={Boolean(spotifyBusy)}
                  onClick={() => addSpotify(p.id)}
                >
                  <PlaylistArt image={p.image} />
                  <span className="tv-pick-name">{spotifyBusy === p.id ? "Añadiendo…" : p.name}</span>
                </button>
              ))}
          {isOwnerHost && (
            <button
              type="button"
              className="tv-pick tv-pick--add"
              onClick={onPlus}
              disabled={spotifyBusy === "list"}
              aria-expanded={spotifyLinked ? spotifyOpen : askLink}
              aria-label={spotifyOpen ? "Ocultar tus playlists de Spotify" : "Añadir tus playlists de Spotify"}
              title="Tus playlists de Spotify"
            >
              {spotifyBusy === "list" ? (
                <SpotifyIcon size={20} />
              ) : (
                <Icon name={spotifyOpen ? "close" : "plus"} size={20} strokeWidth={3} />
              )}
            </button>
          )}
        </div>
        {isOwnerHost && askLink && !spotifyLinked && (
          <div className="tv-spotify-ask">
            <SpotifyIcon size={26} />
            <span>Conecta tu Spotify para jugar con tus playlists.</span>
            <button
              type="button"
              className="tv-btn tv-btn--sm tv-btn--spotify"
              onClick={onConnectSpotify}
              disabled={spotifyBusy === "connect"}
            >
              {spotifyBusy === "connect" ? "Abriendo…" : "Conectar"}
            </button>
          </div>
        )}
        {isOwnerHost && spotifyOpen && spotifyLists?.length === 0 && (
          <p className="tv-playlist-total">No encontramos playlists en tu Spotify.</p>
        )}
        {!hasCustom && playlists.length > 0 && songCount < rounds && (
          <p className="tv-playlist-total is-short" role="alert">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Necesitas al menos <strong>{rounds} canciones</strong> (tienes {songCount})
            </span>
          </p>
        )}
      </fieldset>

      {showStrip ? (
        <CoverStrip key={ready.selection} covers={ready.list} />
      ) : (
        (covers.length > 0 || customLoading) && <div className="tv-covers tv-covers--loading" aria-hidden="true" />
      )}

      <div className="tv-steppers">
        <Stepper label="Rondas" value={rounds} limits={ROUNDS} onChange={(n) => save({ rounds: n })} />
        <Stepper label="Segundos por ronda" value={seconds} unit="s" limits={SECONDS} onChange={(n) => save({ roundMs: n * 1000 })} />
      </div>

      {children}
    </section>
  );
}
