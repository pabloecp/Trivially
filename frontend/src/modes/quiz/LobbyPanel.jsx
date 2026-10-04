import QuizSettings from "./QuizSettings.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";
import { OPTION_LETTERS, QUIZ_REVEAL_S, findDifficulty, quizConfig } from "./quizInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";

// "Opción múltiple" waiting room, shown inside the room screen on Home once the host picks this game: the match
// settings and a summary of the match. The start button lives in PartyPanel.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const connected = room.players.filter((p) => p.connected);

  const { rounds, roundMs, difficulty } = quizConfig(room);
  const seconds = Math.round(roundMs / 1000);
  const level = findDifficulty(difficulty);
  // Each question: 3 s countdown + the answering time + the reveal.
  const minutes = Math.max(1, Math.round((rounds * (3 + seconds + QUIZ_REVEAL_S)) / 60));
  const enough = room.questionsReady == null || room.questionsReady >= rounds;

  return (
    <div className="tv-lobby-grid has-settings">
      <QuizSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEditConfig} />

      <section className="tv-card tv-match" aria-label="Resumen de la partida">
        <h2 className="tv-card-title">Resumen de la partida</h2>

        <div className="tv-match-preview tv-quiz-preview">
          <div className="tv-quiz-tiles" aria-hidden="true">
            {OPTION_LETTERS.map((letter, i) => (
              <span key={letter} className={`tv-quiz-tile tv-opt-${i}`} style={{ "--i": i }}>
                {letter}
              </span>
            ))}
          </div>
          <p className="tv-match-title">
            <strong>{rounds}</strong> preguntas
          </p>
          <div className="tv-match-chips">
            <span className="tv-match-chip">
              <Icon name="bolt" size={14} strokeWidth={2.6} />
              {seconds} s cada una
            </span>
            <span className={`tv-match-chip tv-diff-chip tv-c-${level.color}`}>Dificultad {level.label.toLowerCase()}</span>
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

        {!enough && (
          <p className="tv-playlist-total is-short" role="status">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Solo hay <strong>{room.questionsReady} preguntas</strong> de esa dificultad. Baja el número de preguntas o
              elige otra dificultad.
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
