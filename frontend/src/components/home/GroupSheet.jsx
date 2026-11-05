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
  const link = useInvite(group?.code, onToast, { done: "Enlace copiado" });
  if (!group) return null;
  const own = Boolean(room) && room.groupCode === group.code && !room.matchmaking;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tu grupo"
      size="md"
      className="tv-groupsheet"
      foot={
        onLeave ? (
          <button type="button" className="tv-btn tv-btn--bad tv-btn--block" data-sound="back" onClick={onLeave} disabled={leaving}>
            <Icon name="logout" size={18} strokeWidth={2.6} />
            Salir del grupo
          </button>
        ) : null
      }
    >
      <div className="tv-codebox">
        <div className="tv-codebox-row">
          {linkHidden ? (
            <span className="tv-section-label tv-codebox-label">Enlace del grupo</span>
          ) : (
            <span className="tv-section-label tv-codebox-label is-link" title={url}>
              {url}
            </span>
          )}
          <div className="tv-codebox-btns">
            <button type="button" className="tv-btn tv-btn--neutral tv-codebox-show" aria-expanded={!linkHidden} onClick={() => setLinkHidden((h) => !h)}>
              {linkHidden ? "Mostrar" : "Ocultar"}
            </button>
            <button type="button" className="tv-btn tv-btn--neutral tv-codebox-copy" aria-label={link.copied ? "Enlace copiado" : "Copiar enlace del grupo"} title={link.copied ? "Copiado" : "Copiar enlace"} onClick={link.copy}>
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
      onToast?.(err.message || "No se pudo completar");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="tv-party tv-party--sheet">
      {isLeader && <FriendsRoomControls group={group} onToast={onToast} />}
      {room?.central && <CentralSpot room={room} canEdit={isLeader || Boolean(room.coHosts?.includes(user?.id))} onToast={onToast} />}
      <div className="tv-party-title">
        <h2>En el grupo</h2>
        <span>{group.members.length === 1 ? "1 jugador" : `${group.members.length} jugadores`}</span>
      </div>
      <ul className="tv-party-players" aria-label="Jugadores del grupo">
        {group.members.map((m) => {
          const isMe = m.id === user?.id;
          const leads = m.id === group.leaderId;
          const tag = !m.connected ? "Reconectando…" : !m.here ? "En otra partida" : leads ? "Líder" : m.canEditConfig ? "Puede cambiar ajustes" : "En el grupo";
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
                        aria-label={`${m.canEditConfig ? "Quitarle" : "Darle"} a ${m.name} permiso de ajustes`}
                        title={m.canEditConfig ? "Quitar permiso de ajustes" : "Dar permiso de ajustes"}
                        disabled={Boolean(busy)}
                        onClick={() =>
                          act(`perm:${m.id}`, async () => {
                            const granted = await toggleGroupPermission(m.id);
                            onToast?.(granted ? `${m.name} ya puede cambiar los ajustes` : `${m.name} ya no puede cambiar los ajustes`, "check");
                          })
                        }
                      >
                        <Icon name="sliders" size={16} strokeWidth={2.6} />
                      </button>
                      <button
                        type="button"
                        className="tv-iconbtn tv-iconbtn--sm"
                        aria-label={`Sacar a ${m.name} del grupo`}
                        title="Sacar del grupo"
                        disabled={Boolean(busy)}
                        onClick={() => act(`kick:${m.id}`, () => kickFromGroup(m.id), `Sacaste a ${m.name} del grupo`)}
                      >
                        <Icon name="close" size={16} strokeWidth={2.8} />
                      </button>
                      <button
                        type="button"
                        className="tv-iconbtn tv-iconbtn--sm"
                        aria-label={`Hacer líder a ${m.name}`}
                        title="Hacer líder"
                        disabled={Boolean(busy) || !m.connected}
                        onClick={() => act(`lead:${m.id}`, () => giveLeader(m.id), `${m.name} es el líder ahora`)}
                      >
                        <Icon name="crown" size={16} strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                  {/* Who leads: the crown's button in yellow, only to look at. */}
                  {leads && (
                    <span className="tv-iconbtn tv-iconbtn--sm is-leader" role="img" aria-label="Líder del grupo" title="Líder del grupo">
                      <Icon name="crown" size={16} strokeWidth={2.2} filled />
                    </span>
                  )}
                  {m.isGuest ? (
                    <button type="button" className="tv-iconbtn tv-iconbtn--sm is-none" aria-disabled="true" aria-label={`${m.name} juega como invitado: no tiene perfil`} title="Juega como invitado: no tiene perfil">
                      <Icon name="user" size={16} strokeWidth={2.6} />
                    </button>
                  ) : (
                    <Link className="tv-iconbtn tv-iconbtn--sm" to={profilePath(m)} aria-label={isMe ? "Ver mi perfil" : `Ver el perfil de ${m.name}`} title={isMe ? "Ver mi perfil" : "Ver perfil"} onClick={onClose}>
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
