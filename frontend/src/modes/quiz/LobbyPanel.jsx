import QuizSettings from "./QuizSettings.jsx";
import Icon from "../../components/home/Icon.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import { OPTION_LETTERS, QUIZ_REVEAL_S, findDifficulty, quizConfig } from "./quizInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";

// "Opción múltiple" waiting room, shown inside the room screen on Home once the host picks this game: the mode's big
// card (summary of the match and the start button) and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const { rounds, roundMs, difficulty } = quizConfig(room);
  const seconds = Math.round(roundMs / 1000);
  const level = findDifficulty(difficulty);
  // Each question: 3 s countdown + the answering time + the reveal.
  const minutes = Math.max(1, Math.round((rounds * (3 + seconds + QUIZ_REVEAL_S)) / 60));
  // A match needs a different question for every round (the server checks it too).
  const enough = room.questionsReady == null || room.questionsReady >= rounds;

  return (
    <>
      <ModeStage
        room={room}
        mode={findMode("opciones")}
        chips={[`${rounds} preguntas`, `${seconds} s cada una`, `Dificultad ${level.label.toLowerCase()}`, `≈ ${minutes} min`]}
        extra={
          <span className="tv-quiz-tiles tv-quiz-tiles--stage" aria-hidden="true">
            {OPTION_LETTERS.map((letter, i) => (
              <span key={letter} className={`tv-quiz-tile tv-opt-${i}`} style={{ "--i": i }}>
                {letter}
              </span>
            ))}
          </span>
        }
      >
        <ModeStart room={room} ready={enough} />
      </ModeStage>

      <QuizSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEditConfig}>
        {!enough && (
          <p className="tv-playlist-total is-short" role="status">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Solo hay <strong>{room.questionsReady} preguntas</strong> de esa dificultad. Baja el número de preguntas o
              elige otra dificultad.
            </span>
          </p>
        )}
        <p className="tv-settings-note">
          <Icon name="info" size={16} strokeWidth={2.2} />
          Las respuestas se revelan a la vez al terminar cada pregunta.
        </p>
      </QuizSettings>
    </>
  );
}
