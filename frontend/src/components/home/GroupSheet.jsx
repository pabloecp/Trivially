import { useState } from "react";
import { useApp } from "../../lib/store.jsx";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";
import Avatar from "./Avatar.jsx";
import FriendsRoomControls from "./FriendsRoomControls.jsx";
import Icon from "./Icon.jsx";
import InviteFriends from "./InviteFriends.jsx";
import Modal from "./Modal.jsx";
import PartyPanel from "./PartyPanel.jsx";
import { useInvite } from "./useInvite.js";

// "Tu grupo", from the group's bar ("+" or the faces): the group's code with "Copiar código" and "Copiar enlace" (the
// only place the code shows; "Salir del grupo" is on the bar), then who is in it. In the group's private match, the
// match's column (PartyPanel: everyone with their menu, your friends online to invite, the chat); elsewhere the group's
// own list (GroupMembers), where the leader can pass the group on or take someone out.
export default function GroupSheet({ open, onClose, room, onToast }) {
  const { group } = useApp();
  const [codeHidden, toggleCode] = useHiddenCode();
  const link = useInvite(group?.code, onToast);
  const code = useInvite(group?.code, onToast, { what: "code" });
  if (!group) return null;
  const own = Boolean(room) && room.groupCode === group.code && !room.matchmaking;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tu grupo"
      size="md"
      className="tv-groupsheet"
    >
      <div className="tv-codebox">
        <div className="tv-codebox-head">
          <span className="tv-section-label">Código del grupo</span>
          {/* Hides the code on this device's screens, for streaming. */}
          <button
            type="button"
            className={`tv-textbtn${codeHidden ? " is-on" : ""}`}
            onClick={toggleCode}
            aria-pressed={codeHidden}
            aria-label={codeHidden ? "Mostrar el código" : "Ocultar el código"}
          >
            <Icon name={codeHidden ? "eye-off" : "eye"} size={16} strokeWidth={2.4} />
            {codeHidden ? "Oculto" : "Ocultar"}
          </button>
        </div>
        <p className={`tv-codebox-code${codeHidden ? " is-hidden" : ""}`}>{shownCode(group.code, codeHidden)}</p>
        <div className="tv-codebox-actions">
          <button type="button" className="tv-btn tv-btn--neutral" onClick={code.copy}>
            <Icon name={code.copied ? "check" : "copy"} size={18} strokeWidth={2.6} />
            {code.copied ? "¡Copiado!" : "Copiar código"}
          </button>
          <button type="button" className="tv-btn tv-btn--neutral" onClick={link.copy}>
            <Icon name={link.copied ? "check" : "link"} size={18} strokeWidth={2.6} />
            {link.copied ? "¡Copiado!" : "Copiar enlace"}
          </button>
        </div>
      </div>
      {own ? <PartyPanel room={room} onToast={onToast} group className="tv-party--sheet" /> : <GroupMembers group={group} onToast={onToast} />}
    </Modal>
  );
}

// The group's players outside its private match: the leader's crown, and who isn't with the group now. The
// leader can make someone else the leader or take them out; then their friends' options and friends to invite.
function GroupMembers({ group, onToast }) {
  const { user, giveLeader, kickFromGroup } = useApp();
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
      <div className="tv-party-title">
        <h2>En el grupo</h2>
        <span>{group.members.length === 1 ? "1 jugador" : `${group.members.length} jugadores`}</span>
      </div>
      <ul className="tv-party-players" aria-label="Jugadores del grupo">
        {group.members.map((m) => {
          const isMe = m.id === user?.id;
          const leads = m.id === group.leaderId;
          const tag = !m.connected ? "Reconectando…" : !m.here ? "En otra partida" : leads ? "Líder" : "En el grupo";
          return (
            <li key={m.id} className={`tv-player${isMe ? " is-me" : ""}${m.connected && m.here ? "" : " is-away"}`}>
              <div className="tv-player-btn tv-groupmember">
                <Avatar name={m.name} avatar={m.avatar} />
                <span className="tv-player-text">
                  <span className="tv-player-name">{m.name}</span>
                  <span className={`tv-player-tag${leads ? " is-host" : ""}`}>{tag}</span>
                </span>
                {leads && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-player-crown" />}
                {isLeader && !isMe && (
                  <span className="tv-groupmember-tools">
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
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <InviteFriends group={group} onToast={onToast} />
    </div>
  );
}
