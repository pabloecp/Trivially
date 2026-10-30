import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/home/Icon.jsx";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SettingsSection from "../../components/home/SettingsSection.jsx";
import SettingsTabs from "../../components/home/SettingsTabs.jsx";
import SpotifyIcon from "../../components/home/SpotifyIcon.jsx";
import { FORMATS, LEVELS } from "../quiz/quizInfo.js";
import { useApp } from "../../lib/store.jsx";
import { forgetLocalSpotify, loadLocalSpotify, saveLocalSpotify } from "../../lib/localSpotify.js";
import { withSound } from "../../lib/sounds.js";

const FORMAT_IDS = FORMATS.map((f) => f.id);
// Its "Modos de juego" (MUSIC_STYLES on the server): guess the title, or the words that come next in the song (only
// the songs with their verse ready). A new room plays only the title.
const STYLES = [
  { id: "titulo", label: "Título", hint: "Adivina qué canción es" },
  { id: "letra", label: "Letra", hint: "Di lo que sigue en la canción" },
];
const STYLE_IDS = STYLES.map((s) => s.id);
// The catalog's filters (SONG_LANGUAGES, SONG_GENRES and SONG_DIFFICULTIES on the server).
const LANGUAGES = [
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
];
const GENRES = [
  { id: "pop", label: "Pop" },
  { id: "urbano", label: "Reguetón & Urbano" },
  { id: "rock", label: "Rock" },
  { id: "mexicana", label: "Regional mexicano" },
  { id: "hiphop", label: "Hip-Hop & Rap" },
  { id: "electronica", label: "Electrónica" },
];
const FILTERS = { languages: LANGUAGES, genres: GENRES, difficulties: LEVELS };
// The Spotify playlists every room offers in "Tus playlists" (DEFAULT_SPOTIFY on the server): always listed first,
// they can't be deleted, and the server keeps them loaded in every room (read once a day), so ticking one is instant.
const DEFAULT_PLAYLISTS = [{ kind: "playlist", id: "37i9dQZEVXbMDoHDwVN2tF", name: "Top 50: Global" }];
const defaultRoomId = (p) => `sp:${p.kind === "album" ? `album:${p.id}` : p.id}`;
const DEFAULT_IDS = new Set(DEFAULT_PLAYLISTS.map(defaultRoomId));

// Rounds and seconds go in steps of 5. The server keeps the same limits (roomManager.updateConfig).
const ROUNDS = { min: 5, max: 25, step: 5 };
const SECONDS = { min: 15, max: 35, step: 5 };

function configKey(config) {
  return JSON.stringify([
    config?.playlistIds || [],
    config?.rounds,
    config?.roundMs,
    config?.formats,
    config?.styles,
    config?.useCatalog,
    config?.languages,
    config?.genres,
    config?.difficulties,
  ]);
}

