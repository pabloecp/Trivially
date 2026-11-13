import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { findMode } from "../../modes/index.js";
import { useApp } from "../../lib/store.jsx";
import { CLASSIC, isPublicGame, rememberPlan, useLocalPlan } from "../../lib/plan.js";
import { withSound } from "../../lib/sounds.js";
import GroupBar, { GroupBoxContext, useNarrow } from "./GroupBar.jsx";
import GroupSheet from "./GroupSheet.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ModeStage from "./ModeStage.jsx";
import PlanSheet from "./PlanSheet.jsx";
import PlaySheet from "./PlaySheet.jsx";
import SearchBoard from "./SearchBoard.jsx";
import { OpenSettingsContext } from "./SettingsPanel.jsx";
import { useStartGame } from "./ModeStart.jsx";
import { privateMatchLine, publicMatchLine } from "./matchInfo.js";
import "../../styles/lobby.css";

// The card of a private match before its host picks a game.
const CHOOSE = { id: "none", name: "Elige un juego", icon: "grid", color: "neutral", steps: [] };

// Inicio, a private match's lobby and the search for a public match are one screen: the game's big card in the middle
// (its settings behind a summary at its bottom) with your boxes beside it (your elo, your group and who is in it), and
// the bar at the bottom ("Reto del día", "Vas a jugar" and the one yellow button). Arriba la info, al centro el juego
// (con tu grupo al lado), abajo la acción.
// The card's settings on Inicio: a public match's are the same for everyone, so they can't be changed (no "Ajustes");
// a private match's belong to its room, so "Ajustes" makes the match first (the group comes into it) and they open there.
// Nobody has a group to begin with, and choosing a game never makes one: the box beside the card (ModeStage's SocialBox,
// by GroupBoxContext) shows you alone with "Invitar", which makes the group and opens "Tu grupo" (the code is only in
// that window); once someone joins it says "En tu grupo", with "Salir del grupo" beside "Invitar" (on phones the top
// bar's chip opens "Tu grupo"). Friends join with the link or from "Amigos en línea". Without a group you
// play alone: a public match, or a private one only for you. A group only takes its players together: its leader
// decides and everyone goes (the server moves them, game/groups.js).
//  - On Inicio: the plan is this device's, or the group's (its leader's). "Partida pública" searches for a public match
//    of the game (for the whole group; the Clásico's is the roulette's, without a game); "Partida privada" makes the
//    private match (picking a game for it, or JUGAR, which also starts it), and the group goes into it.
//  - In a private match, while it waits: the game's own lobby (ModeStage and its settings), which only its host (the
//    group's leader) changes. Switching it to "Partida pública" goes back to Inicio (the whole group) to search.
//  - Searching (a public room that waits): under its name the card shows the seats with who has come (SearchBoard) and
//    the leader's button cancels it (the whole group goes back to Inicio).
//  - A group's player away from it (they went back alone, or came in while it plays a public match): "Ir con el grupo"
//    when they can go into its private match, otherwise they wait for it.
// Without a name (a guest's first time), the name is asked first (PlaySheet) and then it does what was asked.
export default function HomeFrame({ room = null, onToast, Lobby = null, leaving = false }) {
  const { user, group, isCentral, createRoom, findMatch, startGame, setGame, createGroup, joinGroup, leaveGroup, groupHome, setGroupPlan, leaveRoom } = useApp();
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
  // What went wrong making the group or going back to it: said as a notification.
  const [groupError, setGroupError] = useState("");
  // "Ajustes" made the private match: its settings open as soon as its lobby shows (SettingsPanel).
  const [settingsAsked, setSettingsAsked] = useState(false);
  const start = useStartGame(room || { players: [], game: null });
  // Phones open "Tu grupo" from the top bar and have no group's bar to leave from: "Salir del grupo" goes in it, once someone else is in the group.
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
    : localPlan;
  // Only a private match whose host hasn't picked a game yet has none ("Elige un juego").
  const mode = (plan.game && findMode(plan.game)) || (room ? null : findMode("opciones"));
  // The name is asked once: a guest who already gave theirs (making a group, joining one) isn't asked again.
  const needsName = !user?.name;
  const leaderName = group?.leaderName || "el líder";

  // The host gave (or took back) permission to change the match's settings: say so, once, when it changes.
  const canSet = Boolean(room && user?.id && room.hostId !== user.id && room.coHosts?.includes(user.id));
  const hadSet = useRef(null);
  useEffect(() => {
    const before = hadSet.current;
    hadSet.current = room ? canSet : null;
    if (!room || before === null || before === canSet) return;
    if (canSet) onToast?.(`${room.hostName || "El anfitrión"} te dio permiso para cambiar los ajustes`, "sliders");
    else onToast?.("Ya no puedes cambiar los ajustes de la partida", "lock");
  }, [canSet, room?.code]);

  // The group passed to you: say so, once, like the settings' permission (not when you make one or come into one).
  const leadsNow = Boolean(group && user?.id && group.leaderId === user.id);
  const ledBefore = useRef({ code: group?.code, leads: leadsNow });
  useEffect(() => {
    const before = ledBefore.current;
    ledBefore.current = { code: group?.code, leads: leadsNow };
    if (group && before.code === group.code && !before.leads && leadsNow) onToast?.("Ahora eres el líder del grupo", "crown");
  }, [group?.code, leadsNow]);

  // Leaving the match or the group later finds the same game and side on Inicio.
  useEffect(() => {
    if (!searching && (room || group)) rememberPlan(plan);
  }, [plan.game, plan.audience, searching]);

  useEffect(() => {
    setError("");
    setGroupError("");
  }, [plan.game, plan.audience, room?.code, group?.code]);

  // What went wrong shows as a notification (like "Creaste un grupo"), never as a line under the bar that moves the boxes.
  const problem = error || start.err || groupError;
  useEffect(() => {
    if (problem) onToast?.(problem, "lock");
  }, [problem]);

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
    const forGroup = action.type === "group";
    setBusyType(action.type);
    setError("");
    setGroupError("");
    try {
      await withSound(async () => {
        // The Clásico's public match is the roulette's: a search without a game.
        if (action.type === "match") await findMatch("casual", undefined, undefined, action.game === CLASSIC ? null : action.game);
        else if (action.type === "group") await createGroup(action.plan);
        else if (action.type === "follow") await joinGroup(group.code);
        else {
          // "setup": the private match for its settings ("Ajustes" on Inicio's card).
          if (action.type === "setup") setSettingsAsked(true);
          await createRoom("multi", {}, action.game);
          if (action.then === "start") await startGame();
        }
      });
      // "Invitar" made the group: its window opens with the code.
      if (action.type === "group") setSheet("group");
      return true;
    } catch (err) {
      setSettingsAsked(false);
      // Already playing in that match from another device: CentralOffer asks about this one instead.
      if (err.offer) return null;
      (forGroup ? setGroupError : setError)(err.message || (forGroup ? "No pudimos crear el grupo" : "Algo salió mal, inténtalo otra vez"));
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

  // The card comes in once, with the screen. After that it only updates (choosing a game, a group made or left, public or
  // private, a search): no more entrances, only its sweep of light (look.css, .is-settled).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, []);

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
    if (group) act(() => setGroupPlan({ game }));
    else updateLocalPlan({ game });
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
    else action = { label: "Cancelar", bad: true, sound: "back", onClick: cancelSearch, disabled: busy };
  } else if (room && !decides) {
    action = { label: "Esperando", play: true, neutral: true, waiting: true, disabled: true };
  } else if (away && !group.place.public) {
    action = { label: busyType === "follow" ? "Entrando…" : "Ir con el grupo", sound: "none", disabled: busy, onClick: () => run({ type: "follow" }) };
  } else if (away && !isLeader) {
    action = { label: "Esperando", play: true, neutral: true, waiting: true, disabled: true };
  } else if (!decides) {
    action = { label: "Esperando", play: true, neutral: true, waiting: true, disabled: true };
  } else if (plan.audience === "publica") {
    action = {
      label: busyType === "match" ? "Buscando…" : "Jugar",
      play: busyType !== "match",
      sound: "none",
      // Only waiting (switching "Pública" / "Privada"…): it can't be pressed, but it doesn't dim for those seconds.
      waiting: busy && isPublicGame(plan.game),
      disabled: busy || !isPublicGame(plan.game),
      onClick: () => run({ type: "match", game: plan.game }),
    };
  } else {
    action = {
      // "Jugar" on both sides: public or private, the button says the same.
      label: busyType === "create" || start.busy ? "Empezando…" : "Jugar",
      play: !(busyType === "create" || start.busy),
      sound: "none",
      waiting: busy && (room ? start.canStart : true),
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
      ? { summary: privateMatchLine(mode.id), onOpen: () => run({ type: "setup", game: plan.game }), disabled: busy }
      : { summary: privateMatchLine(mode.id), note: away ? "Tu grupo ya está jugando" : `Los elige ${leaderName}` };

  // The same element choosing a game and searching with it, so the card stays as it is when the search starts.
  const gameStage = mode && <GameStage searchRoom={searching ? room : null} mode={mode} audience={plan.audience} settings={cardSettings} onAudience={decides && !searching ? chooseAudience : null} />;

  // The group's faces: dimmed whoever isn't with it now (or is reconnecting).
  const members = group ? group.members.map((m) => ({ ...m, connected: m.connected && m.here })) : [];
  const inviteBadge = group && isLeader ? group.joinRequests?.length || 0 : 0;
  // The people's box beside the card (ModeStage's SocialBox), on Inicio and in a private match's lobby alike.
  const groupActions = {
    canCreate: !searching,
    busy: busyType,
    // With a group "Invitar" opens its window; without one it makes the group first (and then opens it).
    onInvite: () => (group ? setSheet("group") : run({ type: "group", plan })),
    // Inviting a friend from "Amigos en línea" with no group yet makes it first (without opening its window).
    onMakeGroup: () => createGroup(plan),
    onGroup: () => setSheet("group"),
    onLeave: () => setConfirmLeave(true),
    inviteBadge,
  };

  return (
    <div className={`tv-lobby${leaving ? " is-leaving" : ""}`}>
      <GroupBoxContext.Provider value={groupActions}>
        <div className={`tv-lobby-stage${settled ? " is-settled" : ""}`}>
          {searching ? (
            gameStage
          ) : room && Lobby ? (
            <div key={room.game} className="tv-lobby-game">
              <OpenSettingsContext.Provider value={{ open: settingsAsked, done: () => setSettingsAsked(false) }}>
                <Lobby room={room} onToast={onToast} />
              </OpenSettingsContext.Provider>
            </div>
          ) : room ? (
            <ModeStage mode={CHOOSE} title={decides ? "Elige un juego" : `${room.hostName || "El anfitrión"} está eligiendo`} />
          ) : (
            gameStage
          )}
        </div>
      </GroupBoxContext.Provider>

      <GroupBar
        members={members}
        meId={user?.id || "me"}
        inGroup={Boolean(group)}
        onGroup={() => setSheet("group")}
        onInvite={groupActions.onInvite}
        onLeave={groupActions.onLeave}
        inviteOff={!groupActions.canCreate}
        busy={busyType}
        inviteBadge={inviteBadge}
        plan={plan}
        planLocked={searching}
        onPlan={() => setSheet("plan")}
        action={action}
        note={note}
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
          phone && group?.members.length > 1
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

// The chosen game's card on Inicio, and the same one while a public room fills (`searchRoom`): the card stays (its colour,
// its name, the boxes beside it) and everything under its name turns into the search (SearchBoard), with the card's sweep
// of light. The roulette's (the Clásico's) has no game: its card is the Clásico's.
function GameStage({ searchRoom = null, mode, audience, settings, onAudience = null }) {
  const swapKey = `${mode.id}:${audience}:${searchRoom ? "search" : "plan"}`;
  return <ModeStage mode={mode} audience={audience} swapKey={swapKey} settings={settings} onAudience={onAudience} search={searchRoom && <SearchBoard room={searchRoom} />} />;
}
