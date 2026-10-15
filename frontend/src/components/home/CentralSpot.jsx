import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import "../../styles/central.css";

// How far a mouse moves (px) before a press on a player becomes a drag; how long a finger holds still on one before it
// can drag it (a finger that moves sooner is scrolling the list), and how far it may wander meanwhile.
const MOUSE_DRAG_PX = 6;
const TOUCH_HOLD_MS = 320;
const TOUCH_SLOP_PX = 10;
// A drop this close to the spot still counts.
const DROP_PAD_PX = 18;

/**
 * Dragging a player of the room's column onto the "Dispositivo central" spot (the host, while the room waits). A mouse
 * drags as soon as it moves; a finger holds the player still for a moment first, so the list still scrolls. `bind`
 * gives a player's row its handlers; `drag` is { player, x, y, over } while one is dragged (for the floating copy and
 * the spot), and `onDrop(player)` runs when it's let go over the spot. Escape cancels.
 */
export function useCentralDrag({ enabled, spotRef, onDrop }) {
  const [drag, setDrag] = useState(null);
  const press = useRef(null);
  // When the last drag ended, so the click that comes right after it doesn't open the player's menu.
  const dropped = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  function overSpot(x, y) {
    const r = spotRef.current?.getBoundingClientRect();
    if (!r) return false;
    return x >= r.left - DROP_PAD_PX && x <= r.right + DROP_PAD_PX && y >= r.top - DROP_PAD_PX && y <= r.bottom + DROP_PAD_PX;
  }

  function end(drop) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    window.removeEventListener("pointermove", p.move);
    window.removeEventListener("pointerup", p.up);
    window.removeEventListener("pointercancel", p.cancel);
    window.removeEventListener("keydown", p.key);
    document.removeEventListener("touchmove", p.block);
    if (!p.active) return;
    dropped.current = Date.now();
    setDrag(null);
    if (drop && overSpot(p.x, p.y)) onDropRef.current(p.player);
  }

  useEffect(() => () => end(false), []);
  useEffect(() => {
    if (!enabled) end(false);
  }, [enabled]);

  function start(e, player) {
    if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    end(false);
    const p = { player, id: e.pointerId, touch: e.pointerType !== "mouse", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    const activate = () => {
      p.active = true;
      navigator.vibrate?.(12);
      setDrag({ player, x: p.x, y: p.y, over: overSpot(p.x, p.y) });
    };
    p.move = (ev) => {
      if (ev.pointerId !== p.id) return;
      p.x = ev.clientX;
      p.y = ev.clientY;
      if (!p.active) {
        const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
        if (p.touch && moved > TOUCH_SLOP_PX) end(false);
        else if (!p.touch && moved > MOUSE_DRAG_PX) activate();
        return;
      }
      setDrag({ player, x: p.x, y: p.y, over: overSpot(p.x, p.y) });
    };
    p.up = (ev) => ev.pointerId === p.id && end(true);
    p.cancel = (ev) => ev.pointerId === p.id && end(false);
    p.key = (ev) => ev.key === "Escape" && end(false);
    // Once a finger drags, the page doesn't scroll under it.
    p.block = (ev) => p.active && ev.cancelable && ev.preventDefault();
    if (p.touch) p.timer = setTimeout(activate, TOUCH_HOLD_MS);
    press.current = p;
    window.addEventListener("pointermove", p.move);
    window.addEventListener("pointerup", p.up);
    window.addEventListener("pointercancel", p.cancel);
    window.addEventListener("keydown", p.key);
    document.addEventListener("touchmove", p.block, { passive: false });
  }

  function bind(player, draggable) {
    if (!enabled || !draggable) return {};
    return {
      onPointerDown: (e) => start(e, player),
      onClickCapture: (e) => {
        if (Date.now() - dropped.current < 400) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      // A finger held on a player is the start of a drag, not a long press for the browser's menu.
      onContextMenu: (e) => e.preventDefault(),
      "data-draggable": "true",
    };
  }

  return { drag, bind };
}

// The player being dragged, under the pointer.
export function DragGhost({ drag }) {
  if (!drag) return null;
  return createPortal(
    <div className={`tv-central-ghost${drag.over ? " is-over" : ""}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
      <Avatar name={drag.player.name} avatar={drag.player.avatar} />
      <span>{drag.player.name}</span>
      <Icon name="tv" size={16} strokeWidth={2.6} />
    </div>,
    document.querySelector(".tv-app") || document.body
  );
}

/**
 * The "Dispositivo central" spot, at the top of the room's column: the room's central device (the screen that shows the
 * match while the players answer from their phones), or where the host drops a player to make their device it. The
 * host takes it off with the X. (The players asking to use another device as it are CentralRequests', on every screen.)
 */
export default function CentralSpot({ room, spotRef, drag, isHost, onToast }) {
  const { removeCentral } = useApp();
  const central = room.central;
  const lobby = room.phase === "lobby";
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    if (!confirmOff) return undefined;
    const t = setTimeout(() => setConfirmOff(false), 3000);
    return () => clearTimeout(t);
  }, [confirmOff]);

  async function takeOff() {
    // Mid-match it changes every player's screen, so it asks first there.
    if (!lobby && !confirmOff) {
      setConfirmOff(true);
      return;
    }
    setConfirmOff(false);
    try {
      await removeCentral();
      onToast?.("Cada uno vuelve a jugar en su pantalla", "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo quitar el dispositivo central");
    }
  }

  let sub;
  if (central) sub = central.connected ? `Pantalla de ${central.name}` : `Pantalla de ${central.name} · Reconectando…`;
  else if (isHost && lobby) sub = drag ? "Suéltalo aquí" : "Arrastra aquí a un jugador para que su pantalla muestre la partida";
  else sub = "Cada uno juega en su pantalla";

  return (
    <div
      ref={spotRef}
      className={`tv-central-spot${central ? " is-set" : ""}${central && !central.connected ? " is-away" : ""}${drag ? " is-armed" : ""}${
        drag?.over ? " is-over" : ""
      }`}
      aria-live="polite"
    >
      <span className="tv-central-spot-icon">
        {central ? <Avatar name={central.name} avatar={central.avatar} /> : <Icon name="tv" size={20} strokeWidth={2.4} />}
        {central && (
          <span className="tv-central-spot-badge">
            <Icon name="tv" size={11} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="tv-central-spot-text">
        <strong>Dispositivo central</strong>
        <span>{sub}</span>
      </span>
      {central && isHost && (
        <button
          type="button"
          className={`tv-central-spot-x${confirmOff ? " is-confirm" : ""}`}
          data-sound="back"
          onClick={takeOff}
          aria-label={confirmOff ? "Toca otra vez para quitar el dispositivo central" : "Quitar el dispositivo central"}
          title="Quitar el dispositivo central"
        >
          {confirmOff ? "¿Quitar?" : <Icon name="close" size={16} strokeWidth={3} />}
        </button>
      )}
    </div>
  );
}
