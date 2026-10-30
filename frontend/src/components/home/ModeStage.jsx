import { isGameTile } from "../../modes/index.js";
import { audienceName } from "../../lib/plan.js";
import { gameStats } from "../../lib/gameStats.js";
import AppIcon from "./AppIcon.jsx";
import Blob from "./Blob.jsx";
import Icon from "./Icon.jsx";

// The stage in the middle of Inicio and of a private match's lobby: the game's card in its colour, and beside it your
// boxes.
//  - The card: the game's icon and, in one row beside it, who the match is for ("Partida pública" or "Partida
//    privada") over the game's name (always one line); under them three short lines: how it's played (the game's
//    tagline), the match's settings (`settings.summary`, with the "Ajustes" button when `settings.onOpen`, or who
//    chooses them, `settings.note`) and how many are playing the game now. The search for a public match has its rows
//    of how it goes there instead (`steps`: "1:04 buscando"…). The game's icon, big and faint, is cut by the corner.
//  - Beside it (a game only): "Tu elo" with your character (Blob, white with a black line) in its empty side, and the
//    "Reto del día" under it (gameStats: example numbers until those systems exist).
// `room` gives who it's for (a public match, or a private one); `audience` says it without a room (Inicio). `title`
// replaces the game's name ("Buscando jugadores de Trivia…"). `extra` goes after the name, `children` at the end of
// the card. A Clásico (Normal or Extendido) looks like the site's logo: dark with the logo's rainbow frame and the logo
// in place of the game's icon. "Elige un juego" is the card alone, with no lines.
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
                  <span className="tv-stage-line-text">
                    {settings.summary}
                    {settings.note && <span className="tv-stage-note"> · {settings.note}</span>}
                  </span>
                  {settings.onOpen && (
                    <button type="button" className="tv-stage-settings" aria-haspopup="dialog" disabled={settings.disabled} onClick={settings.onOpen}>
                      Ajustes
                    </button>
                  )}
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
        {children}
      </div>

      {stats && <Boxes game={mode.id} color={mode.color} stats={stats} />}
    </section>
  );
}

// Beside the card: your elo in the game, with your character in the box's empty side, and the day's challenge.
function Boxes({ game, color, stats }) {
  const { daily } = stats;
  return (
    <div key={game} className={`tv-stage-aside tv-c-${color}`}>
      <div className="tv-stage-box tv-stage-elo">
        <div className="tv-stage-elo-text">
          <span className="tv-stage-label">Tu elo</span>
          <strong className="tv-stage-elo-num">
            <Icon name="star" size={30} strokeWidth={2.4} />
            {stats.elo}
          </strong>
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
        <span className="tv-stage-label">Reto del día</span>
        <div className="tv-stage-daily-row">
          <span className="tv-stage-daily-icon">
            <Icon name="flame" size={26} strokeWidth={2.4} />
          </span>
          <div className="tv-stage-daily-text">
            <strong>{daily.goal}</strong>
            <span>{daily.how}</span>
          </div>
          <span className="tv-stage-daily-count">
            {daily.done}/{daily.of}
          </span>
        </div>
        <span className="tv-stage-daily-bar" role="progressbar" aria-valuemin={0} aria-valuemax={daily.of} aria-valuenow={daily.done} aria-label="Avance del reto">
          <i style={{ width: `${Math.round((daily.done / daily.of) * 100)}%` }} />
        </span>
      </div>
    </div>
  );
}
