import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import { REGIONS, countryAt, mainBounds, regionBounds, toLngLat } from "./worldData.js";

const MAX_ZOOM = 40;
const OVERSHOOT = 0.3;
// A press that moves less than this (in screen px) is a tap, not a drag. Fingers wobble more than a mouse.
const TAP_SLOP = { mouse: 5, pen: 8, touch: 12 };
// Two taps this close in time and place zoom in.
const DOUBLE_TAP_MS = 330;
const DOUBLE_TAP_PX = 32;
// Tiny countries (islands, microstates) show as a dot once the map is zoomed in DOTS_FROM times (the whole world
// would be covered in them) and while their real shape is smaller than DOT_UNTIL px on screen; a tap within
// DOT_HIT px of a dot, out at sea, lands on that country.
const DOTS_FROM = 2;
const DOT_RADIUS = 4;
const DOT_UNTIL = 9;
const DOT_HIT = 16;
// Teardrop pin, its tip at (0, 0), in screen pixels; its round head is PIN_HEAD px above the tip.
const PIN_PATH = "M0 0C-5 -8 -11 -13 -11 -21A11 11 0 1 1 11 -21C11 -13 5 -8 0 0Z";
const PIN_HEAD = 21;
const MY_PIN_SCALE = 1.15;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// The countries never change, so they are drawn once; only the answer (reveal) and the country under this player's
// pin are re-drawn.
const Land = memo(function Land({ shapes, highlight, picked }) {
  return (
    <g className="tv-geo-land">
      {shapes.map((s) => (
        <path key={s.name} d={s.d} className={highlight.has(s.name) ? "is-target" : s.name === picked ? "is-picked" : undefined} />
      ))}
    </g>
  );
});

