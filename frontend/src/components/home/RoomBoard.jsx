import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

// The room's scoreboard across its matches (the server's `room.board`): each player's wins, most first, with players
// who already left still listed. Before the first match it invites to win it.
export default function RoomBoard({ room }) {
  const { user } = useApp();
  const board = room.board || { matches: 0, players: [] };
  const top = board.players[0]?.wins || 0;

  return (
    <section className="tv-board" aria-labelledby="tv-board-title">
      <div className="tv-board-head">
        <h3 id="tv-board-title" className="tv-board-title">
          Marcador de la sala
        </h3>
        {board.matches > 0 && (
          <span className="tv-board-count">{board.matches === 1 ? "1 partida" : `${board.matches} partidas`}</span>
        )}
      </div>
      {board.matches === 0 ? (
        <p className="tv-board-empty">
          <Icon name="crown" size={20} strokeWidth={1.8} filled />
          Aún no hay partidas. ¡Gana la primera!
        </p>
      ) : (
        <ol className="tv-board-list">
          {board.players.map((p, i) => {
            const leader = top > 0 && p.wins === top;
            const here = room.players.some((x) => x.id === p.id);
            return (
              <li
                key={p.id}
                className={`tv-board-row${leader ? " is-leader" : ""}${here ? "" : " is-gone"}`}
                style={{ "--i": i }}
              >
                <span className="tv-board-pos">{i + 1}</span>
                <Avatar name={p.name} avatar={p.avatar} />
                <span className="tv-board-name">{p.id === user?.id ? `${p.name} · tú` : p.name}</span>
                {leader && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-board-crown" />}
                <span className="tv-board-wins" title={`${p.wins} de ${p.played} partidas ganadas`}>
                  {p.wins}
                  <small>{p.wins === 1 ? "victoria" : "victorias"}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
