import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/home/Icon.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { play, withSound } from "../../lib/sounds.js";
import { findMode } from "../index.js";
import ItemSettings from "./ItemSettings.jsx";
import {
  MAX_ITEMS,
  NAME_MAX,
  defaultItemConfig,
  itemSummary,
  fromLibrary,
  loadLibrary,
  newItemId,
  playlistGames,
  removeFromLibrary,
  renameInLibrary,
  saveToLibrary,
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
// and how to share it (a code: copied from the playlist or a saved one, pasted to load one) and keep it ("Mis playlists", in this browser).
// The host and whoever has the permission change it, and every change reaches the whole room; the rest see it locked.
// How a playlist is made, shown in the settings panel while it has no games.
const PLAYLIST_STEPS = [
  { title: "Añade juegos", text: "Toca los que están debajo de la lista." },
  { title: "Ajusta cada uno", text: "Toca un juego de la lista y elige aquí cómo se juega." },
  { title: "Comienza la partida", text: "Todas las rondas seguidas en una partida, y gana quien sume más puntos." },
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
  // The tray's two lines show only while the whole list is in sight; once it scrolls (its bar shows), only the tiles.
  const [trayText, setTrayText] = useState(true);
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
    const roomBeside = (tray) =>
      phone
        ? rows.length > PHONE_ROWS
          ? bottomOf(rows[PHONE_ROWS - 1]) + pad
          : Infinity
        : wrap.clientHeight - (tray ? tray.offsetHeight + 6 : 0);
    // Would the whole list fit with the tray's text showing? Measured with the text on for a moment, so hiding it
    // (which frees room) never makes the list fit again and the text flicker back.
    let fitsWithText = rows.length <= MAX_ROWS;
    if (fitsWithText) {
      const had = add?.classList.contains("has-text");
      add?.classList.add("has-text");
      fitsWithText = body.scrollHeight <= roomBeside(add);
      if (!had) add?.classList.remove("has-text");
    }
    setTrayText(fitsWithText);
    const room = roomBeside(add);
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

  // The disk beside the name: keeps the playlist in "Mis playlists" straight away, as a new one (never replacing a
  // saved one with other games or settings: a name already taken gets "(2)"). It shows a check for a moment.
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
      const res = saveToLibrary(named);
      // Saved as "Nombre (2)": the room's playlist takes that name too, so both are exactly the same (same code) and
      // saving it again doesn't make another copy.
      if (res.name !== named.name) renameTo(res.name);
      window.dispatchEvent(new Event("trivially:playlists"));
      setJustSaved(true);
      play("correct");
      onToast?.(`«${res.name}» guardada en Mis playlists`, "check");
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

  // Another playlist in the room.
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
              <CopyCodeButton className="tv-pl-rename" disabled={!items.length} onToast={onToast} />
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
            <div className={`tv-pl-fill${trayText ? " has-text" : ""}`}>
              {/* Its two lines show while the whole list is in sight; once the list scrolls, only the tiles. */}
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
        </div>
      </section>

      <SettingsPanel
        room={room}
        readOnly={!canEdit}
        inline
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

// "Copiar código": keeps a playlist on the server (the room's, or `playlist`, a saved one) and copies its code
// ("K7P2M-XH4QN") to the clipboard; for a moment it shows a check. If the browser won't copy, the code shows in the
// message instead, to copy by hand.
function CopyCodeButton({ playlist = null, disabled = false, className, size = 18, label = null, onToast }) {
  const { sharePlaylist } = useApp();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(t);
  }, [done]);
  async function copy() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const code = await withSound(() => sharePlaylist(playlist));
      try {
        await navigator.clipboard.writeText(code);
        setDone(true);
        onToast?.(`Código copiado: ${code}`, "check");
      } catch {
        onToast?.(`Tu código es ${code} (cópialo a mano)`, "check");
      }
    } catch (err) {
      onToast?.(err.message || "No se pudo crear el código");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className={`${className}${done ? " is-on" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={copy}
      disabled={disabled || busy}
      aria-label={done ? "Código copiado" : `Copiar el código de ${playlist?.name ? `«${playlist.name}»` : "esta playlist"}`}
      data-sound="none"
    >
      {busy ? <span className="tv-spinner" aria-hidden="true" /> : <Icon name={done ? "check" : "share"} size={size} strokeWidth={2.4} />}
      {label && <span>{done ? "Copiado" : label}</span>}
    </button>
  );
}

// "Código de playlist": the box where a friend's code is pasted (copying one is on each playlist, CopyCodeButton).
// The playlist is always kept in "Mis playlists"; whoever may change the room also loads it.
function PlaylistShare({ canEdit, onImport, onToast }) {
  const { playlistByCode } = useApp();
  const [code, setCode] = useState("");
  const [loadBusy, setLoadBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadCode(e) {
    e.preventDefault();
    if (!code.trim() || loadBusy) return;
    setLoadBusy(true);
    setError("");
    try {
      const found = await withSound(() => playlistByCode(code.trim()));
      const imported = fromLibrary(found);
      // Always kept in "Mis playlists" too, to play it again later; whoever may change the room also loads it.
      let kept = null;
      try {
        kept = saveToLibrary(imported);
        window.dispatchEvent(new Event("trivially:playlists"));
      } catch {
        // The browser keeps nothing (a private window): it's only loaded.
      }
      const shownName = kept?.name || imported.name;
      if (canEdit) {
        await onImport({ ...imported, name: shownName });
        onToast?.(`«${shownName}» cargada y guardada en Mis playlists`, "check");
      } else {
        onToast?.(`«${shownName}» guardada en Mis playlists`, "check");
      }
      setCode("");
    } catch (err) {
      setError(err.message || "No se pudo cargar esa playlist");
    } finally {
      setLoadBusy(false);
    }
  }

  return (
    <section className="tv-pl-side" aria-labelledby="tv-pl-share-title">
      <div className="tv-pl-side-head">
        <h3 id="tv-pl-share-title" className="tv-pl-side-title">
          Código de playlist
        </h3>
      </div>
      {/* Copying is on each playlist (its copy icon); here, a friend's code is pasted and loaded. */}
      <form className="tv-spotify-link" onSubmit={loadCode}>
        <div className="tv-spotify-link-box tv-pl-codebox">
          <Icon name="playlist" size={20} strokeWidth={2.4} />
          <input
            className="tv-spotify-link-input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError("");
            }}
            placeholder="Pega el código de una playlist"
            aria-label="Código de una playlist"
            aria-invalid={Boolean(error) || undefined}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            disabled={loadBusy}
          />
          <button
            type="submit"
            className="tv-btn tv-btn--sm tv-c-playlist tv-spotify-link-send"
            disabled={loadBusy || !code.trim()}
            aria-label={loadBusy ? "Cargando la playlist" : "Cargar la playlist"}
            aria-busy={loadBusy}
            data-sound="none"
          >
            {loadBusy ? <span className="tv-spinner" aria-hidden="true" /> : <Icon name="upload" size={20} strokeWidth={3} />}
          </button>
        </div>
      </form>
      {error && (
        <p className="tv-lobby-error" role="alert">
          {error}
        </p>
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
              <CopyCodeButton
                className="tv-pl-tool tv-pl-saved-edit"
                size={17}
                playlist={{ name: entry.name, order: entry.order, items: entry.items }}
                onToast={onToast}
              />
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
