import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

// The world map of the "Ubicación" questions: the same file the frontend draws (world-atlas countries-50m), so a pin
// is judged against the borders the player saw. Countries are looked up by their name in that file.

const require = createRequire(import.meta.url);
const EARTH_KM = 6371;
// A pin this close to the border counts as inside: the drawn map is simplified, and the smallest countries
// (Vaticano, Mónaco) are a dot even zoomed in.
export const INSIDE_TOLERANCE_KM = 15;

let countries = null;
const targets = new Map();

function loadCountries() {
  if (!countries) {
    const topology = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
    const all = feature(topology, topology.objects.countries).features;
    countries = new Map(all.map((f) => [f.properties.name, f]));
  }
  return countries;
}

export function hasCountry(name) {
  return loadCountries().has(name);
}

const toRad = Math.PI / 180;

function toVec([lng, lat]) {
  const l = lng * toRad;
  const p = lat * toRad;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

function toLngLat([x, y, z]) {
  return [Math.atan2(y, x) / toRad, Math.atan2(z, Math.hypot(x, y)) / toRad];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const angle = (a, b) => Math.atan2(norm(cross(a, b)), dot(a, b));

/** The closest point to `p` on the great-circle arc a–b, and how far it is (in radians). */
function closestOnArc(p, a, b) {
  const n = cross(a, b);
  const len = norm(n);
  if (len > 1e-12) {
    const u = [n[0] / len, n[1] / len, n[2] / len];
    const d = dot(p, u);
    const q = [p[0] - d * u[0], p[1] - d * u[1], p[2] - d * u[2]];
    const ql = norm(q);
    if (ql > 1e-12) {
      const c = [q[0] / ql, q[1] / ql, q[2] / ql];
      // The foot of the perpendicular is inside the arc (between a and b).
      if (dot(cross(a, c), u) >= 0 && dot(cross(c, b), u) >= 0) return { dist: Math.atan2(Math.abs(d), ql), point: c };
    }
  }
  const da = angle(p, a);
  const db = angle(p, b);
  return da <= db ? { dist: da, point: a } : { dist: db, point: b };
}

// The country (or countries: Somalia counts Somaliland too) as GeoJSON plus its borders as unit vectors.
function target(names) {
  const key = names.join("|");
  if (!targets.has(key)) {
    const features = names.map((name) => {
      const f = loadCountries().get(name);
      if (!f) throw new Error(`El mapa no tiene ${name}`);
      return f;
    });
    const rings = [];
    for (const f of features) {
      const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) rings.push(ring.map(toVec));
    }
    targets.set(key, { features, rings });
  }
  return targets.get(key);
}

/**
 * Where a pin ([lng, lat]) lands with respect to a country: inside it or not, how many km from its nearest border
 * (0 inside) and that nearest point, for drawing the line on the reveal map.
 */
export function locate(names, pin) {
  const { features, rings } = target(names);
  if (features.some((f) => geoContains(f, pin))) return { inside: true, distanceKm: 0, nearest: pin };
  const p = toVec(pin);
  let best = { dist: Infinity, point: null };
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const hit = closestOnArc(p, ring[i], ring[i + 1]);
      if (hit.dist < best.dist) best = hit;
    }
  }
  const distanceKm = best.dist * EARTH_KM;
  return { inside: distanceKm <= INSIDE_TOLERANCE_KM, distanceKm, nearest: toLngLat(best.point) };
}
