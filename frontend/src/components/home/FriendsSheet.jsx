import { useEffect, useRef, useState } from "react";
import { findMode } from "../../modes/index.js";
import { USERNAME_MIN, cleanUsername } from "../../lib/username.js";
import { useFriends } from "../../lib/friends.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import Segmented from "./Segmented.jsx";
import "../../styles/friends.css";

// How a friend's line reads: where they are and what you can do about it.
function statusOf(friend) {
  if (!friend.online) return "Desconectado";
  if (!friend.room) return "En línea";
  const mode = findMode(friend.room.game)?.name;
  const where = friend.room.inMatch
    ? `Jugando${mode ? ` ${mode}` : ""}`
    : mode
      ? `En una sala · ${mode}`
      : "En una sala";
  return `${where} · ${friend.room.players === 1 ? "1 jugador" : `${friend.room.players} jugadores`}`;
}

function JoinButton({ friend, onJoin, onCancel, busy }) {
  const room = friend.room;
  if (!room) return null;
  if (room.joinMode === "abierta") {
    return (
      <button type="button" className="tv-btn tv-btn--sm tv-c-green" onClick={() => onJoin(friend)} disabled={busy}>
        Unirme
      </button>
    );
  }
  if (room.joinMode === "solicitud") {
    return room.requested ? (
      <button
        type="button"
        className="tv-btn tv-btn--sm tv-c-neutral"
        onClick={() => onCancel(friend)}
        title="Cancelar la solicitud"
      >
        Esperando… <Icon name="close" size={14} strokeWidth={3} />
      </button>
    ) : (
      <button type="button" className="tv-btn tv-btn--sm tv-c-violet" onClick={() => onJoin(friend)} disabled={busy}>
        Pedir unirme
      </button>
    );
  }
  return <span className="tv-fr-note">Solo por invitación</span>;
}

function FriendRow({ friend, onJoin, onCancel, onRemove, busy }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return undefined;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <li className={`tv-fr-row${friend.online ? " is-online" : ""}`}>
      <span className="tv-fr-face">
        <Avatar name={friend.name} avatar={friend.avatar} />
        <span className={`tv-fr-dot${friend.online ? " is-on" : ""}`} aria-hidden="true" />
      </span>
      <span className="tv-fr-text">
        <span className="tv-fr-name">
          {friend.name}
          {friend.username && <span className="tv-handle tv-fr-handle"> @{friend.username}</span>}
        </span>
        <span className="tv-fr-status">{statusOf(friend)}</span>
      </span>
      <JoinButton friend={friend} onJoin={onJoin} onCancel={onCancel} busy={busy} />
      <button
        type="button"
        className={`tv-fr-x${confirm ? " is-confirm" : ""}`}
        aria-label={
          confirm ? `Toca otra vez para eliminar a ${friend.name}` : `Eliminar a ${friend.name} de tus amigos`
        }
        title={confirm ? "Toca otra vez para eliminarlo" : "Eliminar amigo"}
        onClick={() => (confirm ? onRemove(friend) : setConfirm(true))}
      >
        <Icon name={confirm ? "check" : "close"} size={15} strokeWidth={3} />
      </button>
    </li>
  );
}

