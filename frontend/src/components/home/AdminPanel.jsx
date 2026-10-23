import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import { setForcedGames, setOwnerView, useForcedGames, useOwnerView } from "../../lib/ownerView.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import Segmented from "./Segmented.jsx";
import { findVariant, variantsFor } from "./matchInfo.js";
import "../../styles/admin.css";

const MAX_FORCED = 5;
// The design board (figma/, git-ignored) is served from the owner's own computer.
const BOARD_URL = "http://localhost:5199";

// "Trivia Cerradas": a variant's game and way.
function variantName(id) {
  const v = findVariant(id);
  if (!v) return id;
  const name = findMode(v.game)?.name || "";
  return v.way ? `${name} ${v.way}` : name;
}

/**
 * The owners' panel (the gear in the top bar, owners only): for debugging. "Vista" switches between the owner's tools
 * and the site as any player sees it; the test bot (it used to sit under the players of a room); and the games of this
 * owner's own public matches, in the order they choose instead of the random draw.
 */
export default function AdminPanel({ open, onClose }) {
  const { room, isCentral, addTestBot } = useApp();
  const view = useOwnerView();
  const forced = useForcedGames();
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
  const move = (i, to) => {
    const next = [...forced];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item);
    setForcedGames(next);
  };

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
          <div className="tv-admin-col">
          <div className="tv-admin-block">
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

              <div className="tv-admin-block">
                <h3>Bot de prueba</h3>
                <button type="button" className="tv-btn tv-btn--sm tv-c-coral" onClick={bot} disabled={!canBot || busy}>
                  <Icon name="plus" size={16} strokeWidth={3} />
                  Añadir bot de prueba
                </button>
                <p className="tv-admin-hint">{canBot ? "Se suma a tu sala y juega solo (hasta 5)." : "Disponible en el lobby de una sala privada, antes de empezar."}</p>
                {msg && <p className="tv-admin-msg" role="status">{msg}</p>}
              </div>

              <div className="tv-admin-block">
                <h3>Tablero de diseño</h3>
                <div className="tv-admin-links">
                  <a className="tv-btn tv-btn--sm tv-c-site" href={`${BOARD_URL}/`} target="_blank" rel="noopener noreferrer">
                    Tablero de diseño
                  </a>
                  <a className="tv-btn tv-btn--sm tv-c-site" href={`${BOARD_URL}/pantallas.html`} target="_blank" rel="noopener noreferrer">
                    Mapa de pantallas
                  </a>
                </div>
                <p className="tv-admin-hint">Los colores, botones y todas las pantallas con sus situaciones. Se abren desde tu computadora: antes enciende el tablero con figma/iniciar.bat.</p>
              </div>
          </div>

          <div className="tv-admin-col">

              <div className="tv-admin-block">
                <h3>Juegos de Casual</h3>
                <p className="tv-admin-hint">
                  Elige qué juegos salen en tus partidas públicas y en qué orden. Se juegan en una sala solo tuya (con bots) y solo con tu cuenta. Sin nada elegido, salen al azar.
                </p>
                {!debug && <p className="tv-admin-warn">Solo se usan en la vista «Owner (debug)»: cámbiala arriba para jugarlos.</p>}
                {forced.length > 0 ? (
                  <ol className="tv-admin-order">
                    {forced.map((id, i) => {
                      const v = findVariant(id);
                      const m = v && findMode(v.game);
                      return (
                        <li key={`${id}-${i}`} className="tv-admin-item">
                          <span className="tv-admin-num">{i + 1}</span>
                          {m && (
                            <span className={`tv-badge tv-c-${m.color} tv-admin-icon`} aria-hidden="true">
                              <Icon name={m.icon} size={16} strokeWidth={2.4} />
                            </span>
                          )}
                          <span className="tv-admin-name">{variantName(id)}</span>
                          <button type="button" className="tv-admin-tool" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Subir">↑</button>
                          <button type="button" className="tv-admin-tool" disabled={i === forced.length - 1} onClick={() => move(i, i + 1)} aria-label="Bajar">↓</button>
                          <button type="button" className="tv-admin-tool" onClick={() => setForcedGames(forced.filter((_, k) => k !== i))} aria-label="Quitar">✕</button>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="tv-admin-empty">Al azar, como todos</p>
                )}
                <div className="tv-admin-add" role="group" aria-label="Añadir un juego">
                  {options.map((id) => {
                    const m = findMode(findVariant(id)?.game);
                    return (
                      <button key={id} type="button" className="tv-admin-chip" disabled={forced.length >= MAX_FORCED} onClick={() => setForcedGames([...forced, id])}>
                        {m && (
                          <span className={`tv-admin-dot tv-c-${m.color}`} aria-hidden="true">
                            <Icon name={m.icon} size={13} strokeWidth={2.6} />
                          </span>
                        )}
                        {variantName(id)}
                      </button>
                    );
                  })}
                </div>
                {forced.length > 0 && (
                  <button type="button" className="tv-optrow-action tv-admin-clear" onClick={() => setForcedGames([])}>
                    Quitar el orden y jugar al azar
                  </button>
                )}
              </div>
          </div>
        </div>
      </section>
    </div>,
    document.querySelector(".tv-app") || document.body
  );
}
