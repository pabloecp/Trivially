import { useState } from "react";
import { useApp } from "../../lib/store.jsx";
import { setOwnerView, setLyricsView, useLyricsViewChoice, useOwnerView } from "../../lib/ownerView.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import Segmented from "./Segmented.jsx";
import { SoundPacks } from "./VolumeMenu.jsx";
import "../../styles/admin.css";

/**
 * The owner panel (opened from "Panel de owner" inside "Ajustes", owners only): for debugging. "Vista" switches between the
 * owner's tools and the site as any player sees it, the test bot, the sound sets and the looks of the results, the
 * scoreboard and the lyrics.
 */
export default function AdminPanel({ open, onClose }) {
  const { room, isCentral, addTestBot } = useApp();
  const view = useOwnerView();
  const lyricsView = useLyricsViewChoice();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const debug = view === "debug";
  const canBot = Boolean(room) && room.phase === "lobby" && !room.matchmaking && !isCentral;
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
    <Modal open={open} onClose={onClose} title="Panel de owner" size="lg" className="tv-admin">
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
              {debug ? "Ves tus herramientas: «Saltar» en las partidas y el bot de prueba." : "Ves el sitio igual que cualquier jugador: sin «Saltar»."}
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
                <p className="tv-admin-hint">Solo en este navegador. Los jugadores escuchan Madera.</p>
                <SoundPacks />
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
        </div>
    </Modal>
  );
}
