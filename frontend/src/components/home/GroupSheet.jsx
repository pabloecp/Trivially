import { useEffect, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import FriendsRoomControls from "./FriendsRoomControls.jsx";
import Icon from "./Icon.jsx";
import InviteFriends from "./InviteFriends.jsx";
import Modal from "./Modal.jsx";
import { Link } from "react-router-dom";
import CentralSpot from "./CentralSpot.jsx";
import { profilePath } from "./PlayerName.jsx";
import { useInvite } from "./useInvite.js";

import { translate as tr } from "../../lib/i18n.js";
// "Tu grupo", from "Invitar" beside the game's card (the top bar's faces on phones): the group's invite link
// hidden every time it opens (its "Mostrar" button swaps the label for the link, in the same box), with one button that copies it (the only place the code shows, inside the link; "Salir del grupo" is beside the card), then
// who is in it. In the group's private match, the
// match's column (PartyPanel: everyone with their menu and your friends online to invite); elsewhere the group's
// own list (GroupMembers), where the leader can pass the group on or take someone out.
// `onLeave` (phones, where there's no "Tu grupo" box beside the card; only with someone else in the group): the red "Salir del grupo" at its foot, which asks first.
export default function GroupSheet({ open, onClose, room, onToast, onLeave = null, leaving = false }) {
  const { group } = useApp();
  // The link is hidden every time the window opens; only its "Mostrar" button shows it (for whoever streams).
  const [linkHidden, setLinkHidden] = useState(true);
  useEffect(() => {
    if (!open) setLinkHidden(true);
  }, [open]);
  const url = `${window.location.host}/grupo/${group?.code}`;
  const link = useInvite(group?.code, onToast, { done: tr("Enlace copiado") });
  if (!group) return null;
  const own = Boolean(room) && room.groupCode === group.code && !room.matchmaking;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("Tu grupo")}
      size="md"
      className="tv-groupsheet"
      foot={
        onLeave ? (
          <button type="button" className="tv-btn tv-btn--bad tv-btn--block" data-sound="back" onClick={onLeave} disabled={leaving}>
            <Icon name="logout" size={18} strokeWidth={2.6} />
            {tr("Salir del grupo")}
          </button>
        ) : null
      }
    >
      <div className="tv-codebox">
        <div className="tv-codebox-row">
          {linkHidden ? (
            <span className="tv-section-label tv-codebox-label">{tr("Enlace del grupo")}</span>
          ) : (
            <span className="tv-section-label tv-codebox-label is-link" title={url}>
              {url}
            </span>
          )}
          <div className="tv-codebox-btns">
            <button type="button" className="tv-btn tv-btn--neutral tv-codebox-show" aria-expanded={!linkHidden} onClick={() => setLinkHidden((h) => !h)}>
              {linkHidden ? tr("Mostrar") : tr("Ocultar")}
            </button>
            <button type="button" className="tv-btn tv-btn--neutral tv-codebox-copy" aria-label={link.copied ? tr("Enlace copiado") : tr("Copiar enlace del grupo")} title={link.copied ? tr("Copiado") : tr("Copiar enlace")} onClick={link.copy}>
              <Icon name={link.copied ? "check" : "link"} size={20} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>
      <GroupMembers group={group} room={own ? room : null} onToast={onToast} onClose={onClose} />
    </Modal>
  );
}

