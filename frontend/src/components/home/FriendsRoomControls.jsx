import { useFriends } from "../../lib/friends.jsx";
import Avatar from "./Avatar.jsx";
import Segmented from "./Segmented.jsx";

// In the room card, for the host (when their account has friends): what their friends can do from the friends tab
// (join straight away, ask to join, or only by invitation), and the friends who are asking, to let in or turn down.
export default function FriendsRoomControls({ room, onToast }) {
  const friends = useFriends();
  if (!friends.isAccount) return null;
  const requests = room.joinRequests || [];

  async function setMode(mode) {
    try {
      await friends.setJoinMode(mode);
    } catch (err) {
      onToast?.(err.message || "No se pudo cambiar");
    }
  }

  async function answer(request, accept) {
    try {
      await friends.answerJoin(request.userId, accept);
      onToast?.(accept ? `${request.name} está entrando…` : `Rechazaste a ${request.name}`, accept ? "check" : "lock");
    } catch (err) {
      onToast?.(err.message || "No se pudo responder");
    }
  }

  return (
    <div className="tv-fr-room">
      {requests.map((r) => (
        <div key={r.userId} className="tv-fr-ask" role="group" aria-label={`${r.name} quiere unirse`}>
          <Avatar name={r.name} avatar={r.avatar} />
          <p className="tv-fr-ask-text">
            <strong>{r.name}</strong> quiere unirse
          </p>
          <button type="button" className="tv-btn tv-c-green" onClick={() => answer(r, true)}>
            Aceptar
          </button>
          <button type="button" className="tv-btn tv-c-neutral" onClick={() => answer(r, false)} aria-label={`Rechazar a ${r.name}`}>
            ×
          </button>
        </div>
      ))}
      <p className="tv-fr-room-label">Tus amigos pueden</p>
      <Segmented
        label="Qué pueden hacer tus amigos"
        value={room.joinMode || "solicitud"}
        onChange={setMode}
        options={[
          { value: "abierta", label: "Unirse" },
          { value: "solicitud", label: "Pedir entrar" },
          { value: "invitacion", label: "Solo invitación" },
        ]}
      />
    </div>
  );
}
