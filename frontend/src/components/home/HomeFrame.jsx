import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { findMode } from "../../modes/index.js";
import { useApp } from "../../lib/store.jsx";
import { CLASSIC, isPublicGame, rememberPlan, useLocalPlan } from "../../lib/plan.js";
import { withSound } from "../../lib/sounds.js";
import GroupBar, { useNarrow } from "./GroupBar.jsx";
import GroupSheet from "./GroupSheet.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ModeStage from "./ModeStage.jsx";
import PlanSheet from "./PlanSheet.jsx";
import PlaySheet from "./PlaySheet.jsx";
import { OpenSettingsContext } from "./SettingsPanel.jsx";
import { useStartGame } from "./ModeStart.jsx";
import { publicMatchLine } from "./matchInfo.js";
import "../../styles/lobby.css";

// The card when no game is chosen (Inicio on a new device, or a private match before its host picks one).
const CHOOSE = { id: "none", name: "Elige un juego", icon: "grid", color: "neutral", steps: [] };

// Inicio, a private match's lobby and the search for a public match are one screen: the game's big card in the middle
// (its settings behind a summary at its bottom) and the bar at the bottom (the group, "Vas a jugar" and the one yellow
// button). Arriba la info, al centro el juego, abajo tu grupo y la acción.
// The card's settings on Inicio: a public match's are the same for everyone, so they can't be changed (no "Ajustes");
// a private match's belong to its room, so "Ajustes" makes the match first (the group comes into it) and they open there.
// Nobody has a group to begin with, and nothing is chosen on a new device: the card says "Elige un juego" and JUGAR
// waits. Choosing a game makes your group straight away (your "sala": its code is on the bar to invite) and, on the
// private side, its match too; without one the bar only has "Unirse" with a friend's code. In a group, its faces, its
// code, "Invitar" and "Salir del grupo". A group only takes its players together: its leader decides and everyone goes
// (the server moves them, game/groups.js).
//  - On Inicio: the plan is this device's, or the group's (its leader's). "Partida pública" searches for a public match
//    of the game (for the whole group; the Clásico's is the roulette's, without a game); "Partida privada" makes the
//    private match (picking a game for it, or EMPEZAR, which also starts it), and the group goes into it.
//  - In a private match, while it waits: the game's own lobby (ModeStage and its settings), which only its host (the
//    group's leader) changes. Switching it to "Partida pública" goes back to Inicio (the whole group) to search.
//  - Searching (a public room that waits): the card says how the search goes and the leader's button cancels it (the
//    whole group goes back to Inicio).
//  - A group's player away from it (they went back alone, or came in while it plays a public match): "Ir con el grupo"
//    when they can go into its private match, otherwise they wait for it.
// Without a name (a guest's first time), the name is asked first (PlaySheet) and then it does what was asked.
export default function HomeFrame({ room = null, onToast, Lobby = null, leaving = false }) {
  const { user, group, isCentral, createRoom, findMatch, startGame, setGame, createGroup, checkGroup, joinGroup, leaveGroup, groupHome, setGroupPlan, leaveRoom } = useApp();
  const nav = useNavigate();
  const [localPlan, updateLocalPlan] = useLocalPlan();
  const [sheet, setSheet] = useState(null);
  const [pending, setPending] = useState(null);
  // "Salir del grupo" asks first.
  const [confirmLeave, setConfirmLeave] = useState(false);
  // What is being done ("match", "join", "group", "leave"...), or "".
  const [busyType, setBusyType] = useState("");
  const busy = Boolean(busyType);
  const [error, setError] = useState("");
  // What went wrong creating or joining a group: said under the group's side of the bar.
  const [groupError, setGroupError] = useState("");
  // "Ajustes" made the private match: its settings open as soon as its lobby shows (SettingsPanel).
  const [settingsAsked, setSettingsAsked] = useState(false);
  const start = useStartGame(room || { players: [], game: null });
  // Phones open "Tu grupo" from the top bar and have no group's bar to leave from: "Salir del grupo" goes in it.
  const phone = useNarrow();

  const searching = Boolean(room?.matchmaking);
  const isLeader = group ? group.leaderId === user?.id : true;
  // Who decides here: the host of a private match, and on Inicio (or searching) the group's leader, or you alone.
  const decides = room && !searching ? room.hostId === user?.id && !isCentral : isLeader;
  // The group is somewhere this player isn't (back on Inicio alone, or joined while it plays a public match).
  const away = Boolean(group?.place) && !room;
  const plan = searching
    ? { game: room.matchmaking.game || CLASSIC, audience: "publica" }
    : room
    ? { game: room.game, audience: "grupo" }
    : group
    ? group.plan
    : // No group means no game yet: choosing one is what makes it ("Elige un juego" until then).
      { ...localPlan, game: null };
  const mode = (plan.game && findMode(plan.game)) || null;
  // Inicio with nothing chosen yet (a new device): "Elige un juego" and JUGAR waits.
  const noGame = !mode && !room && !searching;
  const needsName = !user?.name || user.isGuest;
  const leaderName = group?.leaderName || "el líder";

  // Leaving the match or the group later finds the same game and side on Inicio.
  useEffect(() => {
    if (!searching && (room || group)) rememberPlan(plan);
  }, [plan.game, plan.audience, searching]);

  useEffect(() => {
    setError("");
    setGroupError("");
  }, [plan.game, plan.audience, room?.code, group?.code]);

  function run(action) {
    if (needsName) {
      // The name sheet goes under the panels over the page: they close first.
      setError("");
      setGroupError("");
      setSheet(null);
      setPending(action);
      return Promise.resolve();
    }
    return perform(action);
  }

  // True when it was done, false when it went wrong (said in the bar).
  async function perform(action) {
    const forGroup = action.type === "join";
    setBusyType(action.type);
    setError("");
    setGroupError("");
    try {
      await withSound(async () => {
        // The Clásico's public match is the roulette's: a search without a game.
        if (action.type === "match") await findMatch("casual", undefined, undefined, action.game === CLASSIC ? null : action.game);
        else if (action.type === "join") await joinGroup(action.code);
        else if (action.type === "pick") {
          // A game chosen with no group yet: your group at once (its code is on the bar), and on the private side its
          // match too.
          await createGroup({ audience: plan.audience, game: action.game });
          if (plan.audience === "grupo") await createRoom("multi", {}, action.game);
        } else if (action.type === "follow") await joinGroup(group.code);
        else {
          // "setup": the private match for its settings ("Ajustes" on Inicio's card).
          if (action.type === "setup") setSettingsAsked(true);
          await createRoom("multi", {}, action.game);
          if (action.then === "start") await startGame();
        }
      });
      // Phones skip it: it covered the top bar, where the sala's code already shows.
      if (action.type === "pick" && !window.matchMedia?.("(max-width: 760px)").matches) onToast?.("Se creó tu sala. Comparte el código para invitar", "check");
      return true;
    } catch (err) {
      setSettingsAsked(false);
      // Already playing in that match from another device: CentralOffer asks about this one instead.
      if (err.offer) return null;
      (forGroup ? setGroupError : setError)(err.message || (forGroup ? "No pudimos entrar a ese grupo" : "Algo salió mal, inténtalo otra vez"));
      return false;
    } finally {
      setBusyType("");
    }
  }

  async function act(fn) {
    setBusyType("act");
    setError("");
    try {
      await withSound(fn);
    } catch (err) {
      setError(err.message || "Algo salió mal, inténtalo otra vez");
    } finally {
      setBusyType("");
    }
  }

  // "Unirse": the code is checked first (a wrong one is said before asking for a name), then into the group.
  async function joinWithCode(code) {
    setGroupError("");
    try {
      await withSound(() => checkGroup(code), "next");
    } catch (err) {
      setGroupError(err.message || "No hay ningún grupo con ese código");
      return false;
    }
    return run({ type: "join", code });
  }

  async function leave() {
    setBusyType("leave");
    setError("");
    try {
      await leaveGroup();
      setSheet(null);
      onToast?.("Saliste del grupo", "logout");
    } catch (err) {
      setError(err.message || "No se pudo salir del grupo");
    } finally {
      setBusyType("");
    }
  }

  function chooseAudience(audience) {
    if (room) {
      // A private match switched to "Partida pública": back to Inicio to search (the whole group, with its leader).
      if (audience !== "publica") return;
      const next = { audience, game: isPublicGame(room.game) ? room.game : "opciones" };
      setSheet(null);
      act(async () => {
        if (group) await groupHome(next);
        else {
          updateLocalPlan(next);
          leaveRoom();
          nav("/", { replace: true });
        }
      });
      return;
    }
    if (group) act(() => setGroupPlan({ audience }));
    else updateLocalPlan({ audience });
  }

  function chooseGame(game) {
    setSheet(null);
    if (room) {
      if (game !== room.game) act(() => setGame(game));
      return;
    }
    if (!group) {
      // No group yet: choosing makes it (and the private match, on that side).
      updateLocalPlan({ game });
      run({ type: "pick", game });
      return;
    }
    act(() => setGroupPlan({ game }));
    // A game for a private match: the match straight away (its settings; the group comes into it).
    if (plan.audience === "grupo") run({ type: "create", game });
  }

  function cancelSearch() {
    if (group) return act(() => groupHome());
    leaveRoom();
    nav("/", { replace: true });
  }

  // The yellow button: what it says and does here.
  let action = null;
  let note = "";
  if (searching) {
    if (group && !isLeader) note = `Buscando con ${leaderName}…`;
    else action = { label: "Cancelar", neutral: true, sound: "back", onClick: cancelSearch, disabled: busy };
  } else if (room && !decides) {
    note = `Esperando a ${room.hostName || "el anfitrión"}…`;
  } else if (away && !group.place.public) {
    action = { label: busyType === "follow" ? "Entrando…" : "Ir con el grupo", sound: "none", disabled: busy, onClick: () => run({ type: "follow" }) };
  } else if (away && !isLeader) {
    note = "Tu grupo está jugando una partida…";
  } else if (!decides) {
    note = `Esperando a ${leaderName}…`;
  } else if (noGame) {
    action = { label: "Jugar", locked: true, disabled: true };
  } else if (plan.audience === "publica") {
    action = {
      label: busyType === "match" ? "Buscando…" : "Jugar",
      play: busyType !== "match",
      sound: "none",
      disabled: busy || !isPublicGame(plan.game),
      onClick: () => run({ type: "match", game: plan.game }),
    };
  } else {
    action = {
      // "Jugar" on both sides: public or private, the button says the same.
      label: busyType === "create" || start.busy ? "Empezando…" : "Jugar",
      play: !(busyType === "create" || start.busy),
      sound: "none",
      disabled: busy || (room ? !start.canStart : false),
      onClick: () => (room ? start.start() : run({ type: "create", game: plan.game, then: "start" })),
    };
  }

  // The summary and "Ajustes" at the bottom of Inicio's card. The Clásico has none: its card says how it goes instead.
  const cardSettings =
    !mode || mode.kind === "classic"
      ? null
      : plan.audience === "publica"
      ? { summary: publicMatchLine(mode.id) || "Sin partidas públicas por ahora", fixed: true }
      : decides && !away
      ? { onOpen: () => run({ type: "setup", game: plan.game }), disabled: busy }
      : { note: away ? "Tu grupo ya está jugando" : `Los elige ${leaderName}` };

  // The group's faces: dimmed whoever isn't with it now (or is reconnecting).
  const members = group ? group.members.map((m) => ({ ...m, connected: m.connected && m.here })) : [];

  return (
    <div className={`tv-lobby${leaving ? " is-leaving" : ""}`}>
      <div className="tv-lobby-stage">
        {searching ? (
          <SearchCard room={room} mode={mode} />
        ) : room && Lobby ? (
          <div key={room.game} className="tv-lobby-game">
            <OpenSettingsContext.Provider value={{ open: settingsAsked, done: () => setSettingsAsked(false) }}>
              <Lobby room={room} onToast={onToast} />
            </OpenSettingsContext.Provider>
          </div>
        ) : room ? (
          <ModeStage mode={CHOOSE} title={decides ? "Elige un juego" : `${room.hostName || "El anfitrión"} está eligiendo`} />
        ) : noGame ? (
          <ModeStage mode={CHOOSE} empty onChoose={() => setSheet("plan")} swapKey="none" />
        ) : (
          <ModeStage mode={mode} audience={plan.audience} swapKey={`${mode.id}:${plan.audience}`} settings={cardSettings} />
        )}
      </div>

      <GroupBar
        members={members}
        meId={user?.id || "me"}
        inGroup={Boolean(group)}
        code={group?.code || ""}
        isLeader={Boolean(group) && isLeader}
        canJoin={!searching}
        busy={busyType}
        onGroup={() => setSheet("group")}
        onAudience={decides && !away ? chooseAudience : null}
        onJoin={joinWithCode}
        onJoinEdit={() => setGroupError("")}
        onLeave={() => setConfirmLeave(true)}
        inviteBadge={group && isLeader ? group.joinRequests?.length || 0 : 0}
        plan={plan}
        planLocked={searching}
        onPlan={() => setSheet("plan")}
        action={action}
        note={note}
        error={error || start.err}
        groupError={groupError}
      />

      <PlanSheet
        open={sheet === "plan"}
        onClose={() => setSheet(null)}
        plan={plan}
        onAudience={chooseAudience}
        onGame={chooseGame}
        inGroup={Boolean(group)}
        readOnly={!decides}
        hostName={room ? room.hostName : leaderName}
      />
      <GroupSheet
        open={sheet === "group" && Boolean(group)}
        onClose={() => setSheet(null)}
        room={room}
        onToast={onToast}
        onLeave={
          phone
            ? () => {
                // The question goes over the page, not under the sheet.
                setSheet(null);
                setConfirmLeave(true);
              }
            : null
        }
        leaving={busyType === "leave"}
      />
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
            perform(next);
          }}
        />,
        document.querySelector(".tv-app") || document.body
      )}
      {createPortal(
        <ConfirmDialog
          open={confirmLeave && Boolean(group)}
          title="¿Seguro que quieres salir del grupo?"
          text="Dejarás de jugar con tu grupo y, si están en su partida privada, saldrás de ella. Para volver tendrás que unirte otra vez con el código."
          cancelLabel="Quedarme"
          confirmLabel="Salir del grupo"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false);
            leave();
          }}
        />,
        document.querySelector(".tv-app") || document.body
      )}
    </div>
  );
}

// A public room while it fills: the game's card says it's searching ("Buscando jugadores de Trivia…"), for how long, the
// game's queue and how many were found; once full, that it starts. The roulette's (the Clásico's) has no game: its card
// is the Clásico's.
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
  const steps = [
    { icon: "hourglass", text: full ? `Empieza en ${startsIn}` : `${clock} buscando` },
    { icon: "grid", text: info.game ? `Fila de ${mode.name} · ${publicMatchLine(info.game)}` : "Juegos al azar · gana el primero en ganar 2" },
    { icon: "users", text: `Jugadores encontrados: ${found} de ${info.size}` },
  ];
  return (
    <ModeStage
      mode={mode}
      title={full ? "¡Partida completa!" : `Buscando jugadores de ${mode.name}…`}
      steps={steps}
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
