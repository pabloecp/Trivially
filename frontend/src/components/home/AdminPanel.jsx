import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import { setForcedGames, setOwnerView, setResultsStyle, setResultsTone, setScoreboardLook, useForcedGames, useOwnerView, useResultsChoice, useScoreboardChoice } from "../../lib/ownerView.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import Segmented from "./Segmented.jsx";
import { SoundPacks } from "./VolumeMenu.jsx";
import { findVariant, variantsFor } from "./matchInfo.js";
import "../../styles/admin.css";

const MAX_FORCED = 5;
// The design board (figma/, git-ignored) is served from the owner's own computer.
const BOARD_URL = "http://localhost:5199";

/**
 * The owners' panel (the gear in the top bar, owners only): for debugging. "Vista" switches between the owner's tools
 * and the site as any player sees it; the test bot (it used to sit under the players of a room); and the games of this
 * owner's own public matches, in the order they choose instead of the random draw.
 */
export default function AdminPanel({ open, onClose }) {
  const { room, isCentral, addTestBot } = useApp();
  const view = useOwnerView();
  const forced = useForcedGames();
  const results = useResultsChoice();
  const scoreboard = useScoreboardChoice();
  const [mounted, setMounted] = useState(open);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setMsg("");
      return undefined;
    }
    // Closing: it goes once its way out has played (0.18 s, tvAdminOut in admin.css); the animations are on its backdrop and card,
    // not on the root, so it doesn't wait for an animationend that never comes there.
    const t = setTimeout(() => setMounted(false), 190);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const debug = view === "debug";
  const canBot = Boolean(room) && room.phase === "lobby" && !room.matchmaking && !isCentral;
  // The variants a Casual match can draw, by id ("trivia-cerradas").
  const options = variantsFor("casual").map((v) => v.id);
  // A tap adds the game at the end of the order; another tap takes it out (the ones after it move up).
  const toggle = (id) => setForcedGames(forced.includes(id) ? forced.filter((g) => g !== id) : [...forced, id]);

  async function bot() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await addTestBot();
      setMsg("Bot añadido a la sala");
    } catch (e) {
      setMsg(e.message || "No se pudo añadir el bot");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className={`tv-admin-root ${open ? "is-open" : "is-closing"}`}>
      <div className="tv-admin-backdrop" onClick={onClose} />
      <section className="tv-admin" role="dialog" aria-modal="true" aria-labelledby="tv-admin-title">
        <header className="tv-admin-head">
          <span className="tv-badge tv-c-coral" aria-hidden="true">
            <Icon name="settings" size={24} strokeWidth={2.2} />
          </span>
          <div>
            <p className="tv-mono-label">Solo owners</p>
            <h2 id="tv-admin-title" className="tv-admin-title">Panel de owner</h2>
          </div>
          <button type="button" className="tv-fr-x tv-admin-x" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={18} strokeWidth={3} />
          </button>
        </header>

        <div className="tv-admin-body">
          <div className="tv-admin-block is-third">
            <h3>Vista</h3>
            <Segmented
              label="Vista"
              value={view}
              onChange={setOwnerView}
              options={[
                { value: "debug", label: "Owner (debug)" },
                { value: "usuario", label: "Usuario normal" },
              ]}
            />
            <p className="tv-admin-hint">
              {debug ? "Ves tus herramientas: «Saltar» en las partidas, el bot de prueba y los juegos forzados." : "Ves el sitio igual que cualquier jugador: sin «Saltar» y las partidas públicas salen al azar."}
            </p>
          </div>

              <div className="tv-admin-block is-third">
                <h3>Bot de prueba</h3>
                <button type="button" className="tv-btn tv-btn--sm tv-c-coral" onClick={bot} disabled={!canBot || busy}>
                  <Icon name="plus" size={16} strokeWidth={3} />
                  Añadir bot de prueba
                </button>
                <p className="tv-admin-hint">{canBot ? "Se suma a tu sala y juega solo (hasta 5)." : "Disponible en el lobby de una sala privada, antes de empezar."}</p>
                {msg && <p className="tv-admin-msg" role="status">{msg}</p>}
              </div>

              <div className="tv-admin-block is-third">
                <h3>Tablero de diseño</h3>
                <div className="tv-admin-links">
                  <a className="tv-btn tv-btn--sm tv-c-site" href={`${BOARD_URL}/`} target="_blank" rel="noopener noreferrer">
                    Colores y botones
                  </a>
                  <a className="tv-btn tv-btn--sm tv-c-site" href={`${BOARD_URL}/pantallas.html`} target="_blank" rel="noopener noreferrer">
                    Pantallas
                  </a>
                </div>
                <p className="tv-admin-hint">Se abren desde tu computadora: npm run dev lo enciende si tienes la carpeta figma/.</p>
              </div>


              <div className="tv-admin-block is-wide">
                {/* The way back to random sits beside the title and keeps its place while hidden: nothing moves when it shows. */}
                <div className="tv-admin-block-head">
                  <h3>Juegos de Casual</h3>
                  <button
                    type="button"
                    className={`tv-optrow-action tv-admin-clear${forced.length ? "" : " is-hidden"}`}
                    onClick={() => setForcedGames([])}
                    disabled={!forced.length}
                    aria-hidden={!forced.length}
                  >
                    Quitar el orden y jugar al azar
                  </button>
                </div>
                <p className="tv-admin-hint">
                  Elige qué juegos salen en tus partidas públicas y en qué orden. Se juegan en una sala solo tuya (con bots) y solo con tu cuenta. Sin nada elegido, salen al azar.
                </p>
                {!debug && <p className="tv-admin-warn">Solo se usan en la vista «Owner (debug)»: cámbiala arriba para jugarlos.</p>}
                {/* Every way of playing, the same size: the chosen ones carry their place in the order. */}
                <div className="tv-admin-games" role="group" aria-label="Juegos de tus partidas">
                  {options.map((id) => {
                    const v = findVariant(id);
                    const m = findMode(v?.game);
                    const place = forced.indexOf(id) + 1;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`tv-admin-game${place ? " is-on" : ""}`}
                        aria-pressed={Boolean(place)}
                        disabled={!place && forced.length >= MAX_FORCED}
                        onClick={() => toggle(id)}
                      >
                        {m && (
                          <span className={`tv-admin-dot tv-c-${m.color}`} aria-hidden="true">
                            <Icon name={m.icon} size={15} strokeWidth={2.6} />
                          </span>
                        )}
                        <span className="tv-admin-game-name">
                          {m?.name}
                          {v?.way && <small>{v.way}</small>}
                        </span>
                        {place > 0 && <span className="tv-admin-num">{place}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tv-admin-block is-narrow">
                <h3>Tipo de sonido</h3>
                <p className="tv-admin-hint">Solo en este navegador; los jugadores escuchan Madera.</p>
                <SoundPacks />
              </div>

              {/* The results screens this owner sees, to try the new looks in real matches (lib/ownerView.js). */}
              <div className="tv-admin-block is-narrow">
                <h3>Pantalla de resultados</h3>
                <Segmented
                  label="Estilo"
                  value={results.style}
                  onChange={setResultsStyle}
                  options={[
                    { value: "panel", label: "Panel" },
                    { value: "barras", label: "Barras" },
                  ]}
                />
                <Segmented
                  label="Color de la pantalla"
                  value={results.tone}
                  onChange={setResultsTone}
                  options={[
                    { value: "color", label: "En color" },
                    { value: "neutro", label: "Neutra" },
                  ]}
                />
                <p className="tv-admin-hint">Entre juegos, la ruleta, el tutorial y el final. Los jugadores ven «Panel» y «Neutra».</p>
              </div>

              {/* How the scoreboard of a public match says who already won a game (lib/ownerView.js). */}
              <div className="tv-admin-block is-narrow">
                <h3>Marcador</h3>
                <Segmented
                  label="Marcador"
                  value={scoreboard}
                  onChange={setScoreboardLook}
                  options={[
                    { value: "frase", label: "Frase" },
                    { value: "numeros", label: "Números" },
                    { value: "insignia", label: "Insignia" },
                  ]}
                />
                {scoreboard === "insignia" && (
                  <Segmented
                    label="Color de la insignia"
                    value={results.tone}
                    onChange={setResultsTone}
                    options={[
                      { value: "color", label: "En caja" },
                      { value: "neutro", label: "Con corona" },
                    ]}
                  />
                )}
                <p className="tv-admin-hint">Los juegos ganados en una partida pública. Los jugadores ven «Frase».</p>
              </div>
        </div>
      </section>
    </div>,
    document.querySelector(".tv-app") || document.body
  );
}
