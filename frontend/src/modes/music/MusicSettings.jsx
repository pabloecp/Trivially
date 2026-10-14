import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SpotifyIcon from "../../components/home/SpotifyIcon.jsx";
import { playlistLabel } from "./playlistLabel.js";
import { FORMATS } from "../quiz/quizInfo.js";

const FORMAT_IDS = FORMATS.map((f) => f.id);
import { useApp } from "../../lib/store.jsx";

// Rounds and seconds go in steps of 5. The server keeps the same limits (roomManager.updateConfig).
const ROUNDS = { min: 5, max: 25, step: 5 };
const SECONDS = { min: 15, max: 35, step: 5 };

function configKey(config) {
  return JSON.stringify([config?.playlistIds || [], config?.rounds, config?.roundMs, config?.formats]);
}

// The match settings, in the settings panel. Every tap is saved straight away for the whole room; the local copy
// only keeps the tap visible until the server's new state arrives. `children` go at the bottom.
// With `readOnly` (players without permission to change them) everything shows but nothing can be tapped.
export default function MusicSettings({ room, catalog, updateConfig, onToast, children, readOnly = false }) {
  const { user, listSpotifyPlaylists, addSpotifyPlaylist, addSpotifyLink, connectSpotify, listSavedSpotify, forgetSavedSpotify } =
    useApp();
  const playlists = catalog?.playlists || [];
  // Spotify playlists already added to the room.
  const custom = room.customPlaylists || [];
  // Among those who may change the settings (the host or a player with permission), owners get the Spotify button.
  // Without Spotify connected it asks to connect it; with it, it opens their playlists. Closed, only the chosen ones
  // show.
  const isOwnerEditor = !readOnly && user?.role === "owner";
  const spotifyLinked = Boolean(user?.spotify);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [askLink, setAskLink] = useState(false);
  const [spotifyLists, setSpotifyLists] = useState(null);
  const [spotifyBusy, setSpotifyBusy] = useState("");
  // A public Spotify playlist pasted as a link (anyone who may change the settings, no Spotify account needed).
  // It is a button among the playlists that opens the box to paste the link; once added, the playlist is one more
  // option of the row, with its tick box.
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  // "Mis playlists": what this account added with a link before, kept on its profile (guests have none). A button
  // among the playlists opens the list: each one is added again with one tap, or deleted for good (two taps).
  const hasAccount = Boolean(user && !user.isGuest);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [savedBusy, setSavedBusy] = useState("");
  const [confirmForget, setConfirmForget] = useState("");
  // Like a new room: every playlist of the catalog ticked.
  const defaultIds = playlists.map((p) => p.id);
  const [draft, setDraft] = useState(room.config);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(room.config);
  }, [configKey(room.config)]);

  const known = (draft?.playlistIds || []).filter((id) => playlists.some((p) => p.id === id) || custom.some((p) => p.id === id));
  // Every playlist unticked stays empty (the match then can't start); otherwise unknown ids fall back to all of them.
  const selected = draft?.playlistIds?.length === 0 ? [] : known.length ? known : defaultIds;
  const hasCustom = selected.some((id) => id.startsWith("sp:"));
  const chosenCustom = custom.filter((p) => selected.includes(p.id));
  const rounds = draft?.rounds || 5;
  const seconds = Math.round((draft?.roundMs || 15000) / 1000);
  const songCount = playlists.filter((p) => selected.includes(p.id)).reduce((n, p) => n + p.trackCount, 0);

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

  async function onAddLink(event) {
    event.preventDefault();
    if (!link.trim() || linkBusy) return;
    setLinkBusy(true);
    try {
      const list = await addSpotifyLink(link.trim());
      if (list) setSaved(list);
      setLink("");
      setLinkOpen(false);
    } catch (err) {
      onToast?.(err.message || "No se pudo añadir esa playlist");
    } finally {
      setLinkBusy(false);
    }
  }

  // The room's id of a saved one, to tell whether it is already in the room.
  const roomIdOf = (item) => `sp:${item.kind === "album" ? `album:${item.id}` : item.id}`;

  async function toggleSaved() {
    if (savedOpen) {
      setSavedOpen(false);
      return;
    }
    setLinkOpen(false);
    setSavedOpen(true);
    setConfirmForget("");
    try {
      setSaved((await listSavedSpotify()).saved);
    } catch (err) {
      onToast?.(err.message || "No se pudieron cargar tus playlists");
    }
  }

  async function addSaved(item) {
    if (savedBusy) return;
    setSavedBusy(item.key);
    try {
      const list = await addSpotifyLink(`spotify:${item.kind}:${item.id}`);
      if (list) setSaved(list);
    } catch (err) {
      onToast?.(err.message || "No se pudo agregar");
    } finally {
      setSavedBusy("");
    }
  }

  async function forgetSaved(item) {
    if (confirmForget !== item.key) {
      setConfirmForget(item.key);
      return;
    }
    setConfirmForget("");
    try {
      setSaved(await forgetSavedSpotify(item.key));
    } catch (err) {
      onToast?.(err.message || "No se pudo borrar");
    }
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
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({
        playlistIds: next.playlistIds ?? selected,
        rounds: next.rounds || rounds,
        roundMs: next.roundMs || seconds * 1000,
        formats: next.formats ?? formats,
      });
    } catch (err) {
      setDraft(room.config);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  // "Modos": closed rounds (four songs to choose from) and open ones (the title typed); both by default.
  const formats = draft?.formats ?? FORMAT_IDS;
  function toggleFormat(id) {
    const on = formats.includes(id);
    save({ formats: FORMAT_IDS.filter((f) => (f === id ? !on : formats.includes(f))) });
  }

  function togglePlaylist(id) {
    if (selected.includes(id)) {
      save({ playlistIds: selected.filter((x) => x !== id) });
    } else {
      save({ playlistIds: [...selected, id] });
    }
  }

  const listOptions = [
    // "Most Streamed Songs on Spotify · Español" shows as "Top 500 Español"; the full name is the tooltip.
    ...playlists.map((p) => ({ value: p.id, label: playlistLabel(p), title: p.name })),
    // Spotify playlists keep their own name, cut short when it's long; the full name is the tooltip.
    ...chosenCustom.map((p) => ({
      value: p.id,
      label: p.name.length > 30 ? `${p.name.slice(0, 28).trimEnd()}…` : p.name,
      title: `${p.name} · ${p.ready} de ${p.total} canciones listas`,
    })),
  ];

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      <OptionRow
        label="Modos de juego"
        multi
        wrap
        options={FORMATS.map((f) => ({ value: f.id, label: f.label, title: f.id === "opciones" ? "Elige la canción entre cuatro" : "Escribe el título" }))}
        value={formats}
        onChange={toggleFormat}
        onSetAll={(list) => save({ formats: list })}
      />
      <OptionRow
        label="Canciones"
        multi
        wrap
        options={listOptions}
        value={selected}
        onChange={togglePlaylist}
        onSetAll={(playlistIds) => save({ playlistIds })}
      >
        {isOwnerEditor &&
          spotifyOpen &&
          (spotifyLists || [])
            .filter((p) => !selected.includes(`sp:${p.id}`))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="tv-optrow-btn is-spotify"
                aria-pressed={false}
                title={`${p.name} · ${p.total} canciones`}
                disabled={Boolean(spotifyBusy)}
                onClick={() => addSpotify(p.id)}
              >
                {spotifyBusy === p.id ? "Añadiendo…" : p.name}
              </button>
            ))}
        {!readOnly && hasAccount && (
          <button
            type="button"
            className="tv-optrow-btn is-add"
            onClick={toggleSaved}
            aria-expanded={savedOpen}
            title="Las playlists y álbumes que agregaste antes"
          >
            <Icon name={savedOpen ? "close" : "plus"} size={16} strokeWidth={3} />
            {savedOpen ? "Cerrar" : "Mis playlists"}
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            className="tv-optrow-btn is-add"
            onClick={() => {
              setSavedOpen(false);
              setLinkOpen((v) => !v);
            }}
            aria-expanded={linkOpen}
            title="Agregar una playlist pública o un álbum de Spotify con su link"
          >
            {linkOpen ? <Icon name="close" size={16} strokeWidth={3} /> : <SpotifyIcon size={18} />}
            {linkOpen ? "Cancelar" : "Agregar de Spotify"}
          </button>
        )}
        {isOwnerEditor && (
          <button
            type="button"
            className="tv-optrow-btn is-add"
            onClick={onPlus}
            disabled={spotifyBusy === "list"}
            aria-expanded={spotifyLinked ? spotifyOpen : askLink}
            aria-label={spotifyOpen ? "Ocultar tus playlists de Spotify" : "Añadir tus playlists de Spotify"}
            title="Tus playlists de Spotify"
          >
            {spotifyOpen ? <Icon name="close" size={16} strokeWidth={3} /> : <SpotifyIcon size={18} />}
            {spotifyBusy === "list" ? "Cargando…" : spotifyOpen ? "Ocultar" : "Spotify"}
          </button>
        )}
      </OptionRow>
      {!readOnly && linkOpen && (
        <form className="tv-spotify-link" onSubmit={onAddLink} onKeyDown={(e) => e.key === "Escape" && setLinkOpen(false)}>
          {/* Like the game's answer box: one field with the icon in it and the send button at its end. */}
          <div className="tv-spotify-link-box">
            <SpotifyIcon size={20} />
            <input
              className="tv-spotify-link-input"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Pega el link de una playlist o álbum"
              aria-label="Link de una playlist o un álbum de Spotify"
              disabled={linkBusy}
              autoFocus
            />
            {/* An arrow up to send it, and a spinner while Spotify is read. */}
            <button
              type="submit"
              className="tv-btn tv-btn--sm tv-c-music tv-spotify-link-send"
              disabled={linkBusy || !link.trim()}
              aria-label={linkBusy ? "Leyendo de Spotify" : "Agregar de Spotify"}
              aria-busy={linkBusy}
            >
              {linkBusy ? <span className="tv-spinner" aria-hidden="true" /> : <Icon name="upload" size={20} strokeWidth={3} />}
            </button>
          </div>
          <small className="tv-spotify-link-hint">Una playlist pública o un álbum. Se usan sus primeras 100 canciones.</small>
        </form>
      )}
      {!readOnly && hasAccount && savedOpen && (
        <section className="tv-saved" aria-label="Mis playlists">
          {saved === null ? (
            <p className="tv-saved-empty">Cargando…</p>
          ) : saved.length === 0 ? (
            <p className="tv-saved-empty">
              Aún no tienes playlists guardadas. Las que agregues con su link se guardan aquí, en tu cuenta.
            </p>
          ) : (
            <ul className="tv-saved-list">
              {saved.map((item) => {
                const inRoom = custom.some((p) => p.id === roomIdOf(item));
                const asking = confirmForget === item.key;
                return (
                  <li key={item.key} className="tv-saved-item">
                    <SavedCover src={item.image} />
                    <span className="tv-saved-text">
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind === "album" ? "Álbum" : "Playlist"}
                        {item.total ? ` · ${item.total} canciones` : ""}
                      </small>
                    </span>
                    <button
                      type="button"
                      className={`tv-saved-forget${asking ? " is-asking" : ""}`}
                      onClick={() => forgetSaved(item)}
                      onBlur={() => asking && setConfirmForget("")}
                      aria-label={asking ? `Confirmar: borrar ${item.name}` : `Borrar ${item.name} de tus playlists`}
                      title="Borrar de tus playlists"
                    >
                      {asking ? "¿Borrar?" : <Icon name="trash" size={18} strokeWidth={2.4} />}
                    </button>
                    <button
                      type="button"
                      className="tv-btn tv-btn--sm tv-c-music tv-saved-add"
                      onClick={() => addSaved(item)}
                      disabled={inRoom || Boolean(savedBusy)}
                      aria-label={inRoom ? `${item.name} ya está en la sala` : `Agregar ${item.name}`}
                      aria-busy={savedBusy === item.key}
                    >
                      {savedBusy === item.key ? (
                        <span className="tv-spinner" aria-hidden="true" />
                      ) : inRoom ? (
                        <Icon name="check" size={18} strokeWidth={3} />
                      ) : (
                        <Icon name="plus" size={18} strokeWidth={3} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {isOwnerEditor && askLink && !spotifyLinked && (
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
      {isOwnerEditor && spotifyOpen && spotifyLists?.length === 0 && (
        <p className="tv-playlist-total">No encontramos playlists en tu Spotify.</p>
      )}
      {!hasCustom && selected.length > 0 && playlists.length > 0 && songCount < rounds && (
        <p className="tv-playlist-total is-short" role="alert">
          <Icon name="lock" size={16} strokeWidth={2.6} />
          <span>
            Necesitas al menos <strong>{rounds} canciones</strong> (tienes {songCount})
          </span>
        </p>
      )}

      <OptionRow label="Rondas" options={rangeOptions(ROUNDS)} value={rounds} onChange={(n) => save({ rounds: n })} />
      <OptionRow
        label="Segundos por ronda"
        options={rangeOptions(SECONDS)}
        value={seconds}
        onChange={(n) => save({ roundMs: n * 1000 })}
      />

      {children}
    </fieldset>
  );
}

// A saved playlist's or album's cover, or the Spotify icon when there is none or it doesn't load.
function SavedCover({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <SpotifyIcon size={40} />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
