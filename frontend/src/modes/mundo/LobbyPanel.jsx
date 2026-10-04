import { useState } from "react";
import Avatar from "../../components/home/Avatar.jsx";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";
import { ROUNDS, SECONDS, Stepper } from "../music/MusicSettings.jsx";

// Geografía's waiting room, inside the room screen on Home: rounds and seconds per question, and a match summary.
// The start button lives in PartyPanel (modes/music/StartButton.jsx is shared: it only needs `songsReady`).
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const [draft, setDraft] = useState({ rounds: room.config?.rounds || 10, roundMs: room.config?.roundMs || 15000 });
  // Others' changes arrive through the room; ours show right away.
  const rounds = canEdit ? draft.rounds : room.config?.rounds || 10;
  const roundMs = canEdit ? draft.roundMs : room.config?.roundMs || 15000;
  const seconds = Math.round(roundMs / 1000);
  const minutes = Math.max(1, Math.round((rounds * (3 + seconds + 3)) / 60));
  const connected = room.players.filter((p) => p.connected);
  const short = room.songsReady != null && room.songsReady < rounds;

  async function save(change) {
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ rounds: next.rounds, roundMs: next.roundMs });
    } catch (err) {
      setDraft({ rounds: room.config?.rounds || 10, roundMs: room.config?.roundMs || 15000 });
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  return (
    <div className="tv-lobby-grid has-settings">
      <section className="tv-card tv-settings" aria-labelledby="tv-settings-title">
        <h2 id="tv-settings-title" className="tv-card-title">Ajustes de la partida</h2>
        {!canEdit && (
          <p className="tv-readonly-note">
            <Icon name="lock" size={15} strokeWidth={2.6} />
            Solo {room.hostName || "el host"} puede cambiar los ajustes
          </p>
        )}
        <fieldset className="tv-steppers" disabled={!canEdit}>
          <Stepper label="Rondas" value={rounds} limits={ROUNDS} onChange={(n) => save({ rounds: n })} />
          <Stepper label="Segundos por ronda" value={seconds} unit="s" limits={SECONDS} onChange={(n) => save({ roundMs: n * 1000 })} />
        </fieldset>
        {short && (
          <p className="tv-playlist-total is-short" role="status">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Hay <strong>{room.songsReady} preguntas listas</strong> para {rounds} rondas. Baja las rondas.
            </span>
          </p>
        )}
      </section>

      <section className="tv-card tv-match" aria-label="Resumen de la partida">
        <h2 className="tv-card-title">Resumen de la partida</h2>
        <div className="tv-match-preview">
          <span className="tv-badge tv-c-world" aria-hidden="true">
            <Icon name="globe" size={28} />
          </span>
          <p className="tv-match-title">
            <strong>{rounds}</strong> preguntas
          </p>
          <div className="tv-match-chips">
            <span className="tv-match-chip">
              <Icon name="bolt" size={14} strokeWidth={2.6} />
              {seconds} s cada una
            </span>
            <span className="tv-match-chip">
              <Icon name="globe" size={14} strokeWidth={2.6} />
              Respuesta escrita
            </span>
            <span className="tv-match-chip">≈ {minutes} min</span>
          </div>
          <div className="tv-match-players">
            <span className="tv-avatar-stack" aria-hidden="true">
              {connected.slice(0, 5).map((p) => (
                <Avatar key={p.id} name={p.name} avatar={p.avatar} />
              ))}
            </span>
            {connected.length === 1 ? "1 jugador en la sala" : `${connected.length} jugadores en la sala`}
          </div>
        </div>
      </section>
    </div>
  );
}
