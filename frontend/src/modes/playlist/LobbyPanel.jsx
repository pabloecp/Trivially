import { useEffect, useRef, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useStartGame } from "../../components/home/ModeStart.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import ItemSettings from "./ItemSettings.jsx";
import {
  MAX_ITEMS,
  NAME_MAX,
  defaultItemConfig,
  downloadPlaylist,
  fromLibrary,
  itemSummary,
  loadLibrary,
  newItemId,
  parsePlaylistJson,
  playlistGames,
  removeFromLibrary,
  saveToLibrary,
  toShareJson,
} from "./playlistInfo.js";
import "../../styles/home.css";
import "../../styles/playlist.css";

const EMPTY = { name: "Mi playlist", order: "orden", items: [] };
// Chosen in the playlist and used when it starts: each game whole, as listed; or one match with every game's rounds
// mixed at random.
const ORDERS = [
  { id: "orden", label: "En orden", icon: "list", hint: "Cada juego entero, en el orden de la lista" },
  { id: "aleatorio", label: "Aleatorio", icon: "shuffle", hint: "Las rondas de todos los juegos, mezcladas al azar" },
];

const gamesText = (n) => `${n} ${n === 1 ? "juego" : "juegos"}`;

// The "Playlist" panel of the room screen, shown once the host picks it on the menu: on the card, the playlist's name
// and its games in order (add, move, copy or take out each one; tap one to see its settings), the order it's played in
// and the start button; beside it, the chosen game's settings (each game's own panel, fed with that game's settings),
// and how to share it (its JSON, copied, downloaded or imported) and keep it ("Mis playlists", in this browser).
// The host and whoever has the permission change it, and every change reaches the whole room; the rest see it locked.
export default function LobbyPanel({ room, onToast }) {
  const { user, catalog, updatePlaylist } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const mode = findMode("playlist");
  const saved = room.playlist || EMPTY;
  const savedKey = JSON.stringify(saved);
  // The playlist as this player last changed it, until the server's comes back (or another editor's arrives).
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [savedKey]);
  const [name, setName] = useState(saved.name);
  useEffect(() => setName(saved.name), [saved.name]);
  const [selectedId, setSelectedId] = useState(saved.items[0]?.id || null);
  const [adding, setAdding] = useState(false);

  const items = draft.items;
  const found = items.findIndex((i) => i.id === selectedId);
  const selectedIndex = found >= 0 ? found : 0;
  const selected = items[selectedIndex] || null;
  const status = room.playlistStatus || {};
  const full = items.length >= MAX_ITEMS;

  // Saves the whole playlist. If the server refuses, the last saved one comes back and the error is thrown.
  async function save(next) {
    setDraft(next);
    try {
      await updatePlaylist(next);
    } catch (err) {
      setDraft(saved);
      throw err;
    }
  }
  const commit = (next) => save(next).catch((err) => onToast?.(err.message || "No se pudo guardar la playlist"));

  function addGame(game) {
    if (full) return;
    const item = { id: newItemId(), game, config: defaultItemConfig(game, catalog) };
    setSelectedId(item.id);
    setAdding(false);
    commit({ ...draft, items: [...items, item] });
  }

  function move(index, by) {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    commit({ ...draft, items: next });
  }

  // The same game with the same settings, right after it (to play it again, or to change only a few of them).
  function duplicate(index) {
    if (full) return;
    const copy = { ...items[index], id: newItemId(), config: structuredClone(items[index].config) };
    const next = [...items];
    next.splice(index + 1, 0, copy);
    setSelectedId(copy.id);
    commit({ ...draft, items: next });
  }

  // The small button by the playlist's name: the games in another order, at random (for "En orden" without having to
  // choose it). Never the same order it had.
  function reshuffle() {
    if (items.length < 2) return;
    let next;
    do {
      next = [...items];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    } while (next.every((item, i) => item.id === items[i].id));
    commit({ ...draft, items: next });
  }

  function remove(index) {
    const next = items.filter((_, i) => i !== index);
    if (items[index].id === selected?.id) setSelectedId(next[Math.min(index, next.length - 1)]?.id || null);
    commit({ ...draft, items: next });
  }

  function saveName() {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) setName(draft.name);
    else if (clean !== draft.name) commit({ ...draft, name: clean });
  }

  function replaceWith(playlist) {
    setSelectedId(playlist.items[0]?.id || null);
    return save(playlist);
  }

  const setItemConfig = (id, config) => save({ ...draft, items: items.map((i) => (i.id === id ? { ...i, config } : i)) });

  // Why it can't start yet, for everyone to see: no games, or the first game whose settings can't be played.
  const blockedAt = items.findIndex((i) => status[i.id]?.problem);
  const blocked = !items.length
    ? "Añade al menos un juego para empezar."
    : blockedAt >= 0
    ? `Revisa el juego ${blockedAt + 1}, ${findMode(items[blockedAt].game)?.name}: ${status[items[blockedAt].id].problem}`
    : null;

  return (
    <>
      <section className={`tv-mstage tv-c-${mode.color} tv-pl-stage`} aria-label={mode.name}>
        <Icon name={mode.icon} size={360} strokeWidth={1.2} className="tv-mstage-watermark" />
        <div className="tv-mstage-head tv-pl-head">
          <div className="tv-mstage-badges">
            <span className="tv-mstage-badge">
              <Icon name={mode.icon} size={32} strokeWidth={2.2} />
            </span>
            <span className="tv-pl-kicker">
              Playlist · {gamesText(items.length)}
            </span>
            {canEdit && draft.order === "orden" && items.length > 1 && (
              <button
                type="button"
                className="tv-pl-reorder"
                aria-label="Reordenar los juegos al azar"
                title="Reordenar al azar"
                onClick={reshuffle}
              >
                <Icon name="reorder" size={18} strokeWidth={2.6} />
              </button>
            )}
          </div>
          {canEdit ? (
            <input
              className="tv-pl-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label="Nombre de la playlist"
              spellCheck={false}
            />
          ) : (
            <h2 className="tv-pl-name">{draft.name}</h2>
          )}
        </div>

        <div className="tv-pl-body">
          {items.length === 0 ? (
            <p className="tv-pl-empty">
              {canEdit
                ? "Añade los juegos que quieras, en el orden en que se juegan. Puedes repetir un juego con otros ajustes."
                : `${room.hostName || "El anfitrión"} está preparando la playlist.`}
            </p>
          ) : (
            <ol className="tv-pl-list" aria-label="Juegos de la playlist">
              {items.map((item, i) => {
                const game = findMode(item.game);
                const problem = status[item.id]?.problem;
                return (
                  <li
                    key={item.id}
                    className={`tv-pl-item tv-c-${game?.color || "neutral"}${item.id === selected?.id ? " is-selected" : ""}${problem ? " has-problem" : ""}`}
                    style={{ "--i": i }}
                  >
                    <button
                      type="button"
                      className="tv-pl-item-main"
                      aria-pressed={item.id === selected?.id}
                      onClick={() => setSelectedId(item.id)}
                      title={problem || "Ver sus ajustes"}
                    >
                      <span className="tv-pl-num">{i + 1}</span>
                      <span className={`tv-pl-badge tv-c-${game?.color || "neutral"}`}>
                        <Icon name={game?.icon || "play"} size={20} strokeWidth={2.4} />
                      </span>
                      <span className="tv-pl-text">
                        <span className="tv-pl-game">{game?.name || item.game}</span>
                        <span className="tv-pl-sum">{itemSummary(item, catalog)}</span>
                      </span>
                      {problem && <Icon name="info" size={20} strokeWidth={2.6} className="tv-pl-warn" />}
                    </button>
                    {canEdit && (
                      <span className="tv-pl-tools">
                        <button type="button" className="tv-pl-tool" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                          <Icon name="chevron" size={18} strokeWidth={3} className="is-up" />
                        </button>
                        <button
                          type="button"
                          className="tv-pl-tool"
                          aria-label="Bajar"
                          disabled={i === items.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <Icon name="chevron" size={18} strokeWidth={3} className="is-down" />
                        </button>
                        <button type="button" className="tv-pl-tool" aria-label="Duplicar" title="Duplicar" disabled={full} onClick={() => duplicate(i)}>
                          <Icon name="copy" size={17} strokeWidth={2.4} />
                        </button>
                        <button type="button" className="tv-pl-tool is-danger" aria-label="Quitar" title="Quitar" data-sound="back" onClick={() => remove(i)}>
                          <Icon name="trash" size={17} strokeWidth={2.4} />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {canEdit &&
            (adding ? (
              <div className="tv-pl-add-menu" role="group" aria-label="Elige qué juego añadir">
                {playlistGames().map((g) => (
                  <button key={g.id} type="button" className={`tv-pl-add-game tv-c-${g.color}`} onClick={() => addGame(g.id)}>
                    <Icon name={g.icon} size={18} strokeWidth={2.4} />
                    {g.name}
                  </button>
                ))}
                <button type="button" className="tv-pl-add-cancel" aria-label="Cancelar" data-sound="back" onClick={() => setAdding(false)}>
                  <Icon name="close" size={18} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button type="button" className="tv-pl-add" onClick={() => setAdding(true)} disabled={full}>
                <Icon name="plus" size={20} strokeWidth={3} />
                {full ? `Máximo ${MAX_ITEMS} juegos` : "Añadir juego"}
              </button>
            ))}
        </div>

        <div className="tv-mstage-foot tv-pl-foot">
          <div className="tv-pl-order" role="radiogroup" aria-label="Orden de los juegos">
            {ORDERS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={draft.order === o.id}
                className="tv-pl-order-btn"
                title={o.hint}
                disabled={!canEdit}
                onClick={() => draft.order !== o.id && commit({ ...draft, order: o.id })}
              >
                <Icon name={o.icon} size={18} strokeWidth={2.6} />
                {o.label}
              </button>
            ))}
          </div>
          {blocked && (
            <p className="tv-pl-blocked" role="status">
              <Icon name="lock" size={15} strokeWidth={2.6} />
              <span>{blocked}</span>
            </p>
          )}
          <PlaylistStart room={room} />
        </div>
      </section>

      <SettingsPanel room={room} readOnly={!canEdit}>
        {selected ? (
          // In the chosen game's colour (styles/playlist.css), as in its own lobby.
          <div className={`tv-pl-edit is-${selected.game}`} key={selected.id}>
            <div className="tv-pl-edit-head">
              <span className={`tv-pl-badge tv-c-${findMode(selected.game)?.color || "neutral"}`}>
                <Icon name={findMode(selected.game)?.icon || "play"} size={20} strokeWidth={2.4} />
              </span>
              <div className="tv-pl-edit-text">
                <p className="tv-pl-edit-kicker">
                  Juego {selectedIndex + 1} de {items.length}
                </p>
                <h3 className="tv-pl-edit-title">{findMode(selected.game)?.name}</h3>
              </div>
            </div>
            <ItemSettings
              room={room}
              item={selected}
              status={status[selected.id]}
              readOnly={!canEdit}
              onChange={(config) => setItemConfig(selected.id, config)}
              onToast={onToast}
            />
            {status[selected.id]?.problem && (
              <p className="tv-playlist-total is-short" role="status">
                <Icon name="lock" size={16} strokeWidth={2.6} />
                <span>{status[selected.id].problem}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="tv-pl-hint">
            <Icon name="playlist" size={22} strokeWidth={2.2} />
            Cuando añadas juegos, toca uno para elegir sus ajustes: categorías, dificultad, rondas…
          </p>
        )}
        <PlaylistShare playlist={draft} canEdit={canEdit} onImport={replaceWith} onToast={onToast} />
        <PlaylistLibrary playlist={draft} canEdit={canEdit} onLoad={replaceWith} onToast={onToast} />
      </SettingsPanel>
    </>
  );
}

// "Empezar playlist" at the bottom of the card, for the host (phones have it in the bottom bar instead, like every
// game's start button); everyone else sees who they wait for.
function PlaylistStart({ room }) {
  const { isHost, canStart, busy, err, start } = useStartGame(room);
  if (!isHost) {
    return <p className="tv-mstage-wait">Esperando a que {room.hostName || "el anfitrión"} empiece la playlist</p>;
  }
  return (
    <>
      {err && <p className="tv-lobby-error">{err}</p>}
      <button className="tv-mstage-start tv-shine" onClick={start} disabled={!canStart} type="button">
        <Icon name="play" size={22} filled strokeWidth={1.5} />
        {busy ? "Empezando…" : "Empezar playlist"}
      </button>
    </>
  );
}

// Sharing the playlist as JSON: copied (or shown, when the browser won't copy), downloaded as a file, or imported by
// pasting one or choosing its file. Importing replaces the room's playlist for whoever may change it; anyone else keeps
// it in "Mis playlists".
function PlaylistShare({ playlist, canEdit, onImport, onToast }) {
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The JSON on screen, to copy by hand when the clipboard isn't allowed.
  const [shown, setShown] = useState(false);
  const fileRef = useRef(null);
  const empty = !playlist.items.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(toShareJson(playlist));
      onToast?.("JSON de la playlist copiado", "check");
    } catch {
      setShown(true);
    }
  }

  async function doImport(source) {
    setError("");
    let parsed;
    try {
      parsed = parsePlaylistJson(source);
    } catch (err) {
      setError(err.message);
      return;
    }
    const { playlist: imported, skipped } = parsed;
    const left = skipped ? ` (${skipped === 1 ? "1 juego que no conocemos se quedó fuera" : `${skipped} juegos que no conocemos se quedaron fuera`})` : "";
    setBusy(true);
    try {
      if (canEdit) {
        await onImport(imported);
        onToast?.(`Playlist «${imported.name}» importada: ${gamesText(imported.items.length)}${left}`, "check");
      } else {
        saveToLibrary(imported);
        window.dispatchEvent(new Event("trivially:playlists"));
        onToast?.(`«${imported.name}» guardada en Mis playlists${left}`, "check");
      }
      setImporting(false);
      setText("");
    } catch (err) {
      setError(err.message || "No se pudo importar la playlist");
    } finally {
      setBusy(false);
    }
  }

  function readFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 200000) {
      setError("Ese archivo es demasiado grande para ser una playlist.");
      return;
    }
    file
      .text()
      .then((content) => {
        setText(content);
        doImport(content);
      })
      .catch(() => setError("No se pudo leer ese archivo."));
  }

  return (
    <section className="tv-pl-side" aria-labelledby="tv-pl-share-title">
      <div className="tv-pl-side-head">
        <h3 id="tv-pl-share-title" className="tv-pl-side-title">
          Compartir
        </h3>
        <span className="tv-pl-side-sub">En formato JSON</span>
      </div>
      <div className="tv-pl-side-actions">
        <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={copy} disabled={empty} data-sound="copy">
          <Icon name="copy" size={16} strokeWidth={2.6} />
          Copiar
        </button>
        <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={() => downloadPlaylist(playlist)} disabled={empty}>
          <Icon name="download" size={16} strokeWidth={2.6} />
          Descargar
        </button>
        <button
          type="button"
          className="tv-btn tv-btn--sm tv-c-neutral"
          aria-expanded={importing}
          onClick={() => {
            setImporting((v) => !v);
            setError("");
          }}
        >
          <Icon name={importing ? "close" : "upload"} size={16} strokeWidth={2.6} />
          {importing ? "Cerrar" : "Importar"}
        </button>
      </div>
      {shown && (
        <div className="tv-pl-json">
          <p className="tv-pl-side-note">Tu navegador no nos deja copiar. Selecciona el texto y cópialo tú:</p>
          <textarea className="tv-pl-textarea" readOnly value={toShareJson(playlist)} onFocus={(e) => e.currentTarget.select()} rows={6} />
          <button type="button" className="tv-pl-link" onClick={() => setShown(false)}>
            Ocultar
          </button>
        </div>
      )}
      {importing && (
        <div className="tv-pl-json">
          <p className="tv-pl-side-note">
            {canEdit
              ? "Pega el JSON de una playlist o elige su archivo. Sustituirá a la playlist de la sala."
              : "Pega el JSON de una playlist o elige su archivo. Se guardará en Mis playlists."}
          </p>
          <textarea
            className="tv-pl-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{ "name": "Mi playlist", "items": [ … ] }'
            rows={6}
            spellCheck={false}
            aria-label="JSON de la playlist"
          />
          {error && (
            <p className="tv-lobby-error" role="alert">
              {error}
            </p>
          )}
          <div className="tv-pl-side-actions">
            <button type="button" className="tv-btn tv-btn--sm tv-c-playlist" onClick={() => doImport(text)} disabled={!text.trim() || busy}>
              <Icon name="check" size={16} strokeWidth={3} />
              {busy ? "Importando…" : "Importar"}
            </button>
            <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Icon name="upload" size={16} strokeWidth={2.6} />
              Elegir archivo
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json,text/plain" hidden onChange={readFile} />
          </div>
        </div>
      )}
    </section>
  );
}

// "Mis playlists": the ones kept in this browser, to play again. Anyone can keep the room's playlist; whoever may change
// it can load a kept one into the room. Taking one out asks for a second tap.
function PlaylistLibrary({ playlist, canEdit, onLoad, onToast }) {
  const [list, setList] = useState(loadLibrary);
  const [confirmId, setConfirmId] = useState(null);
  const [loading, setLoading] = useState(null);

  // Kept from the import box or another tab.
  useEffect(() => {
    const reload = () => setList(loadLibrary());
    window.addEventListener("trivially:playlists", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("trivially:playlists", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  useEffect(() => {
    if (!confirmId) return undefined;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  function keep() {
    try {
      setList(saveToLibrary(playlist));
      onToast?.(`«${playlist.name}» guardada en Mis playlists`, "check");
    } catch (err) {
      onToast?.(err.message);
    }
  }

  async function load(entry) {
    setLoading(entry.id);
    try {
      await onLoad(fromLibrary(entry));
      onToast?.(`«${entry.name}» cargada en la sala`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo cargar la playlist");
    } finally {
      setLoading(null);
    }
  }

  function remove(entry) {
    if (confirmId !== entry.id) {
      setConfirmId(entry.id);
      return;
    }
    setConfirmId(null);
    setList(removeFromLibrary(entry.id));
  }

  return (
    <section className="tv-pl-side" aria-labelledby="tv-pl-library-title">
      <div className="tv-pl-side-head">
        <h3 id="tv-pl-library-title" className="tv-pl-side-title">
          Mis playlists
        </h3>
        <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={keep} disabled={!playlist.items.length}>
          <Icon name="save" size={16} strokeWidth={2.4} />
          Guardar esta
        </button>
      </div>
      {list.length === 0 ? (
        <p className="tv-pl-side-note">Guarda aquí tus playlists para volver a jugarlas. Se quedan en este navegador.</p>
      ) : (
        <ul className="tv-pl-saved">
          {list.map((entry) => (
            <li key={entry.id} className="tv-pl-saved-row">
              <span className="tv-pl-saved-dots" aria-hidden="true">
                {entry.items.slice(0, 6).map((item, i) => (
                  <span key={i} className={`tv-c-${findMode(item.game)?.color || "neutral"}`} />
                ))}
              </span>
              <span className="tv-pl-saved-text">
                <strong>{entry.name}</strong>
                <small>
                  {gamesText(entry.items.length)} · {entry.order === "aleatorio" ? "Aleatorio" : "En orden"}
                </small>
              </span>
              {canEdit && (
                <button type="button" className="tv-btn tv-btn--sm tv-c-playlist" onClick={() => load(entry)} disabled={Boolean(loading)}>
                  {loading === entry.id ? "Cargando…" : "Cargar"}
                </button>
              )}
              <button
                type="button"
                className={`tv-pl-tool is-danger${confirmId === entry.id ? " is-confirm" : ""}`}
                aria-label={confirmId === entry.id ? `Toca otra vez para borrar ${entry.name}` : `Borrar ${entry.name}`}
                title={confirmId === entry.id ? "Toca otra vez para borrarla" : "Borrar"}
                data-sound="back"
                onClick={() => remove(entry)}
              >
                <Icon name={confirmId === entry.id ? "check" : "trash"} size={17} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
