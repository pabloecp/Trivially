import { randomBytes } from "node:crypto";
import { geoArea, geoCentroid, geoDistance, geoNaturalEarth1 } from "d3-geo";
import { countryFeatures } from "./worldMap.js";

// The silhouettes of Encuentra el país's "Sombra" rounds, drawn here from the same map file the players see
// (world-atlas countries-50m). Players get it from /api/geo/shape/<token>, like the flags: the token is random, so
// the address never names the country, and what comes back is only a path, never a name or a coordinate on the
// globe.

const EARTH_KM = 6371;
// The silhouette is drawn in a box this big, then the box is cut to its shape.
const BOX = 400;
const PAD = 8;
// Pieces of the country far from its main land (Alaska and Hawái, la Guayana Francesa, Galápagos, Canarias...) are
// left out, so the main shape isn't a dot in a big empty box. A piece stays when it is at most NEAR_KM of sea from a
// piece that stays (so a chain of islands stays whole: Indonesia, Filipinas, Japón), or when it is big (BIG_SHARE of
// the main land: Malasia's peninsula) and its centre is at most FAR_KM from the main land's.
const NEAR_KM = 400;
const BIG_SHARE = 0.25;
const FAR_KM = 3000;
// Points closer than this (in the box's units) to the last one kept are dropped: the path stays light.
const MIN_STEP = 1;
// A silhouette with fewer points than this is only a blob (Vaticano, Mónaco, Singapur, Barbados...), and one whose land
// fills less than this share of its box is a few dots in the sea (Kiribati, Tonga, Islas Marshall): those countries
// are never asked as a "Sombra".
const MIN_POINTS = 24;
const MIN_FILL = 0.02;

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const tokens = new Map();
const shapes = new Map();

export function shapeToken(map) {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (now - entry.at > TOKEN_TTL_MS) tokens.delete(token);
  }
  const token = randomBytes(12).toString("base64url");
  tokens.set(token, { map, at: now });
  return token;
}

/** The map names behind a token, or null if it doesn't exist or expired. */
export function shapeForToken(token) {
  const entry = tokens.get(String(token || ""));
  if (!entry || Date.now() - entry.at > TOKEN_TTL_MS) return null;
  return entry.map;
}

export function shapeUrl(token) {
  return `/api/geo/shape/${token}`;
}

const toRad = Math.PI / 180;
const toVec = ([lng, lat]) => [Math.cos(lat * toRad) * Math.cos(lng * toRad), Math.cos(lat * toRad) * Math.sin(lng * toRad), Math.sin(lat * toRad)];

// Every polygon of the country's features, each with its area, its centre (also as a unit vector), its radius (the
// one of a circle of its area, in radians: on a sphere of radius 1 an area is in steradians) and its coast's points
// as unit vectors.
function polygonsOf(names) {
  const out = [];
  for (const f of countryFeatures(names)) {
    const list = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const coordinates of list) {
      const polygon = { type: "Polygon", coordinates };
      const area = geoArea(polygon);
      const centre = geoCentroid(polygon);
      out.push({ polygon, area, centre, at: toVec(centre), radius: Math.sqrt(area / Math.PI), coast: coordinates[0].map(toVec) });
    }
  }
  return out;
}

// How much sea (in radians, about) there is between a piece and another: from the piece's centre to the other's
// nearest point of coast, less the piece's own radius.
function gap(piece, other) {
  let best = -1;
  for (const v of other.coast) {
    const dot = piece.at[0] * v[0] + piece.at[1] * v[1] + piece.at[2] * v[2];
    if (dot > best) best = dot;
  }
  return Math.acos(Math.min(1, best)) - piece.radius;
}

/** The pieces of the country its silhouette shows: the main land and what is near it (see NEAR_KM). */
export function shapePieces(names) {
  const all = polygonsOf(names);
  const main = all.reduce((a, b) => (b.area > a.area ? b : a));
  const kept = all.filter((p) => p === main || (p.area >= main.area * BIG_SHARE && geoDistance(p.centre, main.centre) <= FAR_KM / EARTH_KM));
  // The rest join one by one when they are near a piece that stays, until none is left near enough.
  const rest = all.filter((p) => !kept.includes(p));
  const near = NEAR_KM / EARTH_KM;
  // The nearest sea to the pieces that stay so far, for each piece left; only the newly kept ones are measured again.
  const nearest = new Map(rest.map((p) => [p, Math.min(...kept.map((k) => gap(p, k)))]));
  let added = true;
  while (added) {
    added = false;
    for (const p of rest) {
      if (kept.includes(p) || nearest.get(p) > near) continue;
      kept.push(p);
      added = true;
      for (const q of rest) if (!kept.includes(q)) nearest.set(q, Math.min(nearest.get(q), gap(q, p)));
    }
  }
  return { main, kept, all };
}

/**
 * The silhouette of a country (its names in the map file) as an SVG path and the viewBox around it. It is drawn with
 * the game map's projection (Natural Earth), turned so the country is in the middle: a country across the 180th
 * meridian (Rusia, Fiyi) comes out whole.
 */
export function countryShape(names) {
  const key = names.join("|");
  if (!shapes.has(key)) {
    const { main, kept } = shapePieces(names);
    const projection = geoNaturalEarth1().rotate([-main.centre[0], 0]);
    const collection = { type: "FeatureCollection", features: kept.map((p) => ({ type: "Feature", geometry: p.polygon })) };
    projection.fitExtent([[PAD, PAD], [BOX - PAD, BOX - PAD]], collection);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const parts = [];
    let count = 0;
    let land = 0;
    for (const { polygon } of kept) {
      for (const ring of polygon.coordinates) {
        const points = [];
        for (const lngLat of ring) {
          const [x, y] = projection(lngLat);
          const last = points[points.length - 1];
          if (last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP) continue;
          points.push([x, y]);
        }
        // An island smaller than the step is still drawn: as a little square, so it doesn't vanish.
        if (points.length < 3) {
          const [x, y] = points[0];
          points.splice(0, points.length, [x - 1, y - 1], [x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1]);
        }
        count += points.length;
        let twiceArea = 0;
        points.forEach(([x, y], i) => {
          const [nx, ny] = points[(i + 1) % points.length];
          twiceArea += x * ny - nx * y;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        });
        land += Math.abs(twiceArea) / 2;
        parts.push(`M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`);
      }
    }
    const viewBox = [minX - PAD, minY - PAD, maxX - minX + 2 * PAD, maxY - minY + 2 * PAD].map((n) => Math.round(n * 10) / 10);
    const fill = land / (viewBox[2] * viewBox[3]);
    shapes.set(key, { viewBox: viewBox.join(" "), d: parts.join(""), points: count, fill });
  }
  const { viewBox, d } = shapes.get(key);
  return { viewBox, d };
}

/** Whether a country's silhouette says something (see MIN_POINTS and MIN_FILL). */
export function hasShape(names) {
  if (!names?.length) return false;
  countryShape(names);
  const { points, fill } = shapes.get(names.join("|"));
  return points >= MIN_POINTS && fill >= MIN_FILL;
}
