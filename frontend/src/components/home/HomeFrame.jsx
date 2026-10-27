import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { findMode } from "../../modes/index.js";
import { useApp } from "../../lib/store.jsx";
import { useFriends } from "../../lib/friends.jsx";
import { audienceName, isPublicGame, rememberPlan, useLocalPlan } from "../../lib/plan.js";
import { withSound } from "../../lib/sounds.js";
import GroupBar from "./GroupBar.jsx";
import GroupSheet from "./GroupSheet.jsx";
import Icon from "./Icon.jsx";
import JoinSheet from "./JoinSheet.jsx";
import ModeStage from "./ModeStage.jsx";
import PlanSheet from "./PlanSheet.jsx";
import PlaySheet from "./PlaySheet.jsx";
import { useStartGame } from "./ModeStart.jsx";
import { useInvite } from "./useInvite.js";
import { publicMatchLine } from "./matchInfo.js";
import "../../styles/lobby.css";

// Inicio, the group's room and the search for a public match are one screen: the game's big card in the middle (with,
// in the group's room, its settings behind a summary) and the group's bar at the bottom ("Tu grupo", "Vas a jugar" and
// the one yellow button). Arriba la info, al centro el juego, abajo tu grupo y la acción.
//  - Without a room (Inicio): the plan is this device's (lib/plan.js). "Partida pública" searches for a public
//    match of the game; "Partida privada" makes the group's room (picking a game for it, "+" or EMPEZAR, which also
//    starts it). "Unirse" goes into another group with its code.
//  - In the group's room, while it waits: the game's own lobby (ModeStage and its settings) and the room's plan, which
//    only the host changes; JUGAR takes the whole group to a public match of the game, EMPEZAR starts the group's own.
//  - Searching (a public room that waits): the card says how the search goes and the button cancels it (for a group,
//    everyone goes back to the group's room).
// Without a name (a guest's first time), the name is asked first (PlaySheet) and then it does what was asked.
export default function HomeFrame({ room = null, onToast, Lobby = null, leaving = false }) {
  const { user, isCentral, createRoom, joinRoom, findMatch, startGame, setGame, setAudience, findPublicForGroup, closePublic, leaveRoom } = useApp();
  const friends = useFriends();
  const nav = useNavigate();
  const [localPlan, updateLocalPlan] = useLocalPlan();
  const [sheet, setSheet] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invite = useInvite(room?.code, onToast);
  const start = useStartGame(room || { players: [], game: null });

  const searching = Boolean(room?.matchmaking);
  const group = room?.matchmaking?.group || null;
  const inGroup = Boolean(group?.members.includes(user?.id));
  const isHost = room ? room.hostId === user?.id && !isCentral : true;
  const plan = room && !searching ? { game: room.game, audience: room.audience || "grupo" } : room ? { game: room.matchmaking.game || "opciones", audience: "publica" } : localPlan;
  const mode = findMode(plan.game) || findMode("opciones");
  const needsName = !user?.name || user.isGuest;

  // Leaving the room later finds the same game and side on Inicio.
  useEffect(() => {
    if (room && !searching) rememberPlan(room);
  }, [room?.game, room?.audience, searching]);

  useEffect(() => setError(""), [plan.game, plan.audience, room?.code]);

  function run(action) {
    if (needsName) {
      setError("");
      setPending(action);
      return Promise.resolve();
    }
    return perform(action);
  }

  async function perform(action) {
    setBusy(true);
    setError("");
    try {
      await withSound(async () => {
        if (action.type === "match") await findMatch("casual", undefined, undefined, action.game);
        else if (action.type === "join") await joinRoom(action.code);
        else {
          await createRoom("multi", {}, action.game, undefined, action.audience);
          if (action.then === "start") await startGame();
        }
      });
      if (action.then === "group") setSheet("group");
      if (action.type === "join") setSheet(null);
    } catch (err) {
      // Already playing in that room from another device: CentralOffer asks about this one instead. A code that didn't
      // work is said in "Unirse" itself.
      if (action.type === "join") throw err;
      if (!err.offer) setError(err.message || "Algo salió mal, inténtalo otra vez");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await withSound(fn);
    } catch (err) {
      setError(err.message || "Algo salió mal, inténtalo otra vez");
    } finally {
      setBusy(false);
    }
  }

  function chooseAudience(audience) {
    if (!room) return updateLocalPlan({ audience });
    act(async () => {
      // "Partida pública" can't play Rey de la colina or Farsante: back to Trivia.
      if (audience === "publica" && !isPublicGame(room.game)) await setGame("opciones");
      await setAudience(audience);
    });
  }

  function chooseGame(game) {
    setSheet(null);
    if (room) {
      if (game !== room.game) act(() => setGame(game));
      return;
    }
    updateLocalPlan({ game });
    // A game for the group: the group's room, straight away (its code to invite, its settings).
    if (plan.audience === "grupo") run({ type: "create", game, audience: "grupo" });
  }

  function cancelSearch() {
    if (inGroup) return act(closePublic);
    leaveRoom();
    nav("/", { replace: true });
  }

  // The yellow button: what it says and does here.
  let action = null;
  let note = "";
  if (searching) {
    action = { label: "Cancelar", neutral: true, sound: "back", onClick: cancelSearch, disabled: busy };
  } else if (room && !isHost) {
    note = `Esperando a ${room.hostName || "el anfitrión"}…`;
  } else if (plan.audience === "publica") {
    const ok = isPublicGame(plan.game);
    action = {
      label: busy ? "Buscando…" : "Jugar",
      sound: "none",
      disabled: busy || !ok || (room && !room.players.some((p) => p.connected)),
      onClick: () => (room ? act(findPublicForGroup) : run({ type: "match", game: plan.game })),
    };
  } else {
    action = {
      label: busy || start.busy ? "Empezando…" : "Empezar",
      sound: "none",
      disabled: busy || (room ? !start.canStart : false),
      onClick: () => (room ? start.start() : run({ type: "create", game: plan.game, audience: "grupo", then: "start" })),
    };
  }

  const me = { id: user?.id || "me", name: user?.name || "Tú", avatar: user?.avatar, connected: true };
  const members = !room
    ? [me]
    : searching
    ? room.players.filter((p) => (inGroup ? group.members.includes(p.id) : p.id === user?.id))
    : room.players;
  const planText = plan.audience === "publica" ? `${mode.name} · ${audienceName("publica")}` : `Grupo · ${mode.fullName || mode.name}`;

  return (
    <div className={`tv-lobby${leaving ? " is-leaving" : ""}`}>
      <div className="tv-lobby-stage">
        {searching ? (
          <SearchCard room={room} mode={mode} />
        ) : room && Lobby ? (
          <div key={room.game} className="tv-lobby-game">
            <Lobby room={room} onToast={onToast} />
          </div>
        ) : room ? (
          <ModeStage mode={{ id: "none", name: "Elige un juego", icon: "grid", color: "neutral", steps: [] }} title={isHost ? "Elige un juego" : `${room.hostName || "El anfitrión"} está eligiendo`} />
        ) : (
          <>
            <ModeStage mode={mode} audience={plan.audience} swapKey={`${mode.id}:${plan.audience}`} />
            {plan.audience === "grupo" && (
              <p className="tv-lobby-hint">
                <Icon name="users" size={16} strokeWidth={2.6} />
                Toca + para crear tu grupo e invitar a tus amigos.
              </p>
            )}
          </>
        )}
      </div>

      <GroupBar
        members={members}
        meId={me.id}
        code={room && !searching ? room.code : null}
        copied={invite.copied}
        onCopy={invite.copy}
        onInvite={() => (room && !searching ? setSheet("group") : !room ? run({ type: "create", game: plan.game, audience: plan.audience, then: "group" }) : null)}
        inviteBadge={isHost ? room?.joinRequests?.length || 0 : 0}
        onJoin={searching ? null : () => setSheet("join")}
        plan={plan}
        planText={planText}
        planLocked={searching}
        onPlan={() => setSheet("plan")}
        action={action}
        note={note}
        error={error || start.err}
      />

      <PlanSheet
        open={sheet === "plan"}
        onClose={() => setSheet(null)}
        plan={plan}
        onAudience={chooseAudience}
        onGame={chooseGame}
        readOnly={Boolean(room) && !isHost}
        hostName={room?.hostName}
      />
      <GroupSheet open={sheet === "group" && Boolean(room)} onClose={() => setSheet(null)} room={room && !searching ? room : null} onToast={onToast} />
      <JoinSheet open={sheet === "join"} onClose={() => setSheet(null)} onJoin={(code) => run({ type: "join", code })} />
      {/* Without a name, the sheet asks for it (as it always did) and then it does what was asked. */}
      {createPortal(
        <PlaySheet
          askName
          open={Boolean(pending)}
          onClose={() => setPending(null)}
          onNamed={() => {
            const next = pending;
            setPending(null);
            setSheet(null);
            perform(next).catch((err) => !err?.offer && setError(err?.message || "No pudimos entrar a ese grupo"));
          }}
        />,
        document.querySelector(".tv-app") || document.body
      )}
    </div>
  );
}