// The match settings, in the settings panel, in two tabs (SettingsTabs, like every game's) so each fits without
// scrolling: "Partida" (the ways of answering, rounds, seconds) and "Canciones", itself split in "Catálogo" (a switch
// and its filters: language, genre, difficulty) and "Tus playlists" (the Spotify ones, which play whole and add to the
// catalog). Every tap is saved straight away for the whole room; the local copy only keeps the tap visible until the
// server's new state arrives. `children` go at the bottom, under the tabs.
// With `readOnly` (players without permission to change them) everything shows but nothing can be tapped.
// `spotify={false}`: a game of a playlist of games. Everything works the same (the default, saved and own playlists,
// pasting a link, the bin), but what is ticked or added is ticked in that game's settings (playlistIds of the item);
// adding one also puts it in the room, since that's where its songs are read.
export default function MusicSettings({ room, updateConfig, onToast, children, readOnly = false, spotify = true }) {
  const { user, listSpotifyPlaylists, addSpotifyPlaylist, addSpotifyLink, listSavedSpotify, forgetSavedSpotify, removePlaylist } =
    useApp();
  // Spotify playlists already added to the room.
  const custom = room.customPlaylists || [];
  // Among those who may change the settings (the host or a player with permission), owners also see their own
  // Spotify playlists in "Tus playlists" (when their Spotify is connected).
  const isOwnerEditor = !readOnly && user?.role === "owner";
  const inItem = !spotify;
  const spotifyLinked = Boolean(user?.spotify);
  const [spotifyLists, setSpotifyLists] = useState(null);
  const [spotifyBusy, setSpotifyBusy] = useState("");
  // A public Spotify playlist pasted as a link (anyone who may change the settings, no Spotify account needed).
  // It is a button among the playlists that opens the box to paste the link; once added, the playlist is one more
  // option of the row, with its tick box.
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  // What this account added with a link before, kept on its profile (guests have none), always listed: each one is
  // ticked or unticked with one tap, or deleted for good (two taps).
  const hasAccount = Boolean(user && !user.isGuest);
  const [saved, setSaved] = useState(null);
  const [savedBusy, setSavedBusy] = useState("");
  const [confirmForget, setConfirmForget] = useState("");
  const [draft, setDraft] = useState(room.config);
  const counts = room.songCounts || { languages: {}, genres: {}, difficulties: {} };

  // The list is always open, so it loads straight away (and the owner's own Spotify playlists with it).
  useEffect(() => {
    if (readOnly) return;
    // A guest's are kept in this browser only (the server keeps nothing for guests).
    if (!hasAccount) {
      setSaved(loadLocalSpotify());
      return;
    }
    let gone = false;
    listSavedSpotify()
      .then((res) => !gone && setSaved(res.saved))
      .catch(() => !gone && setSaved([]));
    if (isOwnerEditor && spotifyLinked) showSpotifyPlaylists();
    return () => {
      gone = true;
    };
  }, [user?.id, readOnly]);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(room.config);
  }, [configKey(room.config)]);

  // The room's id of a saved one, to tell whether it is already in the room.
  const roomIdOf = (item) => `sp:${item.kind === "album" ? `album:${item.id}` : item.id}`;
  // The ticked Spotify playlists (only those show).
  const selected = (draft?.playlistIds || []).filter((id) => custom.some((p) => p.id === id));
  const chosenCustom = custom.filter((p) => selected.includes(p.id));
  const rounds = draft?.rounds || 5;
  const seconds = Math.round((draft?.roundMs || 15000) / 1000);
  // A list missing (an older room) means everything ticked.
  const listOf = (key) => draft?.[key] ?? FILTERS[key].map((o) => o.id);
  // The catalog's switch; missing (an older room) means on.
  const useCatalog = draft?.useCatalog !== false;

  async function onAddLink(event) {
    event.preventDefault();
    if (!link.trim() || linkBusy) return;
    setLinkBusy(true);
    try {
      const { saved: list, added, playlist } = await withSound(() => addSpotifyLink(link.trim()));
      if (added) await tickInItem(added);
      if (!hasAccount) setSaved(saveLocalSpotify(playlist));
      else if (list) setSaved(list);
      setLink("");
      setLinkOpen(false);
    } catch (err) {
      onToast?.(err.message || "No se pudo añadir esa playlist");
    } finally {
      setLinkBusy(false);
    }
  }

  // A default playlist: ticking it reads it again from Spotify (as its link; that also puts it in the room), unticking
  // only unticks it. In a game of a playlist of games it is then ticked in that game's settings (tickInItem).
  async function toggleDefault(p) {
    const roomId = defaultRoomId(p);
    if (selected.includes(roomId)) return togglePlaylist(roomId);
    // The server keeps it loaded in every room (read once a day): ticking it is instant.
    if (custom.some((c) => c.id === roomId)) return togglePlaylist(roomId);
    if (savedBusy) return;
    setSavedBusy(`default:${p.id}`);
    try {
      await addSpotifyLink(`spotify:${p.kind}:${p.id}`);
      await tickInItem(roomId);
    } catch (err) {
      onToast?.(err.message || "No se pudo leer la playlist de Spotify");
    } finally {
      setSavedBusy("");
    }
  }

  // In a game of a playlist of games, something just added to the room is ticked in that game too (in the room's own
  // settings the server already ticked it).
  async function tickInItem(roomId) {
    if (!inItem || !roomId) return;
    await save({ useCatalog: false, playlistIds: [...selected.filter((id) => id !== roomId), roomId] });
  }

  async function addSaved(item) {
    if (savedBusy) return;
    // Already in the room: it only needs ticking or unticking.
    const roomId = roomIdOf(item);
    if (custom.some((p) => p.id === roomId)) return togglePlaylist(roomId);
    setSavedBusy(item.key);
    try {
      const { saved: list } = await addSpotifyLink(`spotify:${item.kind}:${item.id}`);
      await tickInItem(roomId);
      if (list) setSaved(list);
    } catch (err) {
      onToast?.(err.message || "No se pudo agregar");
    } finally {
      setSavedBusy("");
    }
  }

  // The bin, tapped twice: takes the playlist out of the room and, when it's saved, off the account too.
  async function deleteRow(row) {
    if (confirmForget !== row.key) {
      setConfirmForget(row.key);
      return;
    }
    setConfirmForget("");
    try {
      if (row.inRoom) await removePlaylist(row.key);
      if (row.savedItem) setSaved(hasAccount ? await forgetSavedSpotify(row.savedItem.key) : forgetLocalSpotify(row.savedItem.key));
    } catch (err) {
      onToast?.(err.message || "No se pudo borrar");
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
    if (savedBusy) return;
    // Already in the room: it only needs ticking or unticking.
    if (custom.some((c) => c.id === `sp:${id}`)) return togglePlaylist(`sp:${id}`);
    setSavedBusy(`own:${id}`);
    try {
      await addSpotifyPlaylist(id);
      await tickInItem(`sp:${id}`);
    } catch (err) {
      onToast?.(err.message || "No se pudo añadir la playlist");
    } finally {
      setSavedBusy("");
    }
  }

  // The owner's own Spotify playlists, minus the ones already among the saved ones.
  const ownLists = isOwnerEditor && spotifyLinked
    ? (spotifyLists || []).filter((p) => !(saved || []).some((s) => s.kind !== "album" && s.id === p.id))
    : [];

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
        styles: next.styles ?? styles,
        useCatalog: next.useCatalog ?? useCatalog,
        languages: next.languages ?? listOf("languages"),
        genres: next.genres ?? listOf("genres"),
        difficulties: next.difficulties ?? listOf("difficulties"),
      });
    } catch (err) {
      setDraft(room.config);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  // A filter's chip: one without songs with the other filters can't be ticked (but can be unticked).
  function filterRow(key, label, hint) {
    const list = listOf(key);
    return (
      <OptionRow
        label={label}
        hint={hint}
        multi
        wrap
        options={FILTERS[key].map((o) => ({
          value: o.id,
          label: o.label,
          disabled: room.songCounts && !counts[key]?.[o.id] && !list.includes(o.id),
        }))}
        value={list}
        onChange={(id) => save({ [key]: FILTERS[key].map((o) => o.id).filter((v) => (v === id ? !list.includes(id) : list.includes(v))) })}
        onSetAll={(all) => save({ [key]: all })}
      />
    );
  }

  // "Tipo de respuestas": closed rounds (four songs to choose from) and open ones (the title typed); both by default.
  const formats = draft?.formats ?? FORMAT_IDS;
  function toggleFormat(id) {
    const on = formats.includes(id);
    save({ formats: FORMAT_IDS.filter((f) => (f === id ? !on : formats.includes(f))) });
  }

  // "Modos de juego": a missing list (an older room) means only the title. Completa la letra can't be ticked when none
  // of the songs that play has its verse (but can be unticked).
  const styles = draft?.styles ?? ["titulo"];
  function toggleStyle(id) {
    const on = styles.includes(id);
    save({ styles: STYLE_IDS.filter((s) => (s === id ? !on : styles.includes(s))) });
  }
  // Its songs come prepared (backend/private/lyric-rounds.json, or the lyric_rounds table): it can't be ticked when
  // none of the songs that play has its round (but can be unticked).
  const noLyrics = room.lyricsReady === 0;
  const lyricsNote =
    styles.includes("letra") && room.lyricsReady != null
      ? `${room.lyricsReady} ${room.lyricsReady === 1 ? "canción tiene" : "canciones tienen"} su letra lista`
      : null;
  const lyricsOnly = styles.length === 1 && styles[0] === "letra";

  function togglePlaylist(id) {
    if (selected.includes(id)) {
      save({ playlistIds: selected.filter((x) => x !== id) });
    } else {
      // Ticking one (the +) switches Trivially's catalog off, as adding one does; it can be switched on again.
      save({ useCatalog: false, playlistIds: [...selected, id] });
    }
  }

  // "Tus playlists": one list, each row with its cover, name and songs. The ticked ones go first and stand out (tinted,
  // ringed, "En la partida"); then the rest of the room's, then the
  // account's saved ones and the owner's own Spotify ones not in the room yet. The + adds or ticks one, the ✓ unticks
  // it, and the bin (two taps) deletes one added to the room or saved on the account. Players without permission only see the ticked ones.
  const savedOf = (roomId) => (saved || []).find((item) => roomIdOf(item) === roomId);
  const inRoomIds = new Set(custom.map((p) => p.id));
  const rows = readOnly
    ? chosenCustom.map((p) => ({ key: p.id, image: p.image, name: p.name, kind: p.id.startsWith("sp:album:") ? "album" : "playlist", total: p.total }))
    : [
        ...DEFAULT_PLAYLISTS.map((p) => {
          const inRoom = custom.find((c) => c.id === defaultRoomId(p));
          return {
            key: defaultRoomId(p),
            busyKey: `default:${p.id}`,
            image: inRoom?.image || null,
            name: inRoom?.name || p.name,
            kind: p.kind,
            total: inRoom?.total,
            on: selected.includes(defaultRoomId(p)),
            fixed: true,
            onToggle: () => toggleDefault(p),
          };
        }),
        ...custom.filter((p) => !DEFAULT_IDS.has(p.id)).map((p) => ({
          key: p.id,
          image: p.image,
          name: p.name,
          kind: p.id.startsWith("sp:album:") ? "album" : "playlist",
          total: p.total,
          on: selected.includes(p.id),
          inRoom: true,
          onToggle: () => togglePlaylist(p.id),
          savedItem: savedOf(p.id),
        })),
        ...(saved || [])
          .filter((item) => !inRoomIds.has(roomIdOf(item)) && !DEFAULT_IDS.has(roomIdOf(item)))
          .map((item) => ({ key: roomIdOf(item), busyKey: item.key, image: item.image, name: item.name, kind: item.kind, total: item.total, onToggle: () => addSaved(item), savedItem: item })),
        ...ownLists
          .filter((p) => !inRoomIds.has(`sp:${p.id}`))
          .map((p) => ({ key: `sp:${p.id}`, busyKey: `own:${p.id}`, image: p.image, name: p.name, kind: "spotify", total: p.total, onToggle: () => addSpotify(p.id) })),
      ].sort((a, b) => Number(Boolean(b.fixed)) - Number(Boolean(a.fixed)) || Number(Boolean(b.on)) - Number(Boolean(a.on)));

  function playlistRow(row) {
    const asking = confirmForget === row.key;
    const busy = row.busyKey && savedBusy === row.busyKey;
    return (
      <li key={row.key} className={`tv-saved-item${row.on ? " is-on" : ""}`}>
        <SavedCover src={row.image} />
        <span className="tv-saved-text">
          <strong>{row.name}</strong>
          <small>
            {row.on && <span className="tv-saved-on">En la partida · </span>}
            {row.fixed ? "Spotify" : row.kind === "album" ? "Álbum" : row.kind === "spotify" ? "Tu Spotify" : "Playlist"}
            {row.total ? ` · ${row.total} canciones` : ""}
          </small>
        </span>
        {!readOnly && !row.fixed && (row.inRoom || row.savedItem) && (
          <button
            type="button"
            className={`tv-saved-forget${asking ? " is-asking" : ""}`}
            onClick={() => deleteRow(row)}
            onBlur={() => asking && setConfirmForget("")}
            aria-label={asking ? `Confirmar: borrar ${row.name}` : `Borrar ${row.name}`}
          >
            {asking ? "¿Borrar?" : <Icon name="trash" size={18} strokeWidth={2.4} />}
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            className={`tv-btn tv-btn--sm tv-c-music tv-saved-add${row.on ? "" : " is-off"}`}
            onClick={row.onToggle}
            disabled={Boolean(savedBusy)}
            aria-pressed={Boolean(row.on)}
            aria-label={row.on ? `Quitar ${row.name} de la partida` : `Agregar ${row.name}`}
            aria-busy={busy}
          >
            {busy ? (
              <span className="tv-spinner" aria-hidden="true" />
            ) : row.on ? (
              <Icon name="check" size={18} strokeWidth={3} />
            ) : (
              <Icon name="plus" size={18} strokeWidth={3} />
            )}
          </button>
        )}
      </li>
    );
  }

  const songsReady = room.songsReady;
  const showPlaylists = !readOnly || rows.length > 0;

  const catalog = (
    // Its on/off switch is on the "Catálogo" tab itself (below), so it takes no row of its own.
    <SettingsSection sub off={!useCatalog}>
      {filterRow("languages", "Idioma")}
      {filterRow("genres", "Género")}
      {filterRow("difficulties", "Dificultad")}
    </SettingsSection>
  );

  const playlists = (
    <>
      {/* "Agregar de Spotify" and the box to paste the link are the same place: the button turns into the box, with an
          X at its end to close it again. */}
      {!readOnly && !linkOpen && (
        <div className="tv-optrow-opts is-wrap">
          <button type="button" className="tv-optrow-btn is-add tv-spotify-open" onClick={() => setLinkOpen(true)} aria-expanded={false}>
            <SpotifyIcon size={18} />
            Agregar de Spotify
          </button>
        </div>
      )}
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
              placeholder="Link de playlist o álbum"
              aria-label="Link de una playlist o un álbum de Spotify"
              disabled={linkBusy}
              autoFocus
            />
            {/* An arrow up to send it, and a spinner while Spotify is read. */}
            <button
              type="submit"
              className="tv-btn tv-btn--sm tv-c-music tv-spotify-link-send"
              data-sound="none"
              disabled={linkBusy || !link.trim()}
              aria-label={linkBusy ? "Leyendo de Spotify" : "Agregar de Spotify"}
              aria-busy={linkBusy}
            >
              {linkBusy ? <span className="tv-spinner" aria-hidden="true" /> : <Icon name="upload" size={20} strokeWidth={3} />}
            </button>
            <button
              type="button"
              className="tv-spotify-link-close"
              data-sound="back"
              onClick={() => {
                setLinkOpen(false);
                setLink("");
              }}
              disabled={linkBusy}
              aria-label="Cancelar"
            >
              <Icon name="close" size={18} strokeWidth={3} />
            </button>
          </div>
        </form>
      )}
      {!readOnly && linkOpen && (
        <div className="tv-note tv-spotify-note">
          {/* One text beside the icon (centred against all of it); without an account, its last line says how to keep
              the playlists. */}
          <Icon name="info" size={16} strokeWidth={2.6} />
          <p className="tv-note-text">
            <span>La playlist tiene que ser pública.</span> <span>Se usan hasta 100 canciones.</span>
            {!hasAccount && (
              <span className="tv-note-account">
                <Link to="/login">Crear cuenta</Link> o <Link to="/login?mode=login">Iniciar sesión</Link> para guardarla.
              </span>
            )}
          </p>
        </div>
      )}
      {(rows.length > 0 || (!readOnly && hasAccount)) && (
        <section className="tv-saved" aria-label="Tus playlists">
          {rows.length > 0 && <ul className="tv-saved-list">{rows.map(playlistRow)}</ul>}
          {!readOnly && hasAccount && saved === null && <p className="tv-saved-empty">Cargando…</p>}
          {!readOnly && rows.length === 0 && saved !== null && <p className="tv-saved-empty">Aún no tienes playlists guardadas.</p>}
          {isOwnerEditor && spotifyLinked && spotifyBusy === "list" && <p className="tv-saved-empty">Cargando tus playlists de Spotify…</p>}
        </section>
      )}
    </>
  );

  return (
    <SettingsTabs
      readOnly={readOnly}
      storageKey="musica"
      tabs={[
        {
          id: "partida",
          label: "Partida",
          icon: "hourglass",
          note: `${lyricsOnly ? "Letra · " : ""}${rounds} rondas · ${seconds} s`,
          alert: !formats.length || !styles.length,
          content: (
            <>
              <OptionRow
                label="Modos de juego"
                multi
                wrap
                options={STYLES.map((s) => ({
                  value: s.id,
                  label: s.label,
                  title: s.id === "letra" && noLyrics ? "No hay canciones con su letra lista" : s.hint,
                  disabled: s.id === "letra" && noLyrics && !styles.includes(s.id),
                }))}
                value={styles}
                onChange={toggleStyle}
                onSetAll={(list) => save({ styles: list })}
              />
              {lyricsNote && (
                <p className="tv-note tv-lyrics-note">
                  <span className="tv-note-text">{lyricsNote}</span>
                </p>
              )}
              <OptionRow
                label="Tipo de respuestas"
                multi
                wrap
                options={FORMATS.map((f) => ({
                  value: f.id,
                  label: f.label,
                  title: f.id === "opciones" ? "Elige entre cuatro opciones" : lyricsOnly ? "Escribe lo que falta" : "Escribe el título",
                }))}
                value={formats}
                onChange={toggleFormat}
                onSetAll={(list) => save({ formats: list })}
              />
              <OptionRow label="Rondas" options={rangeOptions(ROUNDS)} value={rounds} onChange={(n) => save({ rounds: n })} />
              <OptionRow
                label="Segundos por ronda"
                options={rangeOptions(SECONDS)}
                value={seconds}
                onChange={(n) => save({ roundMs: n * 1000 })}
              />
            </>
          ),
        },
        {
          id: "canciones",
          label: "Canciones",
          icon: "music",
          note: songsReady != null ? `${songsReady} ${songsReady === 1 ? "canción" : "canciones"}` : null,
          alert: songsReady === 0 && !chosenCustom.some((p) => p.loading),
          content: catalog,
          sub: showPlaylists && [
            {
              id: "catalogo",
              label: "Catálogo",
              content: catalog,
              toggle: { on: useCatalog, onChange: (on) => save({ useCatalog: on }), label: "Usar el catálogo de Trivially", disabled: readOnly },
            },
            {
              id: "playlists",
              label: "Tus playlists",
              note: selected.length ? String(selected.length) : null,
              content: playlists,
            },
          ],
        },
      ]}
    >
      {children}
    </SettingsTabs>
  );
}

// A saved playlist's or album's cover, or the Spotify icon when there is none or it doesn't load.
function SavedCover({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <SpotifyIcon size={40} />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
