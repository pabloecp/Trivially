import { useContext, useEffect, useState } from "react";
import GuestFriends from "./GuestFriends.jsx";
import { GroupBoxContext, useNarrow } from "./GroupBar.jsx";
import { isGameTile } from "../../modes/index.js";
import { audienceName } from "../../lib/plan.js";
import { eloIn, formatElo, gameStats } from "../../lib/gameStats.js";
import { useApp } from "../../lib/store.jsx";
import { useFriends } from "../../lib/friends.jsx";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Blob from "./Blob.jsx";
import { blobColor } from "../../lib/blobColors.js";
import Icon from "./Icon.jsx";
import GroupMemberMenu from "./GroupMemberMenu.jsx";
import { statusOf } from "./FriendsSheet.jsx";

// The stage in the middle of Inicio and of a private match's lobby: the game's card in its colour, and beside it your
// boxes.
//  - The card: the game's icon and, in one row beside it, who the match is for ("Partida pública" or "Partida
//    privada") over the game's name (always one line); under them three short lines: how it's played (the game's
//    tagline), the match's settings (`settings.summary`, a private match's only once they're its own) and, last, how
//    many are playing the game now; in a private match that last line is the "Ajustes" button (`settings.onOpen`) or
//    who chooses them (`settings.note`). The search for a public match has its rows of how it goes there instead (`steps`:
//    "1:04 buscando"…). The game's icon, big and faint, is cut by the corner.
//  - Beside it: "Elo en" the game ("Tu elo" before one is chosen) with your character (Blob, white with a black line) in
//    its empty side; then, on phones only, the "Reto del día" (wide screens have the challenge in the bar below); last,
//    one box for your people (SocialBox, not on phones): the title "Tu grupo" always on top, you and who is with you,
//    "Invitar" (and "Salir del grupo" beside it, with others in it) and under them your friends online. The group's
//    code is never here: only in "Tu grupo", the window "Invitar" opens.
// `room` gives who it's for (a public match, or a private one); `audience` says it without a room (Inicio). `title`
// replaces the game's name. `extra` goes after the name, `children` at the end of
// the card. A Clásico (Normal or Extendido) looks like the site's logo: dark with the logo's rainbow frame and the logo
// in place of the game's icon. "Elige un juego" is the card with no lines (the boxes beside it have your general elo).
// A light sweeps across the card once it's in. `swapKey`: each time it changes the card plays its swap, the light
// sweeping across it again while its lines come in anew.
const AUDIENCE_ICONS = { publica: "globe", grupo: "lock" };

