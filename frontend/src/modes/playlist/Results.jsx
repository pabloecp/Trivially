import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchSummarySheet from "../../components/home/MatchSummarySheet.jsx";
import { Podium, PodiumCard, ResultsFoot, countText } from "../../components/home/ResultsParts.jsx";
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
import { useResultsLook } from "../../lib/ownerView.js";
import { GamesWon, RetouchCard } from "../../components/home/ResultsLooks.jsx";
import { findVariant } from "../../components/home/matchInfo.js";

// The end of a playlist (route /playlist/:code), in the same frame as a match's end (MatchResults): the title, the
// podium (games won, or points when it was played mixed) and the ranking side by side (everyone's games won and points,
// a dot per round of every game; this player's answers a tap away), and the host's two buttons, the same size, in the
// middle: go back to its panel or play the playlist again (shuffled again if it's random).
function ResultsScreen() {
  const { code: codeParam } = useParams();
  const { user, room, group, isCentral, joinRoom, replayGame, restartGame, leaveRoom, findMatch, groupHome } = useApp();
  const [searching, setSearching] = useState(false);
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  const [err, setErr] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  // The results' style and tone (everyone: "panel" in colour; an owner can try others).
  const { style, tone } = useResultsLook();

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
  // In a group, its leader decides what's next for everyone (when the group is here, "Volver" takes it back too).
  const followsLeader = Boolean(group) && group.leaderId !== user?.id;
  const leadsGroup = Boolean(group) && group.leaderId === user?.id && group.place?.code === room.code;
  // So is a Clásico of a private room (Normal or Extendido): its host still decides what comes next.
  const classic = findMode(run?.classic);
  const what = "partida";
  let title = `¡Fin de la ${what}!`;
  if (winner && !solo) title = `¡${winner.name} gana la ${what}!`;
  // Nobody won: the same points (in a playlist, also when nobody scored at all) or the same games won.
  else if (!winner && standings.length > 1 && (run?.mixed || standings[0]?.wins > 0 || run?.bestOf)) title = "¡Empate!";
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
  // Who is ringed in the new looks: the winner, or everyone who tied for first.
  const winners = winner && !solo ? [winner.id] : tied > 1 ? standings.slice(0, tied).map((p) => p.id) : [];
  const kindColor = classic?.color || (publicMatch && MATCH_KINDS[publicMatch.kind]?.color) || "playlist";
  // Under the title, instead of "Ganó 2 de 2 juegos": each game's icon with whoever won it (an older server sends no
  // results, and the line stays).
  const gamesWon = (run?.results || []).map((g) => {
    const mode = findMode(findVariant(g.variant)?.game || g.variant);
    return {
      icon: mode?.icon || "play",
      color: mode?.color || "neutral",
      winners: (g.winners || []).map((id) => standings.find((p) => p.id === id)).filter(Boolean),
    };
  });

  return (
    <div className="tv-room tv-game">
      <div className="tv-room-main">
        <section className="tv-game-stage tv-results">
          <Confetti />
          <header className="tv-res-head">
            <div className="tv-res-heading">
              <div className="tv-res-kicker">
                <p className="tv-mono-label">Partida terminada{run ? ` · ${run.name}` : ""}</p>
                {run && !gamesWon.length && <PlaylistProgress run={run} />}
              </div>
              <h1 className="tv-page-title tv-results-title">{title}</h1>
              {gamesWon.length ? <GamesWon items={gamesWon} /> : hint && <p className="tv-hint">{hint}</p>}
            </div>
          </header>

          {run && (
            <div className={`tv-res-cards tv-res-cards--pair rl-cards tv-c-${kindColor} is-${tone}`}>
              <PodiumCard
                meta={`${countText(standings.length, "jugador", "jugadores")} · ${countText(run.total, "juego", "juegos")}`}
              >
                <Podium players={standings} meId={me?.id} score={mixed ? pointsText : (p) => winsText(p.wins)} tied={tied} />
              </PodiumCard>
              <RetouchCard
                icon={classic?.icon || (publicMatch && MATCH_KINDS[publicMatch.kind]?.icon) || "playlist"}
                color={kindColor}
                title={run.name}
                players={standings}
                meId={me?.id}
                onOpen={myRounds.length ? () => setShowSummary(true) : null}
                points={(p) => p.points}
                wins={mixed ? null : (p) => p.wins}
                winners={winners}
                retouch={style}
                tone={tone}
              />
            </div>
          )}

          {err && <p className="tv-lobby-error" role="alert">{err}</p>}

          <ResultsFoot>
            {publicMatch && !isCentral && followsLeader ? (
              // A group's player: its leader decides what comes next for everyone; they can go back to Inicio alone
              // (still in the group) meanwhile.
              <>
                <button
                  className="tv-btn tv-c-neutral tv-res-btn"
                  data-sound="back"
                  aria-label="Volver al inicio"
                  onClick={() => {
                    leaveRoom();
                    nav(exitPath(room), { replace: true });
                  }}
                  type="button"
                >
                  <Icon name="back" size={18} />
                  <span className="tv-res-btn-label">Volver</span>
                </button>
                <p className="tv-res-wait">
                  <span className="tv-pulse" aria-hidden="true" />
                  Esperando a {group.leaderName}
                </p>
              </>
            ) : publicMatch && !isCentral ? (
              // Nobody is the host of a public match: everyone chooses for themselves (a group's leader, for the whole
              // group: back to Inicio together, or another match together).
              <>
                <button
                  className="tv-btn tv-c-neutral tv-res-btn"
                  data-sound="back"
                  aria-label={leadsGroup ? "Volver al inicio con tu sala" : "Salir"}
                  onClick={() => {
                    if (leadsGroup) {
                      withSound(groupHome, null)
                        .then(() => nav(exitPath(room), { replace: true }))
                        .catch((e) => setErr(e.message || "No se pudo volver al inicio"));
                      return;
                    }
                    leaveRoom();
                    nav(exitPath(room), { replace: true });
                  }}
                  type="button"
                >
                  <Icon name={leadsGroup ? "back" : "logout"} size={18} />
                  <span className="tv-res-btn-label">{leadsGroup ? "Volver" : "Salir"}</span>
                </button>
                <button
                  className="tv-btn tv-btn--primary tv-res-btn"
                  data-sound="none"
                  disabled={searching}
                  onClick={() => {
                    setSearching(true);
                    withSound(() => findMatch(publicMatch.kind, publicMatch.versus || 5, undefined, publicMatch.game), null)
                      // This address is the old room's, which RoomNavigator leaves alone: go to the new one's screen.
                      .then((next) => nav(`/partida/${urlCode(next.code)}`, { replace: true }))
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
                  aria-label={classic ? "Volver al lobby" : "Volver a la playlist"}
                  onClick={() => restartGame().catch((e) => setErr(e.message || "No se pudo volver al lobby"))}
                  type="button"
                >
                  <Icon name="back" size={18} />
                  <span className="tv-res-btn-label">{classic ? "Volver al lobby" : "Volver a la playlist"}</span>
                </button>
                {run && (
                  <button
                    className="tv-btn tv-btn--primary tv-res-btn"
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
          </ResultsFoot>
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
