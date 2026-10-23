import MatchGames from "../../components/home/MatchGames.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import { findMode } from "../index.js";
import "../../styles/match.css";

// A Clásico's waiting room (Normal or Extendido), inside the room screen on Home: its big card with the start button,
// and beside it the games the roulette picks from, like a public match's. There is nothing to set: it's played like
// Casual, with the room's players (RoomManager.startClassic).
export default function LobbyPanel({ room }) {
  const mode = findMode(room.game);

  return (
    <>
      <ModeStage room={room} mode={mode}>
        <ModeStart room={room} />
      </ModeStage>

      <section className="tv-settings-card tv-settings-panel" aria-labelledby="tv-classic-games">
        <div className="tv-settings-head">
          <h2 id="tv-classic-games" className="tv-settings-title">
            Juegos
          </h2>
        </div>
        <p className="tv-picker-sub">
          La ruleta elige {mode.games} de estos juegos. Cada uno se juega a 5 rondas, menos Campo de minas, que tiene 3.
        </p>
        <MatchGames compact />
      </section>
    </>
  );
}