export default function ModeStage({ mode, room = null, audience = null, title = null, steps = null, extra = null, settings = null, swapKey = null, children }) {
  const classic = mode.kind === "classic";
  const who = audience || (room ? (room.matchmaking ? "publica" : "grupo") : null);
  const key = swapKey ?? `${mode.id}:${who}`;
  const stats = isGameTile(mode) ? gameStats(mode.id) : null;
  const name = title || mode.name;
  const how = mode.tagline || mode.subtitle;

  return (
    <section className="tv-stage has-aside" aria-label={mode.name}>
      <div className={`tv-stage-card ${classic ? "is-classic" : `tv-c-${mode.color}`}${swapKey != null ? " has-swap" : ""}`}>
        <span key={`flash-${key}`} className="tv-mstage-flash" aria-hidden="true" />
        {!classic && (
          <span className="tv-stage-mark" aria-hidden="true">
            <Icon name={mode.icon} size={300} strokeWidth={2} />
          </span>
        )}

        <div key={name} className="tv-stage-head">
          {classic ? (
            <span className="tv-stage-logo" aria-hidden="true">
              <AppIcon small />
            </span>
          ) : (
            <span className="tv-stage-badge">
              <Icon name={mode.icon} size={34} strokeWidth={2.2} />
            </span>
          )}
          <div className="tv-stage-heading">
            {who && (
              <p className="tv-stage-aud">
                <Icon name={AUDIENCE_ICONS[who]} size={16} strokeWidth={2.6} />
                {audienceName(who)}
              </p>
            )}
            <h2 className={`tv-stage-name${title ? " is-long" : ""}`}>{name}</h2>
          </div>
          {extra}
        </div>
        {mode.description && (
          <p key={`intro-${key}`} className="tv-stage-intro">
            {mode.description}
          </p>
        )}

        <div className="tv-stage-bottom">
        <ul key={`lines-${key}`} className="tv-stage-lines">
          {steps ? (
            steps.map((step, i) => (
              <li key={i} style={{ "--i": i }}>
                <span className="tv-stage-line-icon">
                  <Icon name={step.icon} size={20} strokeWidth={2.4} />
                </span>
                {step.text}
              </li>
            ))
          ) : (
            <>
              {how && (
                <li style={{ "--i": 0 }}>
                  <span className="tv-stage-line-icon">
                    <Icon name={classic ? "star" : mode.icon} size={20} strokeWidth={2.4} />
                  </span>
                  {how}
                </li>
              )}
              {settings?.summary && (
                <li style={{ "--i": 1 }}>
                  <span className="tv-stage-line-icon">
                    <Icon name="sliders" size={20} strokeWidth={2.4} />
                  </span>
                  <span className="tv-stage-line-text">{settings.summary}</span>
                </li>
              )}
              {settings?.onOpen ? (
                // A private match: its settings, where a public one says how many are playing.
                <li style={{ "--i": 2 }}>
                  <button type="button" className="tv-stage-settings" aria-haspopup="dialog" disabled={settings.disabled} onClick={settings.onOpen}>
                    <Icon name="sliders" size={18} strokeWidth={2.4} />
                    Ajustes
                  </button>
                </li>
              ) : settings?.note ? (
                <li style={{ "--i": 2 }}>
                  <span className="tv-stage-line-icon">
                    <Icon name="lock" size={18} strokeWidth={2.6} />
                  </span>
                  {settings.note}
                </li>
              ) : stats && (
                <li style={{ "--i": 2 }}>
                  <span className="tv-stage-line-icon">
                    <span className="tv-stage-live" aria-hidden="true" />
                  </span>
                  <span>
                    <b>{stats.online.toLocaleString("es-ES")}</b> jugando ahora
                  </span>
                </li>
              )}
            </>
          )}
        </ul>
        </div>
        {children}
      </div>

      {/* The Clásico has the same boxes as a game: its elo is the general one, as before a game is chosen. */}
      {classic ? (
        <Boxes game="clasico" gameName={mode.name} color="neutral" stats={gameStats("clasico")} />
      ) : stats ? (
        <Boxes game={mode.id} gameName={mode.name} color={mode.color} stats={stats} />
      ) : (
        <Boxes game="clasico" color="neutral" stats={gameStats("clasico")} />
      )}
    </section>
  );
}

// "Reto del día": today's challenge, with how far it is and how many you have completed in all (the server's, game/daily.js).
// Guests have none.
function DailyBox({ daily }) {
  // No account, no challenges (the friends' box has the way in).
  if (!daily) {
    return (
      <div className="tv-stage-box tv-stage-daily">
        <span className="tv-stage-label">Reto del día</span>
        <p className="tv-stage-friends-empty">Con una cuenta tienes un reto distinto cada día y llevas la cuenta de los que completas.</p>
      </div>
    );
  }
  const done = Boolean(daily?.done);
  const target = daily?.target || 1;
  const progress = Math.min(target, daily?.progress || 0);
  return (
    <div className={`tv-stage-box tv-stage-daily${done ? " is-done" : ""}`}>
      <div className="tv-stage-daily-row">
        <span className="tv-stage-daily-icon">
          <Icon name={done ? "check" : "flame"} size={20} strokeWidth={2.4} />
        </span>
        <div className="tv-stage-daily-text">
          <span className="tv-stage-label">Reto del día</span>
          <strong>{daily.goal}</strong>
        </div>
        <span className="tv-stage-daily-count">
          {formatElo(progress)}/{formatElo(target)}
        </span>
      </div>
      <span className="tv-stage-daily-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={progress} aria-label="Avance del reto">
        <i style={{ width: `${Math.round((progress / target) * 100)}%` }} />
      </span>
    </div>
  );
}

