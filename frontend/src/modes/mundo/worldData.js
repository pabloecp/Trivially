import { useEffect, useState } from "react";
import { geoArea, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
// The same file the server measures pins against (backend/src/geo/worldMap.js), so a pin is judged on the borders
// the player saw. Loaded on demand: only Geografía needs it.
import worldUrl from "world-atlas/countries-50m.json?url";

// The map is drawn in a 1000-unit-wide space; its height follows from the projection.
export const MAP_WIDTH = 1000;

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

function buildWorld(topology) {
  // Antarctica is never asked and would take a third of the height.
  const countries = feature(topology, topology.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
  const collection = { type: "FeatureCollection", features: countries };
  const projection = geoNaturalEarth1().fitWidth(MAP_WIDTH, collection);
  const path = geoPath(projection);
  const [, [, bottom]] = path.bounds(collection);
  return {
    width: MAP_WIDTH,
    height: Math.ceil(bottom),
    projection,
    path,
    sphere: path({ type: "Sphere" }),
    shapes: countries.map((f) => ({ name: f.properties.name, d: path(f) })),
    byName: new Map(countries.map((f) => [f.properties.name, f])),
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

/**
 * The box ([x0, y0, x1, y1]) around the main land of some countries: France without French Guiana, the United States
 * without Alaska. It is what the reveal zooms to.
 */
export function mainBounds(world, names) {
  let box = null;
  for (const name of names || []) {
    const f = world.byName.get(name);
    if (!f) continue;
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
    const [[x0, y0], [x1, y1]] = world.path.bounds({ type: "Polygon", coordinates: main });
    box = box ? [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)] : [x0, y0, x1, y1];
  }
  return box;
}