// The group's players, the same with a private match or without one: the leader's crown, who isn't with the group now, and
// each one's buttons: their profile (accounts) for everyone, and for the leader, on the others, the settings' permission,
// making them the leader and taking them out. Then their friends' options and friends to invite.
function GroupMembers({ group, room, onToast, onClose }) {
  const { user, giveLeader, kickFromGroup, toggleGroupPermission } = useApp();
  const isLeader = group.leaderId === user?.id;
  const [busy, setBusy] = useState("");

  async function act(key, fn, okText) {
    setBusy(key);
    try {
      await fn();
      if (okText) onToast?.(okText, "check");
    } catch (err) {
      onToast?.(err.message || tr("No se pudo completar"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="tv-party tv-party--sheet">
      {isLeader && <FriendsRoomControls group={group} onToast={onToast} />}
      {room?.central && <CentralSpot room={room} canEdit={isLeader || Boolean(room.coHosts?.includes(user?.id))} onToast={onToast} />}
      <div className="tv-party-title">
        <h2>{tr("En el grupo")}</h2>
        <span>{group.members.length === 1 ? tr("1 jugador") : tr("{n} jugadores", { n: group.members.length })}</span>
      </div>
      <ul className="tv-party-players" aria-label={tr("Jugadores del grupo")}>
        {group.members.map((m) => {
          const isMe = m.id === user?.id;
          const leads = m.id === group.leaderId;
          const tag = !m.connected ? "Reconectando…" : !m.here ? tr("En otra partida") : leads ? tr("Líder") : m.canEditConfig ? tr("Puede cambiar ajustes") : tr("En el grupo");
          return (
            <li key={m.id} className={`tv-player${isMe ? " is-me" : ""}${m.connected && m.here ? "" : " is-away"}`}>
              <div className="tv-player-btn tv-groupmember">
                <Avatar name={m.name} avatar={m.avatar} mood="neutral" />
                <span className="tv-player-text">
                  <span className="tv-player-name">{m.name}</span>
                  <span className={`tv-player-tag${leads ? " is-host" : ""}`}>{tag}</span>
                </span>
                {/* Always in this order, so the crown and the profile line up from one row to the next. */}
                <span className="tv-groupmember-tools">
                  {isLeader && !isMe && (
                    <>
                      <button
                        type="button"
                        className={`tv-iconbtn tv-iconbtn--sm${m.canEditConfig ? " is-on" : ""}`}
                        aria-pressed={Boolean(m.canEditConfig)}
                        aria-label={tr("{v0} a {name} permiso de ajustes", { v0: m.canEditConfig ? tr("Quitarle") : tr("Darle"), name: m.name })}
                        title={m.canEditConfig ? tr("Quitar permiso de ajustes") : tr("Dar permiso de ajustes")}
                        disabled={Boolean(busy)}
                        onClick={() =>
                          act(`perm:${m.id}`, async () => {
                            const granted = await toggleGroupPermission(m.id);
                            onToast?.(granted ? tr("{name} ya puede cambiar los ajustes", { name: m.name }) : tr("{name} ya no puede cambiar los ajustes", { name: m.name }), "check");
                          })
                        }
                      >
                        <Icon name="sliders" size={16} strokeWidth={2.6} />
                      </button>
                      <button
                        type="button"
                        className="tv-iconbtn tv-iconbtn--sm"
                        aria-label={tr("Sacar a {name} del grupo", { name: m.name })}
                        title={tr("Sacar del grupo")}
                        disabled={Boolean(busy)}
                        onClick={() => act(`kick:${m.id}`, () => kickFromGroup(m.id), tr("Sacaste a {name} del grupo", { name: m.name }))}
                      >
                        <Icon name="close" size={16} strokeWidth={2.8} />
                      </button>
                      <button
                        type="button"
                        className="tv-iconbtn tv-iconbtn--sm"
                        aria-label={tr("Hacer líder a {name}", { name: m.name })}
                        title={tr("Hacer líder")}
                        disabled={Boolean(busy) || !m.connected}
                        onClick={() => act(`lead:${m.id}`, () => giveLeader(m.id), tr("{name} es el líder ahora", { name: m.name }))}
                      >
                        <Icon name="crown" size={16} strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                  {/* Who leads: the crown's button in yellow, only to look at. */}
                  {leads && (
                    <span className="tv-iconbtn tv-iconbtn--sm is-leader" role="img" aria-label={tr("Líder del grupo")} title={tr("Líder del grupo")}>
                      <Icon name="crown" size={16} strokeWidth={2.2} filled />
                    </span>
                  )}
                  {m.isGuest ? (
                    <button type="button" className="tv-iconbtn tv-iconbtn--sm is-none" aria-disabled="true" aria-label={tr("{name} juega como invitado: no tiene perfil", { name: m.name })} title={tr("Juega como invitado: no tiene perfil")}>
                      <Icon name="user" size={16} strokeWidth={2.6} />
                    </button>
                  ) : (
                    <Link className="tv-iconbtn tv-iconbtn--sm" to={profilePath(m)} aria-label={isMe ? tr("Ver mi perfil") : tr("Ver el perfil de {name}", { name: m.name })} title={isMe ? tr("Ver mi perfil") : tr("Ver perfil")} onClick={onClose}>
                      <Icon name="user" size={16} strokeWidth={2.6} />
                    </Link>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <InviteFriends group={group} onToast={onToast} />
    </div>
  );
}
