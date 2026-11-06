import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import { profilePath } from "./PlayerName.jsx";

// What tapping a player of "Tu grupo" (Inicio's box) unfolds under their name, the same as a match's scoreboard
// (PlayerMenu), with the group's actions: for the leader, on the others, the settings' permission, taking them out of the
// group and making them the leader (taking out and making the leader ask for a second tap); and for everyone their profile (faded and doing nothing on
// a guest, who has none). Few buttons have room for their names; the leader's four are only icons.
export default function GroupMemberMenu({ member, isMe, canManage, onClose, onToast }) {
  const { giveLeader, kickFromGroup, toggleGroupPermission } = useApp();
  const ref = useRef(null);
  // Which of the two asks for a second tap: "kick" or "leader" (tapping any other button takes it back).
  const [confirm, setConfirm] = useState(null);

  // The whole menu in sight: the box scrolls to it when it opens near the bottom.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useEffect(() => {
    const away = (e) => {
      if (!ref.current?.parentElement?.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  // The menu stays open after an action (the row only goes when the player is taken out).
  async function run(fn, okText) {
    try {
      const text = await fn();
      setConfirm(null);
      onToast?.(okText ?? text, "check");
    } catch (err) {
      setConfirm(null);
      onToast?.(err.message || "No se pudo completar");
    }
  }

  const named = !canManage;

  return (
    <div ref={ref} className="tv-player-menu" role="menu">
      {canManage && (
        <button
          type="button"
          role="menuitem"
          className={`tv-iconbtn tv-iconbtn--sm${member.canEditConfig ? " is-on" : ""}`}
          aria-label={`${member.canEditConfig ? "Quitarle" : "Darle"} a ${member.name} permiso de ajustes`}
          title={member.canEditConfig ? "Quitar permiso de ajustes" : "Dar permiso de ajustes"}
          onClick={() => (setConfirm(null), run(async () => ((await toggleGroupPermission(member.id)) ? `${member.name} ya puede cambiar los ajustes` : `${member.name} ya no puede cambiar los ajustes`)))}
        >
          <Icon name="sliders" size={16} strokeWidth={2.6} />
        </button>
      )}
      {canManage && (
        <button
          type="button"
          role="menuitem"
          className={`tv-iconbtn tv-iconbtn--sm${confirm === "kick" ? " is-on" : ""}`}
          data-sound={confirm === "kick" ? "next" : undefined}
          aria-label={confirm === "kick" ? "¿Seguro? Toca otra vez" : `Sacar a ${member.name} del grupo`}
          title={confirm === "kick" ? "¿Seguro? Toca otra vez" : "Sacar del grupo"}
          onClick={() => (confirm === "kick" ? run(() => kickFromGroup(member.id), `Sacaste a ${member.name} del grupo`) : setConfirm("kick"))}
        >
          <Icon name={confirm === "kick" ? "check" : "close"} size={16} strokeWidth={confirm === "kick" ? 2.4 : 2.8} />
        </button>
      )}
      {canManage && member.connected && (
        <button
          type="button"
          role="menuitem"
          className={`tv-iconbtn tv-iconbtn--sm${confirm === "leader" ? " is-on" : ""}`}
          data-sound={confirm === "leader" ? "next" : undefined}
          aria-label={confirm === "leader" ? "¿Seguro? Toca otra vez" : `Hacer líder a ${member.name}`}
          title={confirm === "leader" ? "¿Seguro? Toca otra vez" : "Hacer líder"}
          onClick={() => (confirm === "leader" ? run(() => giveLeader(member.id), `${member.name} es el líder ahora`) : setConfirm("leader"))}
        >
          <Icon name={confirm === "leader" ? "check" : "crown"} size={16} strokeWidth={2.4} />
        </button>
      )}
      {member.isGuest ? (
        <button type="button" role="menuitem" className="tv-iconbtn tv-iconbtn--sm is-none" aria-disabled="true" aria-label={`${member.name} juega como invitado: no tiene perfil`} title="Juega como invitado: no tiene perfil">
          <Icon name="user" size={16} strokeWidth={2.6} />
          {named && "Sin perfil"}
        </button>
      ) : (
        <Link role="menuitem" className="tv-iconbtn tv-iconbtn--sm" to={profilePath(member)} aria-label={isMe ? "Ver mi perfil" : `Ver el perfil de ${member.name}`} title={isMe ? "Ver mi perfil" : "Ver perfil"} onClick={onClose}>
          <Icon name="user" size={16} strokeWidth={2.6} />
          {named && (isMe ? "Mi perfil" : "Perfil")}
        </Link>
      )}
    </div>
  );
}
