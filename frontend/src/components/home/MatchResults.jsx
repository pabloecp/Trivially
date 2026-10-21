import { useState } from "react";
import Confetti from "./Confetti.jsx";
import Icon from "./Icon.jsx";
import MatchSummarySheet from "./MatchSummarySheet.jsx";
import PartyPanel from "./PartyPanel.jsx";
import CountUp from "./CountUp.jsx";
import { Podium, PodiumCard, RankingCard, countText } from "./ResultsParts.jsx";
import { useApp } from "../../lib/store.jsx";
import { withSound } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";

// Kept here too for the screens that imported it from this file.
export { Podium };

// The end of a match in any game. A playlist is one match that ends on its own results (modes/playlist/Results.jsx).
export default function MatchResults({ room, color = "green" }) {
  return <MatchEnd room={room} color={color} />;
}

// A match's end, in the room's frame: the title, the podium and the ranking in two cards side by side (the game's icon
// and name, everyone's points and a dot per round; "Ver tus respuestas" opens every round with its answer) and
// the host's two buttons, the same size, in the middle: play again with the same settings, or back to the game's lobby.
// Everyone's results are also in the room's column (PartyPanel). `color` is the mode's tile colour for "Volver a jugar".
function MatchEnd({ room, color }) {
  const { user, isCentral, restartGame, replayGame } = useApp();
  const [err, setErr] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  // The room's central device shows the results; what comes next is the host's, from their phone.
  const isHost = room.hostId === user?.id && !isCentral;

  const top = room.results;
  const winner = top[0];
  // Geografía, Rango and Campo de minas settle a tie for first place with tiebreak rounds; if none of them had a winner, the tie stands.
  const tied = Boolean(room.tiebreak) && !winner?.tiebreakWinner && top.length > 1 && top[1].score === winner.score;
  // This player's result and match round by round (none on the central device, which isn't a player).
  const mine = isCentral ? null : top.find((p) => p.id === user?.id) || null;
  const rounds = mine?.rounds || [];
  const questions = Math.max(0, ...top.map((p) => (p.rounds || []).length));
  const mode = findMode(room.game);

  return (
    <div className="tv-room tv-game">
      <div className="tv-room-main">
        <section className="tv-game-stage tv-results">
          <Confetti />
          <header className="tv-res-head">
            <div className="tv-res-heading">
              <p className="tv-mono-label">Partida terminada</p>
              <h1 className="tv-page-title tv-results-title">
                {tied ? "¡Empate!" : top.length > 1 ? `¡Ganó ${winner?.name}!` : "¡Fin de la partida!"}
              </h1>
              {winner?.tiebreakWinner && <p className="tv-hint">Ganó en el desempate</p>}
            </div>
          </header>

          <div className="tv-res-cards tv-res-cards--pair">
            <PodiumCard
              meta={`${countText(top.length, "jugador", "jugadores")}${questions ? ` · ${countText(questions, "pregunta", "preguntas")}` : ""}`}
            >
              <Podium players={top} meId={mine?.id} />
            </PodiumCard>
            <RankingCard
              icon={mode?.icon}
              color={mode?.color}
              title={mode?.name || "Clasificación"}
              players={top}
              meId={mine?.id}
              onOpen={rounds.length ? () => setShowSummary(true) : null}
              value={(p) => <><CountUp value={p.score} /> pts</>}
            />
          </div>

          {err && <p className="tv-lobby-error" role="alert">{err}</p>}

          <footer className="tv-res-foot">
            {isHost ? (
              <>
                <button
                  type="button"
                  className="tv-btn tv-c-neutral tv-res-btn"
                  data-sound="back"
                  onClick={() => restartGame().catch((e) => setErr(e.message || "No se pudo volver al lobby"))}
                >
                  <Icon name="back" size={18} />
                  Volver al lobby
                </button>
                <button
                  className={`tv-btn tv-c-${color} tv-shine tv-res-btn`}
                  onClick={() => withSound(replayGame).catch((e) => setErr(e.message || "No se pudo empezar otra partida"))}
                  type="button"
                  data-sound="none"
                >
                  <Icon name="play" size={20} filled strokeWidth={1.5} />
                  Volver a jugar
                </button>
              </>
            ) : (
              <p className="tv-res-wait">
                <span className="tv-pulse" aria-hidden="true" />
                Esperando a que el anfitrión decida qué jugar
              </p>
            )}
          </footer>
        </section>
      </div>
      <PartyPanel room={room} scores display={isCentral} onToast={setErr} />
      <MatchSummarySheet open={showSummary} rounds={rounds} onClose={() => setShowSummary(false)} />
    </div>
  );
}
