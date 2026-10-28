import { isGameTile } from "../../modes/index.js";
import { audienceName } from "../../lib/plan.js";
import AppIcon from "./AppIcon.jsx";
import Icon from "./Icon.jsx";
import { publicFacts } from "./matchInfo.js";

// The game's big card, in the middle of Inicio and of a private match's lobby, in the game's colour (flat: nothing on
// it is tapped): its icon on a white square, beside it who it's for ("Partida pública", only for a public match), its
// name big, and three rows of how it goes (the game's `steps`; for a public match, how it's matched and how long it is),
// with the icon again huge and faint in the bottom right corner. `room` gives who it's for (a public match, or a private
// one); `audience` says it without a room (Inicio). `title`, `steps` and `tag` replace the game's own ("Buscando jugadores de Trivia…").
// `extra` goes beside the icon, `children` under the rows.
// A Clásico (Normal or Extendido) looks like the site's logo: dark with the logo's rainbow frame and the logo itself in
// place of the game's icon, its name with its length ("3 juegos") at the top.
// A light sweeps across the card once it's in. `swapKey`: each time it changes the card plays its swap, the light
// sweeping across it again while its icon, name and rows come in anew.
export default function ModeStage({ mode, room = null, audience = null, title = null, steps = null, tag = undefined, extra = null, swapKey = null, children }) {
  const classic = mode.kind === "classic";
  const who = audience || (room?.matchmaking ? "publica" : null);
  const isPublic = who === "publica" && isGameTile(mode);
  const rows = steps || (isPublic ? publicFacts(mode) : mode.steps || []);
  const label = tag !== undefined ? tag : isPublic ? audienceName("publica") : null;
  const key = swapKey ?? `${mode.id}:${isPublic}`;
  return (
    <section className={`tv-mstage ${classic ? "is-classic" : `tv-c-${mode.color}`}${swapKey != null ? " has-swap" : ""}`} aria-label={mode.name}>
      <span key={`flash-${key}`} className="tv-mstage-flash" aria-hidden="true" />
      {classic ? (
        <span className="tv-mstage-logo" aria-hidden="true">
          <AppIcon small />
        </span>
      ) : (
        <Icon key={`mark-${key}`} name={mode.icon} size={360} strokeWidth={1.2} className="tv-mstage-watermark" />
      )}
      <div key={`head-${key}`} className="tv-mstage-head">
        {!classic && (
          <div className="tv-mstage-badges">
            <span className="tv-mstage-badge">
              <Icon name={mode.icon} size={30} strokeWidth={2.2} />
            </span>
            {label && (
              <span className="tv-mstage-tag">
                <Icon name="globe" size={16} strokeWidth={2.6} />
                {label}
              </span>
            )}
            {extra}
          </div>
        )}
        <h2 className="tv-mstage-name">{title || mode.name}</h2>
        {classic && <p className="tv-mstage-sub">{mode.subtitle}</p>}
      </div>
      <div className="tv-mstage-foot">
        <ol key={`steps-${key}`} className="tv-mstage-steps" aria-label="Cómo se juega">
          {rows.map((step, i) => (
            <li key={step.text} className="tv-mstage-step" style={{ "--i": i }}>
              <span className="tv-mstage-step-icon">
                <Icon name={step.icon} size={18} strokeWidth={2.4} />
              </span>
              {step.text}
            </li>
          ))}
        </ol>
        {children}
      </div>
    </section>
  );
}