// The friends tab, opened from the top bar: friends (and their rooms), requests, and a search by username to add someone.
export default function FriendsSheet() {
  const f = useFriends();
  const [tab, setTab] = useState("amigos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null: nothing searched yet
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const sheetRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (f.open) {
      setMounted(true);
      setClosing(false);
      setMsg(null);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 260);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [f.open]);

  useEffect(() => {
    if (!f.open) return undefined;
    const onKey = (e) => e.key === "Escape" && f.setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [f.open]);

  // People by username, as it is typed (from 3 letters; the server limits how fast).
  useEffect(() => {
    if (query.length < USERNAME_MIN) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    let live = true;
    const timer = setTimeout(() => {
      f.search(query)
        .then((list) => live && setResults(list))
        .catch((err) => live && setMsg({ tone: "bad", text: err.message || "No se pudo buscar" }))
        .finally(() => live && setSearching(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, f.view?.friends?.length, f.view?.outgoing?.length]);

  if (!mounted) return null;
  const view = f.view || { username: null, friends: [], incoming: [], outgoing: [] };

  async function run(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      if (okText) setMsg({ tone: "ok", text: typeof okText === "function" ? okText(res) : okText });
      return res;
    } catch (err) {
      setMsg({ tone: "bad", text: err.message || "No se pudo completar" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const join = (friend) =>
    run(
      () => f.joinFriend(friend.id),
      (action) =>
        action === "requested"
          ? `Le pediste a ${friend.room?.hostName || "el anfitrión"} unirte. Esperando su respuesta…`
          : null,
    );

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setMsg({ tone: "bad", text: `Copia esto: ${text}` });
    }
  }

  return (
    // Inside .tv-app so the panel gets the page's text colour, fonts and button styles (the provider sits above it).
    <div className="tv-app tv-fr-overlay">
      <div className={`tv-sheet-root ${closing ? "is-closing" : "is-open"}`}>
        <div className="tv-sheet-backdrop" onClick={() => f.setOpen(false)} />
        <div className="tv-sheet-pos">
          <div
            ref={sheetRef}
            className="tv-sheet tv-fr-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-fr-title"
          >
            <div className="tv-sheet-head tv-fr-head">
              <span className="tv-badge tv-c-yellow">
                <Icon name="users" size={26} />
              </span>
              <div>
                <p className="tv-sheet-kicker">Social</p>
                <h2 id="tv-fr-title" className="tv-sheet-title">
                  Amigos
                </h2>
              </div>
              <button type="button" className="tv-fr-close" onClick={() => f.setOpen(false)} aria-label="Cerrar">
                <Icon name="close" size={20} strokeWidth={3} />
              </button>
            </div>

            <div className="tv-sheet-body">
              <Segmented
                label="Amigos"
                value={tab}
                onChange={(v) => {
                  setTab(v);
                  setMsg(null);
                }}
                options={[
                  { value: "amigos", label: `Amigos${view.friends.length ? ` (${view.friends.length})` : ""}` },
                  {
                    value: "solicitudes",
                    label: <>Solicitudes{f.pending > 0 && <span className="tv-fr-count">{f.pending}</span>}</>,
                  },
                  { value: "anadir", label: "Añadir" },
                ]}
              />

              {f.failed && !f.view && (
                <p className="tv-fr-msg is-bad" role="alert">
                  <Icon name="lock" size={16} strokeWidth={2.8} />
                  <span>
                    No pudimos cargar tus amigos. Revisa tu conexión o inténtalo en un momento.{" "}
                    <button type="button" className="tv-fr-retry" onClick={f.reload}>
                      Reintentar
                    </button>
                  </span>
                </p>
              )}

              {msg && (
                <p className={`tv-fr-msg is-${msg.tone}`} role="status">
                  <Icon name={msg.tone === "ok" ? "check" : "lock"} size={16} strokeWidth={2.8} />
                  {msg.text}
                </p>
              )}

              {tab === "amigos" &&
                (view.friends.length ? (
                  <ul className="tv-fr-list" aria-label="Tus amigos">
                    {view.friends.map((fr) => (
                      <FriendRow
                        key={fr.id}
                        friend={fr}
                        busy={busy}
                        onJoin={join}
                        onCancel={(x) => run(() => f.cancelJoin(x.id))}
                        onRemove={(x) => run(() => f.remove(x.id), `${x.name} ya no está en tus amigos`)}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="tv-fr-empty">
                    <p>Aún no tienes amigos.</p>
                    <button type="button" className="tv-btn tv-c-violet" onClick={() => setTab("anadir")}>
                      Buscar amigos
                    </button>
                  </div>
                ))}

              {/* "Añadir": your username to share, and the search to add someone. */}
              {tab === "anadir" && (
                <div className="tv-fr-add">
                  <div className="tv-fr-mycode">
                    <p className="tv-sheet-kicker">Tu usuario</p>
                    {/* The username and, on its line, a button with only the copy icon (a tick once copied). */}
                    <div className="tv-fr-coderow">
                      <p className="tv-fr-code">
                        {view.username ? `@${view.username}` : f.failed ? "No disponible" : "…"}
                      </p>
                      <button
                        type="button"
                        className="tv-btn tv-btn--sm tv-c-violet tv-fr-copy"
                        disabled={!view.username}
                        onClick={() => copy(`@${view.username}`, "user")}
                        aria-label={copied === "user" ? "Usuario copiado" : "Copiar usuario"}
                      >
                        <Icon name={copied === "user" ? "check" : "copy"} size={18} strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>
                  <div className="tv-fr-form">
                    <label className="tv-sheet-kicker" htmlFor="tv-fr-search">
                      Busca a alguien por su usuario
                    </label>
                    <span className="tv-handle-box">
                      <span className="tv-handle-at" aria-hidden="true">
                        @
                      </span>
                      <input
                        id="tv-fr-search"
                        className="tv-field"
                        value={query}
                        onChange={(e) => setQuery(cleanUsername(e.target.value))}
                        placeholder="usuario"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        maxLength={40}
                      />
                    </span>
                    {searching && <p className="tv-fr-note">Buscando…</p>}
                    {results && results.length === 0 && !searching && (
                      <p className="tv-fr-note">No encontramos a nadie con ese usuario.</p>
                    )}
                    {results && results.length > 0 && (
                      <ul className="tv-fr-list" aria-label="Resultados">
                        {results.map((p) => (
                          <li key={p.id} className="tv-fr-row">
                            <span className="tv-fr-face">
                              <Avatar name={p.name} avatar={p.avatar} />
                            </span>
                            <span className="tv-fr-text">
                              <span className="tv-fr-name">{p.name}</span>
                              <span className="tv-fr-status tv-handle">@{p.username}</span>
                            </span>
                            {p.relation === "none" && (
                              <button
                                type="button"
                                className="tv-btn tv-btn--sm tv-c-green"
                                disabled={busy}
                                onClick={async () => {
                                  const res = await run(
                                    () => f.requestByUsername(p.username),
                                    (r) =>
                                      r.status === "accepted"
                                        ? `¡Ahora ${p.name} y tú son amigos!`
                                        : `Solicitud enviada a ${p.name}`,
                                  );
                                  if (res)
                                    setResults((list) =>
                                      list?.map((x) =>
                                        x.id === p.id
                                          ? { ...x, relation: res.status === "accepted" ? "friends" : "asked" }
                                          : x,
                                      ),
                                    );
                                }}
                              >
                                Añadir
                              </button>
                            )}
                            {p.relation === "asking" && (
                              <button
                                type="button"
                                className="tv-btn tv-btn--sm tv-c-green"
                                disabled={busy}
                                onClick={() => run(() => f.accept(p.id), `Ahora ${p.name} es tu amigo`)}
                              >
                                Aceptar
                              </button>
                            )}
                            {p.relation === "asked" && <span className="tv-fr-note">Solicitud enviada</span>}
                            {p.relation === "friends" && <span className="tv-fr-note">Ya son amigos</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === "solicitudes" && (
                <>
                  {view.incoming.length === 0 && view.outgoing.length === 0 && (
                    <div className="tv-fr-empty">
                      <p>No hay solicitudes.</p>
                    </div>
                  )}
                  {view.incoming.length > 0 && (
                    <>
                      <h3 className="tv-fr-sub">Te quieren como amigo</h3>
                      <ul className="tv-fr-list">
                        {view.incoming.map((p) => (
                          <li key={p.id} className="tv-fr-row">
                            <span className="tv-fr-face">
                              <Avatar name={p.name} avatar={p.avatar} />
                            </span>
                            <span className="tv-fr-text">
                              <span className="tv-fr-name">
                                {p.name}
                                {p.username && <span className="tv-handle tv-fr-handle"> @{p.username}</span>}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="tv-btn tv-btn--sm tv-c-green"
                              disabled={busy}
                              onClick={() => run(() => f.accept(p.id), `Ahora ${p.name} es tu amigo`)}
                            >
                              Aceptar
                            </button>
                            <button
                              type="button"
                              className="tv-fr-x"
                              aria-label={`Rechazar a ${p.name}`}
                              disabled={busy}
                              onClick={() => run(() => f.decline(p.id))}
                            >
                              <Icon name="close" size={15} strokeWidth={3} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {view.outgoing.length > 0 && (
                    <>
                      <h3 className="tv-fr-sub">Enviadas</h3>
                      <ul className="tv-fr-list">
                        {view.outgoing.map((p) => (
                          <li key={p.id} className="tv-fr-row">
                            <span className="tv-fr-face">
                              <Avatar name={p.name} avatar={p.avatar} />
                            </span>
                            <span className="tv-fr-text">
                              <span className="tv-fr-name">
                                {p.name}
                                {p.username && <span className="tv-handle tv-fr-handle"> @{p.username}</span>}
                              </span>
                              <span className="tv-fr-status">Esperando respuesta</span>
                            </span>
                            <button
                              type="button"
                              className="tv-btn tv-btn--sm tv-c-neutral"
                              disabled={busy}
                              onClick={() => run(() => f.remove(p.id))}
                            >
                              Cancelar
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