function Pin({ x, y, scale, color, label, mine, dragging }) {
  return (
    <g
      className={`tv-geo-pin${mine ? " is-mine" : ""}${dragging ? " is-dragging" : ""}`}
      transform={`translate(${x} ${y}) scale(${scale * (mine ? MY_PIN_SCALE : 1)})`}
      style={{ "--pin": color }}
    >
      <path d={PIN_PATH} />
      <circle cx="0" cy={-PIN_HEAD} r="4.5" />
      {label && (
        <text x="0" y="-38" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * The world map of Geografía, with a toolbar above it (quick jumps to each continent, enabled with `regions`, and
 * zoom). While `interactive`, a tap (or Enter on the crosshair, from the keyboard) calls `onPick([lng, lat])`, and the
 * pin can also be dragged. Dragging the map pans it (with a little glide), and the wheel, a pinch, a double tap or the
 * buttons zoom; nothing moves while `frozen` (the countdown). `myPin` is this player's pin while the round is open. At
 * the reveal, `target` (country names on the map) is painted, `pins` show everyone's answer with a line to the
 * closest border, and the view flies to them. `children` float over the map.
 */
export default function WorldMap({
  world,
  interactive = false,
  frozen = false,
  onPick,
  myPin = null,
  pins = [],
  target = null,
  label,
  regions = false,
  children,
}) {
  const W = world.width;
  const H = world.height;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const viewRef = useRef(view);
  // The view an animation is heading to: wheel notches in a row add up from there.
  const goal = useRef(null);
  const anim = useRef(0);
  const gesture = useRef(null);
  const lastTap = useRef(null);
  // This player's pin while it is being dragged ([lng, lat]).
  const [dragPin, setDragPin] = useState(null);
  const dragRef = useRef(null);
  // The focus ring and the keyboard's crosshair only show when the map was reached with the keyboard.
  const [keyboard, setKeyboard] = useState(false);
  const pressedAt = useRef(0);

  const aspect = size.w ? size.h / size.w : H / W;
  // The widest view: the whole world, whole in both directions (a wide, low frame shows sea at its sides).
  const fullW = Math.max(W, H / aspect);
  const WORLD = { x: 0, y: 0, w: Infinity };
  const fitted = useRef(false);

  // The view may go a little past the edge of the map (OVERSHOOT of its size), so a region near an edge (Europe at
  // the top of a tall phone) can still sit in the middle of the frame.
  function clamp(v) {
    const w = Math.min(fullW, Math.max(W / MAX_ZOOM, v.w));
    const h = w * aspect;
    const x = w >= W ? (W - w) / 2 : Math.min(W - w + w * OVERSHOOT, Math.max(-w * OVERSHOOT, v.x));
    const y = h >= H ? (H - h) / 2 : Math.min(H - h + h * OVERSHOOT, Math.max(-h * OVERSHOOT, v.y));
    return { x, y, w, h };
  }

  function apply(next) {
    const v = clamp(next);
    viewRef.current = v;
    setView(v);
    return v;
  }

  function stop() {
    cancelAnimationFrame(anim.current);
    goal.current = null;
  }

  function show(next) {
    stop();
    apply(next);
  }

  function animateTo(next, ms = 900, ease = easeInOut) {
    const to = clamp(next);
    if (reducedMotion() || ms <= 0) return show(to);
    stop();
    goal.current = to;
    const from = viewRef.current;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = ease(t);
      apply({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e });
      if (t < 1) anim.current = requestAnimationFrame(step);
      else goal.current = null;
    };
    anim.current = requestAnimationFrame(step);
  }

  // The view that shows a box ([x0, y0, x1, y1] in map units) with some margin, never closer than `minW` wide.
  function fitView([x0, y0, x1, y1], { pad = 0.1, minW = W / 12, top = 0 } = {}) {
    const bw = (x1 - x0) * (1 + pad * 2);
    const bh = (y1 - y0) * (1 + pad * 2) + top;
    const w = Math.max(bw, bh / aspect, minW);
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - top / 2 - (w * aspect) / 2, w };
  }

  // The box keeps the shape of its frame: a phone shows the whole world with sea above and below.
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
    if (!size.w) return;
    // The first time the frame is measured, the whole world; after that a resize keeps what was in view.
    show(fitted.current ? goal.current || viewRef.current : WORLD);
    fitted.current = true;
  }, [size.w, size.h]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Screen point → map point.
  function toMap(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return [v.x + ((clientX - rect.left) / rect.width) * v.w, v.y + ((clientY - rect.top) / rect.height) * v.h];
  }

  // Map units per screen pixel.
  const unitsPerPx = () => viewRef.current.w / (size.w || 1);

  function zoomAt(factor, [px, py], ms = 0) {
    const base = goal.current || viewRef.current;
    const w = Math.min(fullW, Math.max(W / MAX_ZOOM, base.w / factor));
    const k = w / base.w;
    const next = { x: px - (px - base.x) * k, y: py - (py - base.y) * k, w };
    if (ms) animateTo(next, ms, easeOut);
    else show(next);
  }

  function zoomCenter(factor) {
    const v = goal.current || viewRef.current;
    zoomAt(factor, [v.x + v.w / 2, v.y + v.h / 2], 260);
  }

  function goRegion(region) {
    if (!region.box) return animateTo(WORLD, 650);
    animateTo(fitView(regionBounds(world, region.box), { pad: 0.02, minW: 0 }), 650);
  }

  // Where a tap lands: the point itself, or the tiny country whose dot was tapped out at sea.
  function landing(point) {
    const lngLat = toLngLat(world, point);
    if (!lngLat) return null;
    if (W / viewRef.current.w < DOTS_FROM) return lngLat;
    const px = unitsPerPx();
    let best = null;
    for (const c of world.tiny) {
      if (c.size / px >= DOT_UNTIL) continue;
      const dist = Math.hypot(c.center[0] - point[0], c.center[1] - point[1]) / px;
      if (dist <= DOT_HIT && (!best || dist < best.dist)) best = { c, dist };
    }
    if (best && !countryAt(world, lngLat)) return best.c.centerLngLat;
    return lngLat;
  }

  function pick(point) {
    const lngLat = landing(point);
    if (lngLat) onPick?.(lngLat);
  }

  // A press on this player's own pin grabs it: the offset from the finger to the pin's tip.
  function grabPin(clientX, clientY) {
    if (!interactive || !myPin) return null;
    const p = world.projection(myPin);
    if (!p) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const tipX = rect.left + ((p[0] - v.x) / v.w) * rect.width;
    const tipY = rect.top + ((p[1] - v.y) / v.h) * rect.height;
    const headY = tipY - PIN_HEAD * MY_PIN_SCALE;
    const onHead = Math.hypot(clientX - tipX, clientY - headY) < 26;
    const onTip = Math.hypot(clientX - tipX, clientY - tipY) < 14;
    return onHead || onTip ? { dx: tipX - clientX, dy: tipY - clientY } : null;
  }

  // A tap places the pin (unless it was on the pin itself); the second tap of a double tap zooms in there instead.
  function tap(e, onPin) {
    const prev = lastTap.current;
    const point = toMap(e.clientX, e.clientY);
    if (prev && e.timeStamp - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_PX) {
      lastTap.current = null;
      zoomAt(2.5, point, 320);
      return;
    }
    lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (interactive && !onPin) pick(point);
  }

  // After a quick drag the map keeps sliding a little and slows down.
  function glide(samples, releasedAt) {
    if (reducedMotion() || samples.length < 2) return;
    const a = samples[0];
    const b = samples[samples.length - 1];
    if (releasedAt - b.t > 60 || b.t - a.t <= 0) return;
    let vx = (b.x - a.x) / (b.t - a.t);
    let vy = (b.y - a.y) / (b.t - a.t);
    if (Math.hypot(vx, vy) < 0.3) return;
    const rect = svgRef.current.getBoundingClientRect();
    let last = performance.now();
    stop();
    const step = (now) => {
      const dt = Math.min(34, now - last);
      last = now;
      const v = viewRef.current;
      apply({ x: v.x - ((vx * dt) / rect.width) * v.w, y: v.y - ((vy * dt) / rect.height) * v.h, w: v.w });
      const decay = 0.9 ** (dt / 16);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) > 0.02) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      if (frozen) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      const at = toMap(e.clientX, e.clientY);
      // A trackpad pinch (ctrl + wheel) follows the fingers; a mouse wheel zooms in smooth steps.
      if (e.ctrlKey) zoomAt(Math.exp(-dy * 0.01), at);
      else zoomAt(Math.exp(-Math.max(-160, Math.min(160, dy)) * 0.0035), at, 180);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  function onPointerDown(e) {
    pressedAt.current = Date.now();
    setKeyboard(false);
    if (frozen || (e.button && e.button !== 0)) return;
    try {
      svgRef.current.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone can't be captured; the gesture still works without it.
    }
    stop();
    const g = gesture.current || { pointers: new Map() };
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 1) {
      g.start = { x: e.clientX, y: e.clientY, view: viewRef.current };
      g.moved = false;
      g.multi = false;
      g.slop = TAP_SLOP[e.pointerType] || TAP_SLOP.mouse;
      g.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      g.grab = grabPin(e.clientX, e.clientY);
    } else if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.multi = true;
      g.grab = null;
      dragRef.current = null;
      setDragPin(null);
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
      const w = Math.min(fullW, Math.max(W / MAX_ZOOM, (g.pinch.view.w * g.pinch.dist) / dist));
      const mx = ((a.x + b.x) / 2 - rect.left) / rect.width;
      const my = ((a.y + b.y) / 2 - rect.top) / rect.height;
      apply({ x: g.pinch.mid[0] - mx * w, y: g.pinch.mid[1] - my * w * aspect, w });
      g.moved = true;
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < g.slop) return;
    g.moved = true;
    if (g.grab) {
      const lngLat = toLngLat(world, toMap(e.clientX + g.grab.dx, e.clientY + g.grab.dy));
      if (lngLat) {
        dragRef.current = lngLat;
        setDragPin(lngLat);
      }
      return;
    }
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 100) g.samples.shift();
    const v = g.start.view;
    apply({ x: v.x - (dx / rect.width) * v.w, y: v.y - (dy / rect.height) * v.h, w: v.w });
  }

  function onPointerUp(e) {
    const g = gesture.current;
    if (!g?.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 0) {
      if (g.grab && g.moved) {
        // The pin was dragged: it stays where it was let go.
        const point = toMap(e.clientX + g.grab.dx, e.clientY + g.grab.dy);
        const lngLat = e.type === "pointerup" ? landing(point) : null;
        if (lngLat) onPick?.(lngLat);
        dragRef.current = null;
        setDragPin(null);
      } else if (!g.moved && !g.multi && e.type === "pointerup") {
        tap(e, Boolean(g.grab));
      } else if (g.moved && !g.multi && e.type === "pointerup") {
        glide(g.samples, e.timeStamp);
      }
      gesture.current = null;
    } else if (g.pointers.size === 1) {
      // One finger left after a pinch: it pans from where it is.
      const [p] = [...g.pointers.values()];
      g.start = { x: p.x, y: p.y, view: viewRef.current };
      g.samples = [];
      g.pinch = null;
    }
  }

  function onKeyDown(e) {
    setKeyboard(true);
    if (frozen) return;
    const v = goal.current || viewRef.current;
    const step = 0.15;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      animateTo({ x: v.x + moves[e.key][0] * v.w, y: v.y + moves[e.key][1] * v.h, w: v.w }, 160, easeOut);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomCenter(1.8);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomCenter(1 / 1.8);
    } else if ((e.key === "Enter" || e.key === " ") && interactive) {
      e.preventDefault();
      pick([v.x + v.w / 2, v.y + v.h / 2]);
    }
  }

  const highlight = useMemo(() => new Set(target || []), [target?.join("|")]);
  const targetBox = useMemo(() => (target ? mainBounds(world, target) : null), [world, target?.join("|")]);
  const shownPin = dragPin || myPin;
  // The country under this player's pin, so they can see where it landed.
  const picked = useMemo(() => (interactive && shownPin ? countryAt(world, shownPin) : null), [world, interactive, shownPin?.join(",")]);

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
    // Room above the pins for their names.
    animateTo(fitView([x0, y0, x1, y1], { pad: 0.25, top: (x1 - x0 + y1 - y0) * 0.15 + 12 }));
  }, [targetBox, pinsKey, size.w, size.h]);

  // Screen pixels → map units, so pins, dots and labels keep their size at any zoom.
  const px = size.w ? view.w / size.w : 1;
  const tiny = targetBox && Math.max(targetBox[2] - targetBox[0], targetBox[3] - targetBox[1]) / px < 14;
  const mine = shownPin && world.projection(shownPin);
  const zoom = W / view.w;

  return (
    <div className="tv-geo-mapbox">
      {/* Above the map, never over it: a region the map flies to is never hidden under a button. */}
      <div className="tv-geo-toolbar">
        <div className="tv-geo-regions" role="toolbar" aria-label="Ir a una región del mapa">
          {REGIONS.map((r) => (
            <button key={r.id} type="button" onClick={() => goRegion(r)} disabled={!regions}>
              {r.id === "mundo" && <Icon name="globe" size={14} strokeWidth={2.6} />}
              {r.label}
            </button>
          ))}
        </div>
        <div className="tv-geo-zoom">
          <button type="button" onClick={() => zoomCenter(1 / 1.8)} disabled={frozen || view.w >= fullW - 0.5} aria-label="Alejar">
            <Icon name="minus" size={20} strokeWidth={3} />
          </button>
          <button type="button" onClick={() => zoomCenter(1.8)} disabled={frozen || zoom >= MAX_ZOOM - 0.01} aria-label="Acercar">
            <Icon name="plus" size={20} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className={`tv-geo-map${interactive ? " is-interactive" : ""}${dragPin ? " is-dragging" : ""}`} ref={wrapRef}>
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
          <Land shapes={world.shapes} highlight={highlight} picked={picked} />

          {world.tiny.map((c) =>
            (zoom >= DOTS_FROM || highlight.has(c.name)) && c.size / px < DOT_UNTIL ? (
              <circle
                key={c.name}
                className={`tv-geo-dot${highlight.has(c.name) ? " is-target" : c.name === picked ? " is-picked" : ""}`}
                cx={c.center[0]}
                cy={c.center[1]}
                r={DOT_RADIUS * px}
                style={{ strokeWidth: 1.5 * px }}
              />
            ) : null
          )}

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
          {mine && <Pin x={mine[0]} y={mine[1]} scale={px} color="var(--brand)" mine dragging={Boolean(dragPin)} />}

          {interactive && (
            <g className="tv-geo-crosshair" transform={`translate(${view.x + view.w / 2} ${view.y + view.h / 2}) scale(${px})`}>
              <path d="M-14 0H-5M5 0H14M0 -14V-5M0 5V14" />
            </g>
          )}
        </svg>

        {children}
      </div>
    </div>
  );
}
