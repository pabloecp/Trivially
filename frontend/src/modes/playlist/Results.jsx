import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchSummarySheet from "../../components/home/MatchSummarySheet.jsx";
import { Podium, PodiumCard, RankingCard, countText } from "../../components/home/ResultsParts.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import TvShell from "../../components/home/TvShell.jsx";
import { useApp } from "../../lib/store.jsx";
import { PlaylistProgress, winsText } from "./Standings.jsx";
import { findMode } from "../index.js";
import { MATCH_KINDS } from "../../components/home/matchInfo.js";
import { exitPath } from "../../components/home/TvTopbar.jsx";
import { withSound } from "../../lib/sounds.js";
import "../../styles/home.css";
import "../../styles/playlist.css";
import { resolveCode, urlCode } from "../../lib/hiddenCode.js";

// The end of a playlist (route /playlist/:code), in the same frame as a match's end (MatchResults): the title, the
// podium (games won, or points when it was played mixed) and the ranking side by side (everyone's games won and points,
// a dot per round of every game; this player's answers a tap away), and the host's two buttons, the same size, in the
// middle: go back to its panel or play the playlist again (shuffled again if it's random).
function ResultsScreen() {
  const { code: codeParam } = useParams();
  const { user, room, isCentral, joinRoom, replayGame, restartGame, leaveRoom, findMatch } = useApp();
  const [searching, setSearching] = useState(false);
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  const [err, setErr] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  // Join the room after a reload. Going back to the room screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (!room || room.code !== code) joinRoom(code).catch(() => nav("/"));
  }, [code]);

  if (!room) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          Conectando a la sala…
        </p>
      </div>
    );
  }

  // The room's central device only shows the results; what comes next is the host's.
  const isHost = room.hostId === user?.id && !isCentral;
  const run = room.run;
  const standings = run?.standings || [];
  const winner = standings.find((p) => p.id === run?.winnerId) || null;
  const solo = standings.length < 2;
  // A public match ("Casual" or "Competitivo") is played as a playlist of its games, but it's called a match.
  const publicMatch = room.matchmaking || null;
  // So is a Clásico of a private room (Normal or Extendido): its host still decides what comes next.
  const classic = findMode(run?.classic);
  const what = publicMatch || classic ? "partida" : "playlist";
  let title = `¡Fin de la ${what}!`;
  if (winner && !solo) title = `¡${winner.name} gana la ${what}!`;
  else if (!winner && standings.length > 1 && (standings[0]?.wins > 0 || run?.bestOf)) title = "¡Empate!";
  // Every playlist is one match now (`mixed`; "aleatorio" also shuffles its rounds): the most points win. A public
  // match (`bestOf`) is won by games won instead, its points breaking a tie.
  const mixed = Boolean(run?.mixed) && !run?.bestOf;
  // A tie (nobody won): everyone with as much as first place shares the top step of the podium.
  const key = (p) => (mixed ? p.points : p.wins);
  const tied = title === "¡Empate!" && standings.length > 1 ? standings.filter((p) => key(p) === key(standings[0])).length : 0;
  const pointsText = (p) => `${p.points.toLocaleString("es-ES")} pts`;
  // This player's rounds of every game, numbered one after another (none on the central device).
  const me = isCentral ? null : standings.find((p) => p.id === user?.id) || null;
  const myRounds = (me?.rounds || []).map((r, i) => ({ ...r, round: i + 1 }));
  let hint = null;
  if (mixed && winner) hint = `${pointsText(winner)} en ${run.total === 1 ? "1 juego" : `${run.total} juegos`}${run.order === "aleatorio" ? " mezclados" : ""}`;
  else if (mixed && standings[0]?.wins > 0) hint = "Mismos puntos";
  else if (winner && solo && !run.bestOf) hint = `Ganaste ${run.played.filter((g) => g.winnerId === winner.id).length} de ${run.total} juegos`;
  else if (winner) hint = `Ganó ${winner.wins} de ${run.total} ${run.total === 1 ? "juego" : "juegos"}`;
  else if (run?.bestOf && standings.length > 1) hint = "Nadie ganó: terminaron con las mismas victorias";
  else if (standings[0]?.wins > 0) hint = "Mismos juegos ganados y mismos puntos";

  return (
    <div className="tv-room tv-game">
      <div className="tv-room-main">
        <section className="tv-game-stage tv-results">
          <Confetti />
          <header className="tv-res-head">
            <div className="tv-res-heading">
              <div className="tv-res-kicker">
                <p className="tv-mono-label">{publicMatch || classic ? "Partida terminada" : "Playlist terminada"}{run ? ` · ${run.name}` : ""}</p>
                {run && <PlaylistProgress run={run} />}
              </div>
              <h1 className="tv-page-title tv-results-title">{title}</h1>
              {hint && <p className="tv-hint">{hint}</p>}
            </div>
          </header>

          {run && (
            <div className="tv-res-cards tv-res-cards--pair">
              <PodiumCard
                meta={`${countText(standings.length, "jugador", "jugadores")} · ${countText(run.total, "juego", "juegos")}`}
              >
                <Podium players={standings} meId={me?.id} score={mixed ? pointsText : (p) => winsText(p.wins)} tied={tied} />
              </PodiumCard>
              <RankingCard
                icon={classic?.icon || (publicMatch && MATCH_KINDS[publicMatch.kind]?.icon) || "playlist"}
                color={classic?.color || (publicMatch && MATCH_KINDS[publicMatch.kind]?.color) || "playlist"}
                title={run.name}
                players={standings}
                meId={me?.id}
                onOpen={myRounds.length ? () => setShowSummary(true) : null}
                value={(p) => (mixed ? pointsText(p) : `${winsText(p.wins)} · ${pointsText(p)}`)}
              />
            </div>
          )}

          {err && <p className="tv-lobby-error" role="alert">{err}</p>}

          <footer className="tv-res-foot">
            {publicMatch && !isCentral ? (
              // Nobody is the host of a public match: everyone chooses for themselves.
              <>
                <button
                  className="tv-btn tv-c-neutral tv-res-btn"
                  data-sound="back"
                  onClick={() => {
                    leaveRoom();
                    nav(exitPath(room), { replace: true });
                  }}
                  type="button"
                >
                  <Icon name="logout" size={18} />
                  Salir
                </button>
                <button
                  className={`tv-btn tv-c-${MATCH_KINDS[publicMatch.kind]?.color || "music"} tv-shine tv-res-btn`}
                  data-sound="none"
                  disabled={searching}
                  onClick={() => {
                    setSearching(true);
                    withSound(() => findMatch(publicMatch.kind, publicMatch.versus || 5), null)
                      // This address is the old room's, which RoomNavigator leaves alone: go to the new one's screen.
                      .then((next) => nav(`/sala/${urlCode(next.code)}`, { replace: true }))
                      .catch((e) => {
                        setErr(e.message || "No se pudo buscar otra partida");
                        setSearching(false);
                      });
                  }}
                  type="button"
                >
                  <Icon name="play" size={18} filled strokeWidth={1.5} />
                  {searching ? "Buscando…" : "Buscar otra partida"}
                </button>
              </>
            ) : isHost ? (
              <>
                <button
                  className="tv-btn tv-c-neutral tv-res-btn"
                  data-sound="back"
                  onClick={() => restartGame().catch((e) => setErr(e.message || "No se pudo volver al lobby"))}
                  type="button"
                >
                  <Icon name="back" size={18} />
                  {classic ? "Volver al lobby" : "Volver a la playlist"}
                </button>
                {run && (
                  <button
                    className={`tv-btn tv-c-${classic?.color || "playlist"} tv-shine tv-res-btn`}
                    onClick={() => replayGame().catch((e) => setErr(e.message || "No se pudo empezar otra vez la playlist"))}
                    type="button"
                  >
                    <Icon name={run.order === "aleatorio" ? "shuffle" : "play"} size={20} strokeWidth={2.6} />
                    Jugar otra vez
                  </button>
                )}
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
      <PartyPanel room={room} display={isCentral} onToast={setErr} />
      <MatchSummarySheet open={showSummary} rounds={myRounds} title={classic || publicMatch ? "Tu partida" : "Tu playlist"} showGame onClose={() => setShowSummary(false)} />
    </div>
  );
}

export default function PlaylistResults() {
  return (
    <TvShell mode="playlist">
      <ResultsScreen />
    </TvShell>
  );
}
