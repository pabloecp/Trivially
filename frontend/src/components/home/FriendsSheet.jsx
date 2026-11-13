import { useEffect, useState } from "react";
import { findMode } from "../../modes/index.js";
import { USERNAME_MIN, cleanUsername } from "../../lib/username.js";
import { useFriends } from "../../lib/friends.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import Segmented from "./Segmented.jsx";
import "../../styles/friends.css";

// How a friend's line reads: where they are (playing, getting a match ready, in a group on Inicio) and with how many.
export function statusOf(friend) {
  if (!friend.online) return "Desconectado";
  if (!friend.room) return "En línea";
  // Alone in a group on Inicio is the same as having none: a group only shows once there is more than one in it.
  if (friend.room.inRoom === false && friend.room.players <= 1) return "En línea";
  const mode = findMode(friend.room.game)?.name;
  const where = friend.room.inMatch
    ? `Jugando${mode ? ` ${mode}` : ""}`
    : friend.room.inRoom === false
      ? "En un grupo"
      : mode
        ? `Preparando ${mode}`
        : "Preparando una partida";
  return `${where} · ${friend.room.players === 1 ? "1 jugador" : `${friend.room.players} jugadores`}`;
}

// What you can do about a friend's group: join it, ask its leader, or nothing (only by invitation). A friend playing
// alone has no group to join.
export function JoinButton({ friend, onJoin, onCancel, busy }) {
  const room = friend.room;
  if (!room || room.group === false) return null;
  if (room.joinMode === "abierta") {
    return (
      <button type="button" className="tv-btn tv-btn--sm tv-c-green" onClick={() => onJoin(friend)} disabled={busy}>
        Unirme
      </button>
    );
  }
  if (room.joinMode === "solicitud") {
    return room.requested ? (
      <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={() => onCancel(friend)}>
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

// One person in any of the lists: face (with a dot when online), name and @username, a line under it, and what you can do.
function PersonRow({ person, status = null, online = null, children }) {
  return (
    <li className={`tv-fr-row${online ? " is-online" : ""}`}>
      <span className="tv-fr-face">
        <Avatar name={person.name} avatar={person.avatar} />
        {online !== null && <span className={`tv-fr-dot${online ? " is-on" : ""}`} aria-hidden="true" />}
      </span>
      <span className="tv-fr-text">
        <span className="tv-fr-name">
          {person.name}
          {person.username && <span className="tv-handle tv-fr-handle"> @{person.username}</span>}
        </span>
        {status && <span className="tv-fr-status">{status}</span>}
      </span>
      {children}
    </li>
  );
}

function FriendRow({ friend, onJoin, onCancel, onRemove, busy }) {
  return (
    <PersonRow person={friend} online={friend.online} status={statusOf(friend)}>
      <JoinButton friend={friend} onJoin={onJoin} onCancel={onCancel} busy={busy} />
      <button type="button" className="tv-fr-x" aria-label={`Eliminar a ${friend.name} de tus amigos`} onClick={() => onRemove(friend)}>
        <Icon name="close" size={15} strokeWidth={3} />
      </button>
    </PersonRow>
  );
}

// "Amigos", opened from the top bar, in the same window as every other panel (Modal): your @username to share (like
// "Tu grupo"'s link box), two tabs ("Amigos" and "Solicitudes"), and on the friends tab a box to add someone by username
// that is always there, with the friends under it: the ones online first.
export default function FriendsSheet() {
  const f = useFriends();
  const [tab, setTab] = useState("amigos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null: nothing searched yet
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null); // the friend the dialog asks about
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (f.open) setMsg(null);
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

  const view = f.view || { username: null, friends: [], incoming: [], outgoing: [] };
  const close = () => f.setOpen(false);

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
          ? `Le pediste a ${friend.room?.hostName || "el líder"} unirte a su grupo. Esperando su respuesta…`
          : null,
    );

  async function copyUser() {
    try {
      await navigator.clipboard.writeText(`@${view.username}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg({ tone: "bad", text: `Copia esto: @${view.username}` });
    }
  }

  const online = view.friends.filter((x) => x.online);
  const offline = view.friends.filter((x) => !x.online);
  const rows = (list) => (
    <ul className="tv-fr-list">
      {list.map((fr) => (
        <FriendRow key={fr.id} friend={fr} busy={busy} onJoin={join} onCancel={(x) => run(() => f.cancelJoin(x.id))} onRemove={setRemoving} />
      ))}
    </ul>
  );

  return (
    <>
      <Modal open={f.open} onClose={close} title="Amigos" size="md" className="tv-friends">
        {/* Your @username, in the same box as "Tu grupo"'s link, with a button that copies it. */}
        <div className="tv-codebox">
          <div className="tv-codebox-row">
            <span className="tv-section-label tv-codebox-label">Tu usuario</span>
            <span className="tv-fr-code">{view.username ? `@${view.username}` : f.failed ? "No disponible" : "…"}</span>
            <div className="tv-codebox-btns">
              <button
                type="button"
                className="tv-btn tv-btn--neutral tv-codebox-copy"
                disabled={!view.username}
                aria-label={copied ? "Usuario copiado" : "Copiar usuario"}
                title={copied ? "Copiado" : "Copiar usuario"}
                onClick={copyUser}
              >
                <Icon name={copied ? "check" : "copy"} size={18} strokeWidth={2.6} />
              </button>
            </div>
          </div>
        </div>

        <Segmented
          label="Amigos"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setMsg(null);
          }}
          options={[
            { value: "amigos", label: `Amigos${view.friends.length ? ` (${view.friends.length})` : ""}` },
            { value: "solicitudes", label: <>Solicitudes{f.pending > 0 && <span className="tv-fr-count">{f.pending}</span>}</> },
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

        {tab === "amigos" && (
          <>
            {/* Always there: add someone by their @username. */}
            <div className="tv-fr-form">
              <label className="tv-fr-sub" htmlFor="tv-fr-search">
                Añadir un amigo
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
                  placeholder="Escribe su usuario"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  maxLength={40}
                />
              </span>
              {searching && <p className="tv-fr-note">Buscando…</p>}
              {results && results.length === 0 && !searching && <p className="tv-fr-note">No encontramos a nadie con ese usuario.</p>}
              {results && results.length > 0 && (
                <ul className="tv-fr-list" aria-label="Resultados">
                  {results.map((p) => (
                    <PersonRow key={p.id} person={p}>
                      {p.relation === "none" && (
                        <button
                          type="button"
                          className="tv-btn tv-btn--sm tv-c-green"
                          disabled={busy}
                          onClick={async () => {
                            const res = await run(
                              () => f.requestByUsername(p.username),
                              (r) => (r.status === "accepted" ? `¡Ahora ${p.name} y tú son amigos!` : `Solicitud enviada a ${p.name}`),
                            );
                            if (res)
                              setResults((list) =>
                                list?.map((x) => (x.id === p.id ? { ...x, relation: res.status === "accepted" ? "friends" : "asked" } : x)),
                              );
                          }}
                        >
                          Añadir
                        </button>
                      )}
                      {p.relation === "asking" && (
                        <button type="button" className="tv-btn tv-btn--sm tv-c-green" disabled={busy} onClick={() => run(() => f.accept(p.id), `Ahora ${p.name} es tu amigo`)}>
                          Aceptar
                        </button>
                      )}
                      {p.relation === "asked" && <span className="tv-fr-note">Solicitud enviada</span>}
                      {p.relation === "friends" && <span className="tv-fr-note">Ya son amigos</span>}
                    </PersonRow>
                  ))}
                </ul>
              )}
            </div>

            {view.friends.length === 0 ? (
              <div className="tv-fr-empty">
                <Icon name="users" size={40} strokeWidth={2} />
                <p>Aún no tienes amigos. Busca a alguien por su usuario o comparte el tuyo.</p>
              </div>
            ) : (
              <>
                {online.length > 0 && (
                  <section className="tv-fr-group">
                    <h3 className="tv-fr-sub">En línea · {online.length}</h3>
                    {rows(online)}
                  </section>
                )}
                {offline.length > 0 && (
                  <section className="tv-fr-group">
                    <h3 className="tv-fr-sub">Desconectados · {offline.length}</h3>
                    {rows(offline)}
                  </section>
                )}
              </>
            )}
          </>
        )}

        {tab === "solicitudes" && (
          <>
            {view.incoming.length === 0 && view.outgoing.length === 0 && (
              <div className="tv-fr-empty">
                <Icon name="check" size={40} strokeWidth={2} />
                <p>No hay solicitudes.</p>
              </div>
            )}
            {view.incoming.length > 0 && (
              <section className="tv-fr-group">
                <h3 className="tv-fr-sub">Te quieren como amigo · {view.incoming.length}</h3>
                <ul className="tv-fr-list">
                  {view.incoming.map((p) => (
                    <PersonRow key={p.id} person={p}>
                      <button type="button" className="tv-btn tv-btn--sm tv-c-green" disabled={busy} onClick={() => run(() => f.accept(p.id), `Ahora ${p.name} es tu amigo`)}>
                        Aceptar
                      </button>
                      <button type="button" className="tv-fr-x" aria-label={`Rechazar a ${p.name}`} disabled={busy} onClick={() => run(() => f.decline(p.id))}>
                        <Icon name="close" size={15} strokeWidth={3} />
                      </button>
                    </PersonRow>
                  ))}
                </ul>
              </section>
            )}
            {view.outgoing.length > 0 && (
              <section className="tv-fr-group">
                <h3 className="tv-fr-sub">Enviadas · {view.outgoing.length}</h3>
                <ul className="tv-fr-list">
                  {view.outgoing.map((p) => (
                    <PersonRow key={p.id} person={p} status="Esperando respuesta">
                      <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" disabled={busy} onClick={() => run(() => f.remove(p.id))}>
                        Cancelar
                      </button>
                    </PersonRow>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        icon="close"
        title={`¿Eliminar a ${removing?.name || "este amigo"} de tus amigos?`}
        text="Dejarán de verse en línea y tendrán que volver a agregarse para ser amigos."
        cancelLabel="Cancelar"
        confirmLabel="Eliminar"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const x = removing;
          setRemoving(null);
          run(() => f.remove(x.id), `${x.name} ya no está en tus amigos`);
        }}
      />
    </>
  );
}
