import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import { mainBounds, toLngLat } from "./worldData.js";

const MAX_ZOOM = 40;
// A press that moves less than this (in screen px) is a tap, not a drag.
const TAP_SLOP = 7;
// Teardrop pin, its tip at (0, 0), in screen pixels.
const PIN_PATH = "M0 0C-5 -8 -11 -13 -11 -21A11 11 0 1 1 11 -21C11 -13 5 -8 0 0Z";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The countries never change, so they are drawn once; only the highlighted ones (the reveal's answer) re-render.
const Land = memo(function Land({ shapes, highlight }) {
  return (
    <g className="tv-geo-land">
      {shapes.map((s) => (
        <path key={s.name} d={s.d} className={highlight.has(s.name) ? "is-target" : undefined} />
      ))}
    </g>
  );
});

function Pin({ x, y, scale, color, label, mine, dim }) {
  return (
    <g
      className={`tv-geo-pin${mine ? " is-mine" : ""}${dim ? " is-dim" : ""}`}
      transform={`translate(${x} ${y}) scale(${scale * (mine ? 1.15 : 1)})`}
      style={{ "--pin": color }}
    >
      <path d={PIN_PATH} />
      <circle cx="0" cy="-21" r="4.5" />
      {label && (
        <text x="0" y="-38" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * The world map of Geografía. While `interactive`, a tap (or Enter on the crosshair, from the keyboard) calls
 * `onPick([lng, lat])`; dragging pans and the wheel, a pinch or the buttons zoom. `myPin` is this player's pin while
 * the round is open. At the reveal, `target` (country names on the map) is painted, `pins` show everyone's answer with
 * a line to the closest border, and the view flies to them.
 */
export default function WorldMap({ world, interactive = false, onPick, myPin = null, pins = [], target = null, label }) {
  const W = world.width;
  const H = world.height;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const viewRef = useRef(view);
  const anim = useRef(0);
  const gesture = useRef(null);
  // The focus ring and the keyboard's crosshair only show when the map was reached with the keyboard.
  const [keyboard, setKeyboard] = useState(false);
  const pressedAt = useRef(0);

  const aspect = size.w ? size.h / size.w : H / W;

  function clamp(v) {
    const w = Math.min(W, Math.max(W / MAX_ZOOM, v.w));
    const h = w * aspect;
    const x = w >= W ? (W - w) / 2 : Math.min(W - w, Math.max(0, v.x));
    const y = h >= H ? (H - h) / 2 : Math.min(H - h, Math.max(0, v.y));
    return { x, y, w, h };
  }

  function show(next) {
    cancelAnimationFrame(anim.current);
    const v = clamp(next);
    viewRef.current = v;
    setView(v);
  }

  function flyTo(next) {
    const to = clamp(next);
    const from = viewRef.current;
    if (reducedMotion()) return show(to);
    cancelAnimationFrame(anim.current);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const v = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e,
        h: from.h + (to.h - from.h) * e,
      };
      viewRef.current = v;
      setView(v);
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  // The box keeps the shape of the frame: a phone shows the whole world with sea above and below.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (size.w) show(viewRef.current);
  }, [size.w, size.h]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Screen point → map point.
  function toMap(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return [v.x + ((clientX - rect.left) / rect.width) * v.w, v.y + ((clientY - rect.top) / rect.height) * v.h];
  }

  function zoomAt(factor, [px, py]) {
    const v = viewRef.current;
    const w = Math.min(W, Math.max(W / MAX_ZOOM, v.w / factor));
    const k = w / v.w;
    show({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w });
  }

  function zoomCenter(factor) {
    const v = viewRef.current;
    zoomAt(factor, [v.x + v.w / 2, v.y + v.h / 2]);
  }

  function pick(point) {
    const lngLat = toLngLat(world, point);
    if (lngLat) onPick?.(lngLat);
  }

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0022), toMap(e.clientX, e.clientY));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  function onPointerDown(e) {
    pressedAt.current = Date.now();
    setKeyboard(false);
    if (e.button && e.button !== 0) return;
    try {
      svgRef.current.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone can't be captured; the gesture still works without it.
    }
    cancelAnimationFrame(anim.current);
    const g = gesture.current || { pointers: new Map(), moved: false, multi: false };
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 1) {
      g.start = { x: e.clientX, y: e.clientY, view: viewRef.current };
      g.moved = false;
      g.multi = false;
    } else if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.multi = true;
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: toMap((a.x + b.x) / 2, (a.y + b.y) / 2), view: viewRef.current };
    }
    gesture.current = g;
  }

  function onPointerMove(e) {
    const g = gesture.current;
    if (!g?.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = svgRef.current.getBoundingClientRect();
    if (g.pointers.size >= 2 && g.pinch) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const w = Math.min(W, Math.max(W / MAX_ZOOM, (g.pinch.view.w * g.pinch.dist) / dist));
      const h = w * aspect;
      const mx = ((a.x + b.x) / 2 - rect.left) / rect.width;
      const my = ((a.y + b.y) / 2 - rect.top) / rect.height;
      show({ x: g.pinch.mid[0] - mx * w, y: g.pinch.mid[1] - my * h, w });
      g.moved = true;
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    g.moved = true;
    const v = g.start.view;
    show({ x: v.x - (dx / rect.width) * v.w, y: v.y - (dy / rect.height) * v.h, w: v.w });
  }

  function onPointerUp(e) {
    const g = gesture.current;
    if (!g?.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 0) {
      if (!g.moved && !g.multi && e.type === "pointerup" && interactive) pick(toMap(e.clientX, e.clientY));
      gesture.current = null;
    } else if (g.pointers.size === 1) {
      // One finger left after a pinch: it pans from where it is.
      const [p] = [...g.pointers.values()];
      g.start = { x: p.x, y: p.y, view: viewRef.current };
      g.pinch = null;
    }
  }

  function onKeyDown(e) {
    setKeyboard(true);
    const v = viewRef.current;
    const step = 0.12;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      show({ x: v.x + moves[e.key][0] * v.w, y: v.y + moves[e.key][1] * v.h, w: v.w });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomCenter(1.6);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomCenter(1 / 1.6);
    } else if ((e.key === "Enter" || e.key === " ") && interactive) {
      e.preventDefault();
      pick([v.x + v.w / 2, v.y + v.h / 2]);
    }
  }

  const highlight = useMemo(() => new Set(target || []), [target?.join("|")]);
  const targetBox = useMemo(() => (target ? mainBounds(world, target) : null), [world, target?.join("|")]);

  // The reveal flies to the country and everyone's pins.
  const pinsKey = pins.map((p) => p.lngLat?.join(",")).join("|");
  useEffect(() => {
    if (!targetBox || !size.w) return;
    let [x0, y0, x1, y1] = targetBox;
    for (const p of pins) {
      const xy = p.lngLat && world.projection(p.lngLat);
      if (!xy) continue;
      x0 = Math.min(x0, xy[0]);
      y0 = Math.min(y0, xy[1]);
      x1 = Math.max(x1, xy[0]);
      y1 = Math.max(y1, xy[1]);
    }
    const pad = 0.3;
    const bw = (x1 - x0) * (1 + pad * 2);
    const bh = (y1 - y0) * (1 + pad * 2) + 40;
    const w = Math.max(bw, bh / aspect, W / 12);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - 8;
    flyTo({ x: cx - w / 2, y: cy - (w * aspect) / 2, w });
  }, [targetBox, pinsKey, size.w, size.h]);

  // Screen pixels → map units, so pins and labels keep their size at any zoom.
  const px = size.w ? view.w / size.w : 1;
  const tiny = targetBox && Math.max(targetBox[2] - targetBox[0], targetBox[3] - targetBox[1]) / px < 14;
  const mine = myPin && world.projection(myPin);
  const zoom = W / view.w;

  return (
    <div className={`tv-geo-map${interactive ? " is-interactive" : ""}`} ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={label}
        tabIndex={0}
        data-keyboard={keyboard || undefined}
        onFocus={() => setKeyboard(Date.now() - pressedAt.current > 400)}
        onBlur={() => setKeyboard(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <rect className="tv-geo-sea" x={-W} y={-H} width={W * 3} height={H * 3} />
        <path className="tv-geo-globe" d={world.sphere} />
        <Land shapes={world.shapes} highlight={highlight} />

        {tiny && (
          <circle
            className="tv-geo-target-ring"
            cx={(targetBox[0] + targetBox[2]) / 2}
            cy={(targetBox[1] + targetBox[3]) / 2}
            r={16 * px}
            style={{ strokeWidth: 3 * px }}
          />
        )}

        {pins.map((p) => {
          const from = p.lngLat && world.projection(p.lngLat);
          const to = !p.inside && p.nearest && world.projection(p.nearest);
          return from && to ? (
            <line
              key={`l-${p.id}`}
              className="tv-geo-line"
              x1={from[0]}
              y1={from[1]}
              x2={to[0]}
              y2={to[1]}
              style={{ "--pin": p.color, strokeWidth: 2.5 * px, strokeDasharray: `${6 * px} ${5 * px}` }}
            />
          ) : null;
        })}
        {pins.map((p) => {
          const xy = p.lngLat && world.projection(p.lngLat);
          return xy ? <Pin key={p.id} x={xy[0]} y={xy[1]} scale={px} color={p.color} label={p.label} mine={p.isMe} /> : null;
        })}
        {mine && <Pin x={mine[0]} y={mine[1]} scale={px} color="var(--brand)" mine />}

        {interactive && (
          <g className="tv-geo-crosshair" transform={`translate(${view.x + view.w / 2} ${view.y + view.h / 2}) scale(${px})`}>
            <path d="M-14 0H-5M5 0H14M0 -14V-5M0 5V14" />
          </g>
        )}
      </svg>

      <div className="tv-geo-zoom">
        <button type="button" onClick={() => zoomCenter(1.6)} disabled={zoom >= MAX_ZOOM - 0.01} aria-label="Acercar">
          <Icon name="plus" size={20} strokeWidth={3} />
        </button>
        <button type="button" onClick={() => zoomCenter(1 / 1.6)} disabled={zoom <= 1.01} aria-label="Alejar">
          <Icon name="minus" size={20} strokeWidth={3} />
        </button>
        <button type="button" onClick={() => flyTo({ x: 0, y: 0, w: W })} disabled={zoom <= 1.01} aria-label="Ver el mundo entero">
          <Icon name="globe" size={20} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
