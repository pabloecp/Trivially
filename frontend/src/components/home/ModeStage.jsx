import { useState } from "react";
import { isGameTile } from "../../modes/index.js";
import { audienceName } from "../../lib/plan.js";
import { formatElo, gameStats } from "../../lib/gameStats.js";
import { useApp } from "../../lib/store.jsx";
import { useFriends } from "../../lib/friends.jsx";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Blob from "./Blob.jsx";
import Icon from "./Icon.jsx";
import { statusOf } from "./FriendsSheet.jsx";

// The stage in the middle of Inicio and of a private match's lobby: the game's card in its colour, and beside it your
// boxes.
//  - The card: the game's icon and, in one row beside it, who the match is for ("Partida pública" or "Partida
//    privada") over the game's name (always one line); under them three short lines: how it's played (the game's
//    tagline), the match's settings (`settings.summary`) and how many are playing the game now. Above the three lines,
//    the "Ajustes" button when `settings.onOpen`, "Reglas fijas en la partida pública" when `settings.fixed`, or who
//    chooses them (`settings.note`). The search for a public match has its rows of how it goes there instead (`steps`:
//    "1:04 buscando"…). The game's icon, big and faint, is cut by the corner.
//  - `empty`: no game chosen yet (Inicio on a new device). The card is grey with the logo, "Elige un juego", what there
//    is and the screen's yellow button, "Elegir juego" (`onChoose`).
//  - Beside it: for a game, "Tu elo" with your character (Blob, white with a black line) in its empty side and the
//    "Reto del día" (gameStats: example numbers until those systems exist); always "Amigos en línea" under them.
// `room` gives who it's for (a public match, or a private one); `audience` says it without a room (Inicio). `title`
// replaces the game's name ("Buscando jugadores de Trivia…"). `extra` goes after the name, `children` at the end of
// the card. A Clásico (Normal or Extendido) looks like the site's logo: dark with the logo's rainbow frame and the logo
// in place of the game's icon. "Elige un juego" is the card alone, with no lines.
// A light sweeps across the card once it's in. `swapKey`: each time it changes the card plays its swap, the light
// sweeping across it again while its lines come in anew.
const AUDIENCE_ICONS = { publica: "globe", grupo: "lock" };

