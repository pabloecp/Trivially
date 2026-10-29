import { isGameTile } from "../../modes/index.js";
import { audienceName } from "../../lib/plan.js";
import { gameStats } from "../../lib/gameStats.js";
import { tutorialSlides } from "../../lib/gameTutorials.js";
import { useApp } from "../../lib/store.jsx";
import AppIcon from "./AppIcon.jsx";
import Icon from "./Icon.jsx";
import Tutorial from "./Tutorial.jsx";

// The stage in the middle of Inicio and of a private match's lobby: one panel in the game's colour with three columns.//  - Left, the game: its icon and name and, under them, its little tutorial (Tutorial: four steps, each an image with
//    its text, sliding by themselves, and a dot for each).
//  - In the middle, you: your name over your 2D character (not made yet: a template figure on its shadow) and your elo
//    in this game (gameStats).
//  - Right, the match: who it's for ("Partida pública" or "Partida privada") and under it, with a public one, how
//    many are playing the game now (and its fixed rules in a line: `settings.summary`), with a private one its
//    settings (`settings`: `{ summary, onOpen, note }`; `onOpen` gives the "Ajustes" button, `note` says who chooses
//    them when you can't). The search for a public match has rows of how it goes instead (`steps`: "1:04 buscando"…).
// `room` gives who it's for (a public match, or a private one); `audience` says it without a room (Inicio). `title`
// replaces the game's name ("Buscando jugadores de Trivia…"). `extra` goes after the name, `children` at the end of
// the right column. A Clásico (Normal or Extendido) looks like the site's logo: dark with the logo's rainbow frame and
// the logo itself in place of the game's icon. "Elige un juego" is the same stage with no tutorial.
// A light sweeps across the stage once it's in. `swapKey`: each time it changes the stage plays its swap, the light
// sweeping across it again while its game, elo and rows come in anew.
const AUDIENCE_ICONS = { publica: "globe", grupo: "lock" };

export default function ModeStage({ mode, room = null, audience = null, title = null, steps = null, extra = null, settings = null, swapKey = null, children }) {
  const classic = mode.kind === "classic";
  const who = audience || (room ? (room.matchmaking ? "publica" : "grupo") : null);
  const isPublic = who === "publica";
  const key = swapKey ?? `${mode.id}:${isPublic}`;
  const stats = isGameTile(mode) ? gameStats(mode.id) : null;
  const slides = tutorialSlides(mode);
  const name = title || mode.name;

  return (
    <section className={`tv-stage ${classic ? "is-classic" : `tv-c-${mode.color}`}${swapKey != null ? " has-swap" : ""}`} aria-label={mode.name}>
      <span key={`flash-${key}`} className="tv-mstage-flash" aria-hidden="true" />

      <div key={`game-${mode.id}`} className="tv-stage-game">
        <div key={name} className="tv-stage-title">
          {classic ? (
            <span className="tv-stage-logo" aria-hidden="true">
              <AppIcon small />
            </span>
          ) : (
            <span className="tv-stage-badge">
              <Icon name={mode.icon} size={32} strokeWidth={2.2} />
            </span>
          )}
          <div className="tv-stage-heading">
            <h2 className={`tv-stage-name${title ? " is-long" : ""}`}>{name}</h2>
            {classic && <p className="tv-stage-sub">{mode.subtitle}</p>}
          </div>
          {extra}
        </div>
        {slides && <Tutorial slides={slides} name={mode.name} />}
      </div>

      <Character game={mode.id} stats={stats} />

      <div key={`side-${key}`} className="tv-stage-side">
        {who && (
          <p className="tv-stage-aud">
            <span className="tv-stage-aud-icon">
              <Icon name={AUDIENCE_ICONS[who]} size={24} strokeWidth={2.4} />
            </span>
            {audienceName(who)}
          </p>
        )}
        {steps ? (
          <ol className="tv-mstage-steps" aria-label="Cómo va la búsqueda">
            {steps.map((step, i) => (
              <li key={step.text} className="tv-mstage-step" style={{ "--i": i }}>
                <span className="tv-mstage-step-icon">
                  <Icon name={step.icon} size={18} strokeWidth={2.4} />
                </span>
                {step.text}
              </li>
            ))}
          </ol>
        ) : isPublic && stats ? (
          <div className="tv-stage-stat">
            <span className="tv-stage-label">Jugando ahora</span>
            <strong className="tv-stage-big">
              <span className="tv-stage-live" aria-hidden="true" />
              {stats.online.toLocaleString("es-ES")}
            </strong>
            {settings?.summary && <span className="tv-stage-sum">{settings.summary}</span>}
          </div>
        ) : (
          !isPublic &&
          settings && (
            <div className="tv-stage-stat">
              <span className="tv-stage-label">Ajustes de la partida</span>
              <p className="tv-stage-sum is-set">{settings.summary}</p>
              {settings.onOpen && (
                <button type="button" className="tv-stage-settings" aria-haspopup="dialog" disabled={settings.disabled} onClick={settings.onOpen}>
                  <Icon name="sliders" size={18} strokeWidth={2.6} />
                  Ajustes
                </button>
              )}
              {settings.note && <span className="tv-stage-note">{settings.note}</span>}
            </div>
          )
        )}
        {children}
      </div>
    </section>
  );
}

// Your name over where your 2D character will stand and, under it, your elo in the game: for now a template figure
// standing on its shadow, keeping the space. The figure takes the height the stage leaves it.
function Character({ game, stats }) {
  const { user } = useApp();
  return (
    <div className="tv-stage-me">
      <span className="tv-stage-me-name">{user?.name || "Tú"}</span>
      <div className="tv-stage-me-spot" aria-hidden="true">
        <span className="tv-stage-me-floor" />
        <svg className="tv-stage-me-figure" viewBox="0 0 140 240">
          <circle className="tv-stage-me-disc" cx="70" cy="128" r="118" />
          <g>
            <circle cx="70" cy="38" r="32" />
            <rect x="32" y="78" width="76" height="98" rx="32" />
            <rect x="8" y="88" width="24" height="84" rx="12" transform="rotate(7 20 88)" />
            <rect x="108" y="88" width="24" height="84" rx="12" transform="rotate(-7 120 88)" />
            <rect x="40" y="150" width="27" height="86" rx="13" />
            <rect x="73" y="150" width="27" height="86" rx="13" />
          </g>
        </svg>
      </div>
      {stats && (
        <dl key={game} className="tv-stage-elo">
          <dt>Tu elo</dt>
          <dd>
            <Icon name="star" size={22} strokeWidth={2.6} />
            {stats.elo}
          </dd>
        </dl>
      )}
    </div>
  );
}