// The one box of your people, under your elo: you first, in the rows of "Tu grupo" (yours with the yellow ring, never a
// "tú"), then whoever is in your group, the leader marked, dimmed whoever isn't with the group right now. Alone (no
// group, or a group of one) it is only you; the title "Tu grupo" is always on top ("Tu grupo · N" once someone joins). "Invitar" goes
// under the last row (without a group it makes one, and opens "Tu grupo" with the code), and with others in the group
// "Salir del grupo" is to its left (the screen asks first). A tap on a row unfolds that player's options under their name (GroupMemberMenu, as on a match's scoreboard: profile, and for the leader permission, take out, make leader). Under them,
// "Amigos en línea": where each one is, and "Unirme" to a friend's open group; without an account, how to have friends.
function SocialBox({ group, user, canCreate = true, busy = "", onInvite, onMakeGroup, onLeave, inviteBadge = 0 }) {
  const friends = useFriends();
  const [busyFriend, setBusyFriend] = useState("");
  // The player whose options are unfolded under their name (GroupMemberMenu).
  const [menuFor, setMenuFor] = useState(null);
  // Friends already invited ("Invitado" for a while: the server lets you invite the same one again after 15 s).
  const [sent, setSent] = useState({});
  useEffect(() => {
    if (!Object.keys(sent).length) return undefined;
    const t = setTimeout(() => setSent({}), 15000);
    return () => clearTimeout(t);
  }, [sent]);
  const onlineAll = (friends.view?.friends || []).filter((f) => f.online);
  const meId = user?.id;
  const members = group ? [...group.members].sort((a, b) => (b.id === meId) - (a.id === meId)) : [];
  const together = members.length > 1;
  const rows = group ? members : [{ id: meId || "me", name: user?.name || "Tú", avatar: user?.avatar, connected: true, here: true }];

  const memberIds = new Set(members.map((m) => m.id));
  // Whoever is already in your group is in the list above: not here.
  const online = onlineAll.filter((f) => !memberIds.has(f.id));

  // "Unirme" (or "Pedir unirme") to the friend's group; "Invitar" sends them yours (making it first if you have none).
  async function act(friend, kind) {
    setBusyFriend(friend.id);
    try {
      if (kind === "invite") {
        if (!group) await onMakeGroup?.();
        await friends.inviteFriend(friend.id);
        setSent((s) => ({ ...s, [friend.id]: true }));
        friends.say(`Invitaste a ${friend.name}`, "check");
      } else {
        const action = await friends.joinFriend(friend.id);
        if (action === "requested") friends.say(`Le pediste a ${friend.room?.hostName || friend.name} unirte a su grupo`, "check");
      }
    } catch (err) {
      friends.say(err.message || "No se pudo, inténtalo otra vez", "lock");
    } finally {
      setBusyFriend("");
    }
  }

  return (
    <div className="tv-stage-box tv-stage-friends tv-stage-social">
      <span className="tv-stage-label">{together ? `Tu grupo · ${members.length}` : "Tu grupo"}</span>
      <ul className="tv-party-players" aria-label="Jugadores del grupo">
        {rows.map((m) => {
          const leads = together && m.id === group.leaderId;
          const tag = !together ? "Conectado" : !m.connected ? "Reconectando…" : !m.here ? "En otra partida" : leads ? "Líder" : "En el grupo";
          return (
            <li key={m.id} className={`tv-player${m.id === meId || !group ? " is-me" : ""}${m.connected && m.here ? "" : " is-away"}`}>
              <button type="button" className="tv-player-btn" aria-expanded={menuFor === m.id} onClick={group ? () => setMenuFor((id) => (id === m.id ? null : m.id)) : undefined} disabled={!group}>
                <Avatar name={m.name} avatar={m.avatar} mood="neutral" />
                <span className="tv-player-text">
                  <span className="tv-player-name">{m.name}</span>
                  <span className={`tv-player-tag${leads ? " is-host" : ""}`}>{tag}</span>
                </span>
              </button>
              {menuFor === m.id && group && (
                <GroupMemberMenu member={m} isMe={m.id === meId} canManage={group.leaderId === meId && m.id !== meId} onClose={() => setMenuFor(null)} onToast={friends.say} />
              )}
            </li>
          );
        })}
      </ul>
      {onInvite && (
        <div className="tv-stage-group-row">
          {together && (
            <button type="button" className="tv-iconbtn tv-iconbtn--sm tv-gbar-leave" data-sound="back" aria-label="Salir del grupo" title="Salir del grupo" onClick={onLeave} disabled={Boolean(busy)}>
              <Icon name="logout" size={17} strokeWidth={2.6} />
            </button>
          )}
          <button type="button" className="tv-btn tv-btn--neutral tv-gbar-invite" aria-haspopup="dialog" data-sound="none" onClick={onInvite} disabled={!group && (!canCreate || Boolean(busy))}>
            <Icon name="plus" size={17} strokeWidth={3} />
            {busy === "group" ? "Creando…" : "Invitar"}
            {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
          </button>
        </div>
      )}

      <div className="tv-stage-social-friends">
        <span className="tv-stage-label">Amigos en línea</span>
        {!friends.isAccount ? (
          <GuestFriends />
        ) : online.length === 0 ? (
          <p className="tv-stage-friends-empty">{onlineAll.length ? "Todos tus amigos en línea ya están en tu grupo." : "Ninguno de tus amigos está en línea ahora."}</p>
        ) : (
          <ul className="tv-stage-friends-list">
            {online.map((friend) => {
              const theirs = friend.room && friend.room.group !== false ? friend.room : null;
              // Without a group (and not in a match) a friend can still be asked: the server makes them one with your request.
              const free = !friend.room;
              const joinable = free || (Boolean(theirs) && (theirs.joinMode === "abierta" || (theirs.joinMode === "solicitud" && !theirs.requested)));
              const joinLabel = theirs?.requested ? "Esperando…" : free || theirs?.joinMode === "solicitud" ? "Pedir unirme" : "Unirme";
              const inviteOff = busyFriend === friend.id || Boolean(sent[friend.id]) || (!group && (!canCreate || Boolean(busy)));
              return (
                <li key={friend.id}>
                  <Avatar className="tv-avatar--sm" />
                  <span className="tv-stage-friends-text">
                    <b>{friend.name}</b>
                    <span>{statusOf(friend)}</span>
                  </span>
                  <span className="tv-stage-friends-btns">
                    <button type="button" className="tv-stage-friends-act" disabled={!joinable || busyFriend === friend.id} title={joinable ? undefined : theirs ? "Solo por invitación" : "Está en una partida"} onClick={() => act(friend, "join")}>
                      {joinLabel}
                    </button>
                    <button type="button" className="tv-stage-friends-act" disabled={inviteOff || !onInvite} onClick={() => act(friend, "invite")}>
                      {sent[friend.id] ? "Invitado" : "Invitar"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Beside the card: your elo in the game, with your character in the box's empty side; the day's challenge (phones; on
// wide screens it is in the bar); and the box of your people (SocialBox).
function Boxes({ game, gameName = "", color, stats: example }) {
  const { user, group } = useApp();
  // Inicio and a private match's lobby give the group's actions (HomeFrame). The challenge goes down to the bar on wide
  // screens; on phones it stays here.
  const groupActions = useContext(GroupBoxContext);
  const phone = useNarrow();
  // The elo is yours, from the server; the week's change isn't tracked yet, so it isn't shown.
  const stats = { ...example, elo: eloIn(user, game), week: 0 };
  return (
    <div key={game} className={`tv-stage-aside tv-c-${color}`}>
      <div className="tv-stage-box tv-stage-elo">
        <div className="tv-stage-elo-text">
          <span className="tv-stage-label">
            {gameName ? (
              <>
                Elo en
                <br />
                {gameName}
              </>
            ) : (
              "Tu elo"
            )}
          </span>
          <strong className="tv-stage-elo-num">{formatElo(stats.elo)}</strong>
          {stats.week !== 0 && (
            <span className={`tv-stage-elo-week${stats.week < 0 ? " is-down" : ""}`}>
              {stats.week > 0 ? "+" : "−"}
              {Math.abs(stats.week)} esta semana
            </span>
          )}
        </div>
        {/* Your character: "Blob". */}
        <Blob className="tv-stage-blob" color={blobColor(user?.avatar)} mood="neutral" />
      </div>

      {(!groupActions || phone) && <DailyBox daily={user?.daily} />}
      {/* Not on phones: there the group is in the top bar and the friends in "Amigos". */}
      {!phone && <SocialBox group={group} user={user} {...groupActions} />}
    </div>
  );
}
