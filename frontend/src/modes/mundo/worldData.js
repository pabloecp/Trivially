import { useEffect, useState } from "react";
import { geoArea, geoCentroid, geoContains, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
// The same file the server measures pins against (backend/src/geo/worldMap.js), so a pin is judged on the borders
// the player saw. Loaded on demand: only Geografía needs it.
import worldUrl from "world-atlas/countries-50m.json?url";

// The map is drawn in a 1000-unit-wide space; its height follows from the projection.
export const MAP_WIDTH = 1000;
// Countries whose main land is smaller than this (in map units, about 120 km) get a dot so they can be seen and hit.
const TINY_SIZE = 4;

// Quick jumps of the map, as [west, south, east, north] in degrees.
export const REGIONS = [
  { id: "mundo", label: "Mundo" },
  { id: "norte", label: "Norteamérica", box: [-168, 14, -52, 72] },
  { id: "caribe", label: "Caribe", box: [-92, 7, -59, 27] },
  { id: "sur", label: "Sudamérica", box: [-92, -56, -33, 13] },
  { id: "europa", label: "Europa", box: [-25, 35, 42, 71] },
  { id: "africa", label: "África", box: [-19, -36, 53, 38] },
  { id: "oriente", label: "Oriente Medio", box: [25, 11, 63, 43] },
  { id: "asia", label: "Asia", box: [60, -11, 150, 55] },
  { id: "oceania", label: "Oceanía", box: [110, -48, 180, 12] },
];

let loading = null;

/** The world, ready to draw: one path per country, the projection and the size. Loaded once. */
export function loadWorld() {
  if (!loading) {
    loading = fetch(worldUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(buildWorld)
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

// The biggest polygon of a country: France without French Guiana, the United States without Alaska.
function mainPolygon(f) {
  const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let main = polygons[0];
  let area = -1;
  for (const coordinates of polygons) {
    const a = geoArea({ type: "Polygon", coordinates });
    if (a > area) {
      area = a;
      main = coordinates;
    }
  }
  return { type: "Polygon", coordinates: main };
}

const flatBox = ([[x0, y0], [x1, y1]]) => [x0, y0, x1, y1];

function buildWorld(topology) {
  // Antarctica is never asked and would take a third of the height.
  const features = feature(topology, topology.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
  const collection = { type: "FeatureCollection", features };
  const projection = geoNaturalEarth1().fitWidth(MAP_WIDTH, collection);
  const path = geoPath(projection);
  const [, [, bottom]] = path.bounds(collection);
  const countries = features.map((f) => {
    const main = mainPolygon(f);
    const mainBox = flatBox(path.bounds(main));
    const centerLngLat = geoCentroid(main);
    return {
      name: f.properties.name,
      d: path(f),
      feature: f,
      box: flatBox(path.bounds(f)),
      mainBox,
      size: Math.max(mainBox[2] - mainBox[0], mainBox[3] - mainBox[1]),
      centerLngLat,
      center: projection(centerLngLat),
    };
  });
  return {
    width: MAP_WIDTH,
    height: Math.ceil(bottom),
    projection,
    path,
    sphere: path({ type: "Sphere" }),
    countries,
    shapes: countries.map(({ name, d }) => ({ name, d })),
    tiny: countries.filter((c) => c.size < TINY_SIZE),
    byName: new Map(countries.map((c) => [c.name, c])),
  };
}

export function useWorld() {
  const [state, setState] = useState({ world: null, error: null });
  useEffect(() => {
    let alive = true;
    loadWorld()
      .then((world) => alive && setState({ world, error: null }))
      .catch(() => alive && setState({ world: null, error: "No se pudo cargar el mapa. Revisa tu conexión." }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** A map point ([x, y]) as [lng, lat], or null when it is off the globe. */
export function toLngLat(world, point) {
  const lngLat = world.projection.invert(point);
  if (!lngLat || !lngLat.every(Number.isFinite)) return null;
  const back = world.projection(lngLat);
  if (!back || Math.hypot(back[0] - point[0], back[1] - point[1]) > 0.5) return null;
  return lngLat;
}

/** The country (its name in the map file) a [lng, lat] point is in, or null at sea. */
export function countryAt(world, lngLat) {
  const p = world.projection(lngLat);
  if (!p) return null;
  for (const c of world.countries) {
    const [x0, y0, x1, y1] = c.box;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
    if (geoContains(c.feature, lngLat)) return c.name;
  }
  return null;
}

/** The box ([x0, y0, x1, y1]) around the main land of some countries: what the reveal zooms to. */
export function mainBounds(world, names) {
  let box = null;
  for (const name of names || []) {
    const c = world.byName.get(name);
    if (!c) continue;
    const [x0, y0, x1, y1] = c.mainBox;
    box = box ? [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)] : [x0, y0, x1, y1];
  }
  return box;
}

/** A region of REGIONS as a box on the map (the projection bends its edges, so they are sampled). */
export function regionBounds(world, [west, south, east, north]) {
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i <= 8; i += 1) {
    for (let j = 0; j <= 8; j += 1) {
      const p = world.projection([west + ((east - west) * i) / 8, south + ((north - south) * j) / 8]);
      if (!p) continue;
      box = [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])];
    }
  }
  return box;
}
