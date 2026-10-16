import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/home/Icon.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useStartGame } from "../../components/home/ModeStart.jsx";
import { useApp } from "../../lib/store.jsx";
import { play } from "../../lib/sounds.js";
import { findMode } from "../index.js";
import ItemSettings from "./ItemSettings.jsx";
import {
  MAX_ITEMS,
  NAME_MAX,
  defaultItemConfig,
  downloadPlaylist,
  itemSummary,
  fromLibrary,
  loadLibrary,
  newItemId,
  parsePlaylistJson,
  playlistGames,
  removeFromLibrary,
  renameInLibrary,
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
// How a playlist is made, shown in the settings panel while it has no games.
const PLAYLIST_STEPS = [
  { title: "Añade juegos", text: "Toca los que están debajo de la lista." },
  { title: "Ajusta cada uno", text: "Toca un juego de la lista y elige aquí cómo se juega." },
  { title: "Comienza la partida", text: "Se juegan uno tras otro y gana quien gane más juegos." },
];

// On a phone the list shows this many games at most, and scrolls for the rest; on a big screen, as many as fit up to
// MAX_ROWS.
const PHONE_ROWS = 4;
const MAX_ROWS = 5;

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
  // What the settings panel shows: the chosen game's settings, sharing, or the saved playlists. One at a time, so the
  // panel always fits the window.
  const [side, setSide] = useState("juego");
  // A long list scrolls inside the card, with its own scroll bar. It is cut to whole rows (never one showing by half):
  // the list is as tall as the rows that fit in the space between the card's head and foot, and scrolling snaps to rows.
  const wrapRef = useRef(null);
  const bodyRef = useRef(null);
  function fitRows() {
    const wrap = wrapRef.current;
    const body = bodyRef.current;
    if (!wrap || !body) return;
    body.style.height = "";
    // The tray (how games are added) stays under the list, outside what scrolls, at least at its smallest size.
    const add = wrap.querySelector(":scope > .tv-pl-fill");
    // Measured from the layout (offsetTop), not from where a row is drawn: a game just added still slides in with an
    // animation, and its drawn position would make it look like it doesn't fit.
    const bottomOf = (el) => el.offsetTop + el.offsetHeight + 4;
    const pad = 2; // under the last row: less than the gap between rows, so the next one never peeks in
    const rows = body.querySelectorAll(".tv-pl-item");
    // Phones: the page scrolls, so the list just shows its first PHONE_ROWS games and scrolls for the rest.
    const phone = window.matchMedia("(max-width: 640px)").matches;
    const room = phone
      ? rows.length > PHONE_ROWS
        ? bottomOf(rows[PHONE_ROWS - 1]) + pad
        : Infinity
      : wrap.clientHeight - (add ? add.offsetHeight + 6 : 0);
    if (body.scrollHeight <= room && rows.length <= MAX_ROWS) {
      return;
    }
    let fit = 0;
    // Never more than MAX_ROWS games in sight at once (on a big screen); the rest scroll.
    [...rows].slice(0, MAX_ROWS).forEach((el) => {
      const bottom = bottomOf(el);
      if (bottom + pad <= room) fit = bottom;
    });
    if (fit) body.style.height = `${fit + pad}px`;
  }
  useLayoutEffect(() => {
    fitRows();
    window.addEventListener("resize", fitRows);
    return () => window.removeEventListener("resize", fitRows);
  });
  // Measured again whenever the card's space for the list changes size for any other reason (the letters loading,
  // the tray changing), not only when the window does: a measure taken too early would hide a game that fits.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return undefined;
    let last = 0;
    const ro = new ResizeObserver(() => {
      if (Math.abs(wrap.clientHeight - last) < 1) return;
      last = wrap.clientHeight;
      fitRows();
    });
    ro.observe(wrap);
    document.fonts?.ready?.then(fitRows);
    return () => ro.disconnect();
  }, []);

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

  // "Cambiar nombre": the name is written in place; the button stays, and while writing it says it's done.
  const nameRef = useRef(null);
  const [editingName, setEditingName] = useState(false);
  function toggleName() {
    if (editingName) {
      nameRef.current?.blur();
      return;
    }
    nameRef.current?.focus();
    nameRef.current?.select();
  }

  // The disk beside the name: keeps the playlist in "Mis playlists" straight away, under its name (in place of a saved
  // one with the same name). It shows a check for a moment.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), 1800);
    return () => clearTimeout(t);
  }, [justSaved]);
  function quickSave() {
    const clean = name.replace(/\s+/g, " ").trim();
    const named = clean && clean !== draft.name ? renameTo(clean) : draft;
    try {
      saveToLibrary(named);
      window.dispatchEvent(new Event("trivially:playlists"));
      setJustSaved(true);
      play("correct");
      onToast?.(`«${named.name}» guardada en Mis playlists`, "check");
    } catch (err) {
      play("wrong");
      onToast?.(err.message);
    }
  }

  // Saving under another name renames the room's playlist too, so both say the same.
  function renameTo(next) {
    const clean = next.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    if (!clean || clean === draft.name) return draft;
    setName(clean);
    const renamed = { ...draft, name: clean };
    commit(renamed);
    return renamed;
  }

  function replaceWith(playlist) {
    setSelectedId(playlist.items[0]?.id || null);
    return save(playlist);
  }

  // "Nueva": starts an empty playlist, "Mi playlist". With games in this one it asks first (a second tap within 3 s);
  // what isn't saved in "Mis playlists" is lost.
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => {
    if (!confirmNew) return undefined;
    const t = setTimeout(() => setConfirmNew(false), 3000);
    return () => clearTimeout(t);
  }, [confirmNew]);
  function startNew() {
    if (items.length && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    setConfirmNew(false);
    setName(EMPTY.name);
    replaceWith({ ...EMPTY }).catch((err) => onToast?.(err.message || "No se pudo empezar otra playlist"));
  }

  const setItemConfig = (id, config) => save({ ...draft, items: items.map((i) => (i.id === id ? { ...i, config } : i)) });

  // Why it can't start yet, for everyone to see: no games, or the first game whose settings can't be played.
  const blockedAt = items.findIndex((i) => status[i.id]?.problem);
  const blocked = !items.length
    ? "Añade al menos un juego para empezar."
    : blockedAt >= 0
    ? `Juego ${blockedAt + 1}, ${findMode(items[blockedAt].game)?.name}: ${status[items[blockedAt].id].problem}`
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
            {canEdit && (
              <button
                type="button"
                className={`tv-pl-new${confirmNew ? " is-confirm" : ""}`}
                onClick={startNew}
                aria-label={confirmNew ? "Toca otra vez para empezar una playlist nueva" : "Crear una playlist nueva"}
              >
                <Icon name="plus" size={16} strokeWidth={3} />
                {confirmNew ? "¿Empezar de cero?" : "Nueva"}
              </button>
            )}
          </div>
          {canEdit ? (
            <div className="tv-pl-namerow">
              <input
                ref={nameRef}
                className="tv-pl-name"
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setEditingName(true)}
                onBlur={() => {
                  setEditingName(false);
                  saveName();
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                aria-label="Nombre de la playlist"
                spellCheck={false}
              />
              <button
                type="button"
                className={`tv-pl-rename${editingName ? " is-on" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggleName}
                aria-label={editingName ? "Listo" : "Cambiar el nombre"}
              >
                <Icon name={editingName ? "check" : "pencil"} size={18} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                className={`tv-pl-rename tv-pl-quicksave${justSaved ? " is-on" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={quickSave}
                disabled={!items.length}
                aria-label={justSaved ? "Guardada en Mis playlists" : "Guardar en Mis playlists"}
                data-sound="none"
              >
                <Icon name={justSaved ? "check" : "save"} size={18} strokeWidth={2.4} />
              </button>
            </div>
          ) : (
            <h2 className="tv-pl-name">{draft.name}</h2>
          )}
        </div>

        <div className="tv-pl-bodywrap" ref={wrapRef}>
        <div className={`tv-pl-body${selectedId ? " has-selected" : ""}`} ref={bodyRef}>
          {items.length === 0 ? (
            !canEdit && <p className="tv-pl-empty">{room.hostName || "El anfitrión"} está preparando la playlist.</p>
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
                      aria-label={problem ? `${game?.name || item.game}: ${problem}` : undefined}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSide("juego");
                      }}
                    >
                      <span className="tv-pl-num">{i + 1}</span>
                      <span className={`tv-pl-badge tv-c-${game?.color || "neutral"}`}>
                        <Icon name={game?.icon || "play"} size={20} strokeWidth={2.4} />
                      </span>
                      <span className="tv-pl-text">
                        <span className="tv-pl-game">{game?.name || item.game}</span>
                        <span className="tv-pl-sum">{itemSummary(item)}</span>
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
                        <button type="button" className="tv-pl-tool" aria-label="Duplicar" disabled={full} onClick={() => duplicate(i)}>
                          <Icon name="copy" size={17} strokeWidth={2.4} />
                        </button>
                        <button type="button" className="tv-pl-tool is-danger" aria-label="Quitar" data-sound="back" onClick={() => remove(i)}>
                          <Icon name="trash" size={17} strokeWidth={2.4} />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

        </div>
          {/* Under the games, always: a tray sunk into the card with a white tile per game, its icon in the game's
              colour and a "+", and a line saying a tap adds it. It's the only way to add one. It grows into the
              card's spare height; when the list is full it keeps just the tiles. */}
          {canEdit && (
            <div className={`tv-pl-fill${items.length <= 4 ? " has-text" : ""}`}>
              {/* Its two lines show until the playlist has more than four games; then only the tiles. */}
              <div className="tv-pl-tray">
                <span className="tv-pl-fill-icons" role="group" aria-label="Añadir un juego">
                  {playlistGames().map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`tv-c-${g.color}`}
                      onClick={() => addGame(g.id)}
                      disabled={full}
                      aria-label={`Añadir ${g.name}`}
                    >
                      <Icon name={g.icon} size={22} strokeWidth={2.4} />
                      <span className="tv-pl-fill-plus" aria-hidden="true">
                        <Icon name="plus" size={11} strokeWidth={4} />
                      </span>
                    </button>
                  ))}
                </span>
                <span className="tv-pl-fill-text">
                  {full ? (
                    <span>Llegaste al máximo de {MAX_ITEMS} juegos.</span>
                  ) : (
                    <>
                      <span>Toca un juego para añadirlo a la playlist.</span>
                      <span>Hasta {MAX_ITEMS}, y puedes repetir uno con otros ajustes.</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>


        <div className="tv-mstage-foot tv-pl-foot">
          <div className={`tv-pl-orderrow${canEdit ? " has-shuffle" : ""}`}>
          <div className="tv-pl-order" role="radiogroup" aria-label="Orden de los juegos">
            {ORDERS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={draft.order === o.id}
                className="tv-pl-order-btn"
                disabled={!canEdit}
                onClick={() => draft.order !== o.id && commit({ ...draft, order: o.id })}
              >
                <Icon name={o.icon} size={18} strokeWidth={2.6} />
                {o.label}
              </button>
            ))}
          </div>
          {/* "En orden" plays them as listed: this shuffles that list once (it stays as it comes out). With "Aleatorio"
              (or fewer than two games) it stays, greyed out. */}
          {canEdit && (
            <button
              type="button"
              className="tv-pl-shuffle"
              onClick={reshuffle}
              disabled={draft.order !== "orden" || items.length < 2}
              aria-label="Mezclar el orden de los juegos"
            >
              <Icon name="reorder" size={18} strokeWidth={2.6} />
              Mezclar
            </button>
          )}
          </div>
          <PlaylistStart room={room} blocked={blocked} />
        </div>
      </section>

      <SettingsPanel
        room={room}
        readOnly={!canEdit}
        actions={
          // Small, in the title's row: the chosen game's settings, or saving and sharing the playlist.
          <div className="tv-pl-views" role="tablist" aria-label="Qué ver">
            {[
              { id: "juego", label: "Juego", icon: "hourglass" },
              { id: "guardar", label: "Guardar y compartir", icon: "save" },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={side === v.id}
                className="tv-pl-view"
                aria-label={v.label}
                onClick={() => setSide(v.id)}
              >
                <Icon name={v.icon} size={15} strokeWidth={2.6} />
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        }
      >
        {side === "juego" && (selected ? (
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
              {/* Back and forth between the playlist's games without going to the list (always there, so the panel looks the same with one game). The arrows go round: after the last game comes the first, and before the first the last. */}
              {items.length > 0 && (
                <div className="tv-pl-edit-nav" role="group" aria-label="Cambiar de juego">
                  <button
                    type="button"
                    className="tv-pl-edit-step"
                    aria-label="Juego anterior"
                    disabled={items.length < 2}
                    onClick={() => setSelectedId(items[(selectedIndex - 1 + items.length) % items.length].id)}
                  >
                    <Icon name="chevron" size={18} strokeWidth={3} className="is-prev" />
                  </button>
                  <span className="tv-pl-edit-dots" aria-hidden="true">
                    {items.map((item, i) => (
                      <button
                        key={item.id}
                        type="button"
                        tabIndex={-1}
                        className={`tv-c-${findMode(item.game)?.color || "neutral"}${i === selectedIndex ? " is-on" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                      />
                    ))}
                  </span>
                  <button
                    type="button"
                    className="tv-pl-edit-step"
                    aria-label="Juego siguiente"
                    disabled={items.length < 2}
                    onClick={() => setSelectedId(items[(selectedIndex + 1) % items.length].id)}
                  >
                    <Icon name="chevron" size={18} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
            <ItemSettings
              room={room}
              item={selected}
              status={status[selected.id]}
              readOnly={!canEdit}
              onChange={(config) => setItemConfig(selected.id, config)}
              onToast={onToast}
            />
          </div>
        ) : (
          // No games yet: how a playlist is made, in one small box.
          <ol className="tv-pl-howto">
            {PLAYLIST_STEPS.map((step, i) => (
              <li key={step.title}>
                <strong>
                  {i + 1}. {step.title}
                </strong>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
        ))}
        {side === "guardar" && <PlaylistLibrary playlist={draft} canEdit={canEdit} onLoad={replaceWith} onToast={onToast} />}
        {side === "guardar" && <PlaylistShare playlist={draft} canEdit={canEdit} onImport={replaceWith} onToast={onToast} />}
      </SettingsPanel>
    </>
  );
}

// "Empezar playlist" at the bottom of the card, for the host (phones have it in the bottom bar instead, like every
// game's start button); everyone else sees who they wait for.
// While it can't start (`blocked`: no games, or a game whose settings can't be played) the button is just locked;
// the game with the problem shows its ⓘ in the list.
function PlaylistStart({ room, blocked }) {
  const { isHost, canStart, busy, err, start } = useStartGame(room);
  if (!isHost) {
    return <p className="tv-mstage-wait">Esperando a que {room.hostName || "el anfitrión"} comience la partida</p>;
  }
  return (
    <>
      {err && <p className="tv-lobby-error">{err}</p>}
      <button className="tv-mstage-start tv-shine" onClick={start} disabled={!canStart || Boolean(blocked)} type="button" data-sound="none">
        <Icon name="play" size={22} filled strokeWidth={1.5} />
        {busy ? "Empezando…" : "Comenzar partida"}
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
function PlaylistLibrary({ canEdit, onLoad, onToast }) {
  const { user } = useApp();
  const signedIn = Boolean(user && !user.isGuest);
  const [list, setList] = useState(loadLibrary);
  // A saved one's name, changed in its own row: the pencil turns it into a box, the check (or Enter) keeps it.
  const [renaming, setRenaming] = useState(null);
  const [renameText, setRenameText] = useState("");
  function startRename(entry) {
    setRenaming(entry.id);
    setRenameText(entry.name);
  }
  function finishRename(e) {
    e?.preventDefault();
    if (!renaming) return;
    try {
      if (renameText.trim()) setList(renameInLibrary(renaming, renameText));
    } catch (err) {
      onToast?.(err.message);
    }
    setRenaming(null);
  }
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
      </div>
      {/* Without an account: a note in the playlist's colour, like Adivina la canción's Spotify note. */}
      {!signedIn && (
        <div className="tv-note tv-pl-account-note">
          <Icon name="info" size={16} strokeWidth={2.6} />
          <p className="tv-note-text">
            <span>
              <Link to="/login">Crear cuenta</Link> o <Link to="/login?mode=login">Iniciar sesión</Link>
            </span>{" "}
            <span>para no perder tus playlists.</span>
          </p>
        </div>
      )}
      {list.length === 0 ? (
        <p className="tv-pl-side-note">Guárdala con el ícono junto a su nombre para volver a jugarla.</p>
      ) : (
        <ul className="tv-pl-saved">
          {list.map((entry) => (
            <li key={entry.id} className="tv-pl-saved-row">
              <span className="tv-pl-saved-dots" aria-hidden="true">
                {entry.items.slice(0, 6).map((item, i) => (
                  <span key={i} className={`tv-c-${findMode(item.game)?.color || "neutral"}`} />
                ))}
              </span>
              {renaming === entry.id ? (
                <form className="tv-pl-saved-rename" onSubmit={finishRename} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}>
                  <input
                    value={renameText}
                    maxLength={NAME_MAX}
                    onChange={(e) => setRenameText(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={finishRename}
                    aria-label={`Nuevo nombre de ${entry.name}`}
                    autoFocus
                    spellCheck={false}
                  />
                </form>
              ) : (
                <span className="tv-pl-saved-text">
                  <strong>{entry.name}</strong>
                  <small>
                    {gamesText(entry.items.length)} · {entry.order === "aleatorio" ? "Aleatorio" : "En orden"}
                  </small>
                </span>
              )}
              <button
                type="button"
                className={`tv-pl-tool tv-pl-saved-edit${renaming === entry.id ? " is-on" : ""}`}
                aria-label={renaming === entry.id ? "Guardar el nombre" : `Cambiar el nombre de ${entry.name}`}
                onMouseDown={(e) => renaming === entry.id && e.preventDefault()}
                onClick={() => (renaming === entry.id ? finishRename() : startRename(entry))}
              >
                <Icon name={renaming === entry.id ? "check" : "pencil"} size={17} strokeWidth={2.6} />
              </button>
              {canEdit && (
                <button type="button" className="tv-btn tv-btn--sm tv-c-playlist" onClick={() => load(entry)} disabled={Boolean(loading)}>
                  {loading === entry.id ? "Cargando…" : "Cargar"}
                </button>
              )}
              <button
                type="button"
                className={`tv-pl-tool is-danger${confirmId === entry.id ? " is-confirm" : ""}`}
                aria-label={confirmId === entry.id ? `Toca otra vez para borrar ${entry.name}` : `Borrar ${entry.name}`}
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