// A public room while it fills: the game's card says it's searching ("Buscando jugadores de Trivia…"), for how long, the
// game's queue and how many were found; once full, that it starts.
function SearchCard({ room, mode }) {
  const info = room.matchmaking;
  const found = room.players.filter((p) => p.connected).length;
  const full = Boolean(info.startsAt);
  const since = useSearchStart(room.code);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), full ? 200 : 500);
    return () => clearInterval(id);
  }, [full]);
  const waited = Math.max(0, Math.floor((now - since) / 1000));
  const clock = `${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, "0")}`;
  const startsIn = full ? Math.max(1, Math.ceil((info.startsAt - (now + (room.clockOffset || 0))) / 1000)) : null;
  // The roulette's matches (an older way in) have no game of their own.
  const name = info.game ? mode.name : "una partida";
  const steps = [
    { icon: "hourglass", text: full ? `Empieza en ${startsIn}` : `${clock} buscando` },
    { icon: "grid", text: info.game ? `Fila de ${mode.name} · ${publicMatchLine(info.game)}` : "Partida casual · 2 juegos al azar" },
    { icon: "users", text: `Jugadores encontrados: ${found} de ${info.size}` },
  ];
  return (
    <ModeStage
      mode={info.game ? mode : { ...mode, color: "site", icon: "bolt" }}
      title={full ? "¡Partida completa!" : `Buscando jugadores de ${name}…`}
      steps={steps}
      tag={audienceName("publica")}
      swapKey={full ? "full" : "search"}
    />
  );
}

// When this device started searching in a room (sessionStorage, so a reload keeps counting from the same moment).
function useSearchStart(code) {
  const [since] = useState(() => {
    const key = `trivially_search_since_${code}`;
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (saved > 0) return saved;
      const t = Date.now();
      sessionStorage.setItem(key, String(t));
      return t;
    } catch {
      return Date.now();
    }
  });
  return since;
}
