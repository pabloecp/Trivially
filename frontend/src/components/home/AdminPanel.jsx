import { useState } from "react";
import { useApp } from "../../lib/store.jsx";
import { setBlobStyle, setBlobsStill, useBlobsStillChoice, setForcedGames, setOwnerView, useBlobStyleChoice, setResultsStyle, setResultsTone, setScoreboardBadge, setScoreboardLook, setLyricsView, useLyricsViewChoice, useForcedGames, useOwnerView, useResultsChoice, useScoreboardBadgeChoice, useScoreboardChoice } from "../../lib/ownerView.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import Segmented from "./Segmented.jsx";
import { SoundPacks, VolumeRows } from "./VolumeMenu.jsx";
import { findVariant, variantsFor } from "./matchInfo.js";
import "../../styles/admin.css";

const MAX_FORCED = 5;

/**
 * The owners' panel (the gear in the top bar, owners only): for debugging. "Vista" switches between the owner's tools
 * and the site as any player sees it; the test bot (it used to sit under the players of a room); and the games of this
 * owner's own public matches, in the order they choose instead of the random draw.
 */
export default function AdminPanel({ open, onClose, isOwner = false }) {
  const blobStyle = useBlobStyleChoice();
  const blobsStill = useBlobsStillChoice();
  const { room, isCentral, addTestBot } = useApp();
  const view = useOwnerView();
  const forced = useForcedGames();
  const results = useResultsChoice();
  const scoreboard = useScoreboardChoice();
  const badge = useScoreboardBadgeChoice();
  const lyricsView = useLyricsViewChoice();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

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
      setMsg("Bot añadido a la partida");
    } catch (e) {
      setMsg(e.message || "No se pudo añadir el bot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajustes" size={isOwner ? "lg" : "sm"} className="tv-admin">
        <div className="tv-admin-body">
          {/* The Blobs' jumps and looks (Blob.jsx): anyone can stop them, on this device. */}
          <div className="tv-admin-block is-half">
            <h3>Animaciones</h3>
            <Segmented
              label="Animaciones"
              value={blobsStill ? "si" : "no"}
              onChange={(v) => setBlobsStill(v === "si")}
              options={[
                { value: "no", label: "Con movimiento" },
                { value: "si", label: "Quietos" },
              ]}
            />
            <p className="tv-admin-hint">{blobsStill ? "Los Blobs no saltan ni miran a los lados en esta pantalla." : "Los Blobs saltan en el podio y miran a los lados en los marcadores."}</p>
          </div>

          {/* On phones the top bar has no volume button: it's here (VolumeMenu `inOwnerPanel`). */}
          <div className="tv-admin-block is-half tv-admin-volume">
            <h3>Volumen</h3>
            <VolumeRows />
          </div>

          {isOwner && (
            <>
              <p className="tv-mono-label tv-admin-section">Solo owners</p>
          {/* How the Blobs are drawn on this device (lib/ownerView.js): everyone else sees "Sombra interior". */}
          <div className="tv-admin-block is-third">
            <h3>Estilo de los Blobs</h3>
            <Segmented
              label="Estilo de los Blobs"
              value={blobStyle}
              onChange={setBlobStyle}
              options={[
                { value: "plano", label: "Plano" },
                { value: "sombra", label: "Sombra" },
                { value: "luz", label: "Luz y sombra" },
              ]}
            />
            <p className="tv-admin-hint">
              {blobStyle === "sombra" ? "El que ven todos: su color con una sombra por dentro." : "Solo lo ves tú, en la vista de owner. Los demás ven «Sombra»."}
            </p>
          </div>

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
                <h3>Tipo de sonido</h3>
                <p className="tv-admin-hint">Solo en este navegador; los jugadores escuchan Madera.</p>
                <SoundPacks />
              </div>

              <div className="tv-admin-block is-full">
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
                  Elige qué juegos salen en tus partidas públicas y en qué orden. Se juegan en una partida solo tuya (con bots) y solo con tu cuenta. Sin nada elegido, salen al azar.
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

              {/* The results screens this owner sees, to try the new looks in real matches (lib/ownerView.js). */}
              <div className="tv-admin-block is-half">
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
                <p className="tv-admin-hint">Entre juegos, la ruleta, el tutorial y el final. Los jugadores ven «Barras» y «En color».</p>
              </div>

              {/* How the scoreboard of a public match says who already won a game (lib/ownerView.js). */}
              <div className="tv-admin-block is-half">
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
                    value={badge}
                    onChange={setScoreboardBadge}
                    options={[
                      { value: "color", label: "En caja" },
                      { value: "neutro", label: "Con corona" },
                    ]}
                  />
                )}
                <p className="tv-admin-hint">Los juegos ganados en una partida pública. Los jugadores ven «Insignia» con corona.</p>
              </div>

              {/* Adivina la canción · Letra with Cerradas: more lyrics, or options as big as Trivia's (lib/ownerView.js). */}
              <div className="tv-admin-block is-half">
                <h3>Letra (Cerradas)</h3>
                <Segmented
                  label="Letra (Cerradas)"
                  value={lyricsView}
                  onChange={setLyricsView}
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "grandes", label: "Opciones grandes" },
                  ]}
                />
                <p className="tv-admin-hint">«Opciones grandes»: las 4 opciones del tamaño de las de Trivia, con menos letra a la vista. Los jugadores ven «Normal».</p>
              </div>
            </>
          )}
        </div>
    </Modal>
  );
}