export default function ModeStage({ mode, room = null, audience = null, title = null, steps = null, extra = null, settings = null, swapKey = null, empty = false, onChoose = null, children }) {
  if (empty) return <ChooseStage onChoose={onChoose} />;
  const classic = mode.kind === "classic";
  const who = audience || (room ? (room.matchmaking ? "publica" : "grupo") : null);
  const key = swapKey ?? `${mode.id}:${who}`;
  const stats = isGameTile(mode) ? gameStats(mode.id) : null;
  const name = title || mode.name;
  const how = mode.tagline || mode.subtitle;
  const tools = !steps && (settings?.onOpen || settings?.fixed || settings?.note);

  return (
    <section className={`tv-stage${stats ? " has-aside" : ""}`} aria-label={mode.name}>
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
        {!steps && mode.description && (
          <p key={`intro-${key}`} className="tv-stage-intro">
            {mode.description}
          </p>
        )}

        <div className="tv-stage-bottom">
        {tools && (
          <div key={`tools-${key}`} className="tv-stage-tools">
            {settings.onOpen ? (
              <button type="button" className="tv-stage-settings" aria-haspopup="dialog" disabled={settings.disabled} onClick={settings.onOpen}>
                <Icon name="sliders" size={18} strokeWidth={2.4} />
                Ajustes
              </button>
            ) : (
              <span className="tv-stage-fixed">
                <Icon name="lock" size={16} strokeWidth={2.6} />
                {settings.fixed ? "Reglas fijas en la partida pública" : settings.note}
              </span>
            )}
          </div>
        )}
        <ul key={`lines-${key}`} className="tv-stage-lines">
          {steps ? (
            steps.map((step, i) => (
              <li key={step.text} style={{ "--i": i }}>
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
              {stats && (
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

      {stats && <Boxes game={mode.id} gameName={mode.name} color={mode.color} stats={stats} />}
    </section>
  );
}

// No game chosen yet: the grey card with the logo, what there is, and "Elegir juego" (the screen's yellow button: JUGAR
// stays grey until a game is chosen). Beside it the same boxes, with the general (Clásico) elo and challenge.
const CHOOSE_LINES = [
  { icon: "grid", text: "Trivia, música, mapas, minas y más" },
  { icon: "users", text: "Solo o con tu grupo, hasta 8" },
  { icon: "globe", text: "Partida pública o privada" },
];
function ChooseStage({ onChoose }) {
  return (
    <section className="tv-stage has-aside" aria-label="Elige un juego">
      <div className="tv-stage-card tv-c-neutral is-choose">
        <span className="tv-stage-mark" aria-hidden="true">
          <Icon name="grid" size={300} strokeWidth={2} />
        </span>
        <div className="tv-stage-head">
          <span className="tv-stage-logo" aria-hidden="true">
            <AppIcon small />
          </span>
          <div className="tv-stage-heading">
            <p className="tv-stage-aud is-quiet">Aún no has elegido</p>
            <h2 className="tv-stage-name">Elige un juego</h2>
          </div>
        </div>
        <p className="tv-stage-intro">Ocho juegos y el Clásico. Al elegir uno se crea tu sala y ya puedes invitar a tus amigos.</p>
        <div className="tv-stage-bottom tv-stage-choose-row">
          <ul className="tv-stage-lines">
            {CHOOSE_LINES.map((line, i) => (
              <li key={line.text} style={{ "--i": i }}>
                <span className="tv-stage-line-icon">
                  <Icon name={line.icon} size={20} strokeWidth={2.4} />
                </span>
                {line.text}
              </li>
            ))}
          </ul>
          <button type="button" className="tv-btn tv-btn--primary tv-btn--lg tv-stage-choose" aria-haspopup="dialog" onClick={onChoose}>
            <Icon name="grid" size={20} strokeWidth={2.6} />
            Elegir juego
          </button>
        </div>
      </div>
      {/* Your general elo and challenge (the Clásico's), and your friends. */}
      <Boxes game="clasico" color="neutral" stats={gameStats("clasico")} />
    </section>
  );
}

// "Amigos en línea": up to three friends who are online, where each one is, and what you can do: "Unirme" to a friend's
// open group, or "Invitar" them to yours. Without an account, how to have friends.
function FriendsBox() {
  const friends = useFriends();
  const { group } = useApp();
  const [busy, setBusy] = useState("");
  const online = (friends.view?.friends || []).filter((f) => f.online).slice(0, 3);

  async function act(friend, fn) {
    setBusy(friend.id);
    try {
      await fn(friend.id);
    } catch (err) {
      friends.say(err.message || "No se pudo, inténtalo otra vez", "lock");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="tv-stage-box tv-stage-friends">
      <span className="tv-stage-label">{group ? "Invita a tu sala" : "Amigos en línea"}</span>
      {!friends.isAccount ? (
        <p className="tv-stage-friends-empty">Con una cuenta puedes agregar amigos y ver aquí quién está jugando.</p>
      ) : online.length === 0 ? (
        <p className="tv-stage-friends-empty">Ninguno de tus amigos está en línea ahora.</p>
      ) : (
        <ul className="tv-stage-friends-list">
          {online.map((friend) => {
            const canJoin = friend.room && friend.room.group !== false && friend.room.joinMode === "abierta";
            return (
              <li key={friend.id}>
                <Avatar className="tv-avatar--sm" />
                <span className="tv-stage-friends-text">
                  <b>{friend.name}</b>
                  <span>{statusOf(friend)}</span>
                </span>
                {canJoin ? (
                  <button type="button" className="tv-stage-friends-act" disabled={busy === friend.id} onClick={() => act(friend, friends.joinFriend)}>
                    Unirme
                  </button>
                ) : group ? (
                  <button type="button" className="tv-stage-friends-act" disabled={busy === friend.id} onClick={() => act(friend, friends.inviteFriend)}>
                    Invitar
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Beside the card: your elo in the game, with your character in the box's empty side, the day's challenge, and your
// friends online.
function Boxes({ game, gameName = "", color, stats }) {
  const { daily } = stats;
  return (
    <div key={game} className={`tv-stage-aside tv-c-${color}`}>
      <div className="tv-stage-box tv-stage-elo">
        <div className="tv-stage-elo-text">
          <span className="tv-stage-label">{gameName ? `Tu elo en ${gameName}` : "Tu elo"}</span>
          <strong className="tv-stage-elo-num">{formatElo(stats.elo)}</strong>
          {stats.week !== 0 && (
            <span className={`tv-stage-elo-week${stats.week < 0 ? " is-down" : ""}`}>
              {stats.week > 0 ? "+" : "−"}
              {Math.abs(stats.week)} esta semana
            </span>
          )}
        </div>
        {/* Your character: "Blob". */}
        <Blob className="tv-stage-blob" />
      </div>

      <div className="tv-stage-box tv-stage-daily">
        <div className="tv-stage-daily-row">
          <span className="tv-stage-daily-icon">
            <Icon name="flame" size={20} strokeWidth={2.4} />
          </span>
          <div className="tv-stage-daily-text">
            <span className="tv-stage-label">Reto del día</span>
            <strong>{daily.goal}</strong>
          </div>
          <span className="tv-stage-daily-count">
            {daily.done}/{daily.of}
          </span>
        </div>
        <span className="tv-stage-daily-bar" role="progressbar" aria-valuemin={0} aria-valuemax={daily.of} aria-valuenow={daily.done} aria-label="Avance del reto">
          <i style={{ width: `${Math.round((daily.done / daily.of) * 100)}%` }} />
        </span>
      </div>

      <FriendsBox />
    </div>
  );
}
