// Fetches the walking route between the stops and turns it into a smooth
// "camera path" that the scroll-driven map walks along.
//
// Everything here is derived from `stops` – nothing is hand-tuned, so the
// route can be changed freely in stops.js.

import { MAP_CONFIG } from "./stops.js";
import { bearingDeg, clamp, distanceM, lerp, lerpPoint, unwrapAngles } from "./geo.js";

const SAMPLE_STEP_M = 2;

/**
 * All waypoints sent to the router, in walking order: each stop preceded by
 * its optional `via` points (extra places to pass on the way *to* that stop).
 * `stopAt[k]` is the index of stop k within `points`.
 */
function routeWaypoints(stops) {
  const points = [];
  const stopAt = [];
  stops.forEach((stop, k) => {
    if (k > 0) for (const v of stop.via || []) points.push([v.lng, v.lat]);
    stopAt.push(points.length);
    points.push([stop.lng, stop.lat]);
  });
  return { points, stopAt };
}

function routeCacheKey(stops) {
  const sig = routeWaypoints(stops)
    .points.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(";");
  return `${MAP_CONFIG.routing.cacheKey}:${sig}`;
}

/** Straight lines between the waypoints – used if routing is unavailable. */
export function straightRoute(stops) {
  const { points, stopAt } = routeWaypoints(stops);
  return {
    coords: points,
    stopIndices: stopAt,
    source: "straight",
  };
}

/**
 * For each snapped waypoint, find the index of the closest point in the
 * route geometry, searching forward from the previous stop so indices are
 * monotonic even when stops share coordinates.
 */
function matchStopIndices(coords, waypoints) {
  const indices = [];
  let from = 0;
  for (const wp of waypoints) {
    let best = from;
    let bestDist = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = distanceM(coords[i], wp);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    indices.push(best);
    from = best;
  }
  return indices;
}

async function fetchOsrmRoute(stops) {
  const { points, stopAt } = routeWaypoints(stops);
  const coordsParam = points.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `${MAP_CONFIG.routing.url}/${coordsParam}?overview=full&geometries=geojson&steps=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = await res.json();
    if (json.code !== "Ok" || !json.routes?.[0]) throw new Error("OSRM: no route");

    const coords = json.routes[0].geometry.coordinates;
    // Only the real stops get indices; `via` points just shape the line.
    const stopWaypoints = stopAt.map((i) => json.waypoints[i].location);
    return {
      coords,
      stopIndices: matchStopIndices(coords, stopWaypoints),
      source: "osrm",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Load the walking route for the stops. Tries localStorage cache first, then
 * OSRM, then falls back to straight lines.
 */
export async function loadWalkingRoute(stops) {
  if (stops.length < 2) return straightRoute(stops);

  const key = routeCacheKey(stops);
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.coords?.length && parsed.stopIndices?.length === stops.length) {
        return { ...parsed, source: "cache" };
      }
    }
  } catch {
    /* ignore cache errors */
  }

  try {
    const route = await fetchOsrmRoute(stops);
    try {
      localStorage.setItem(key, JSON.stringify({ coords: route.coords, stopIndices: route.stopIndices }));
    } catch {
      /* storage full / disabled */
    }
    return route;
  } catch (error) {
    console.warn("Kunde inte hämta gångrutt, använder raka linjer.", error);
    return straightRoute(stops);
  }
}

/** Resample a polyline into points every `step` metres. */
function resample(coords, step) {
  const samples = [coords[0]];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segLen = distanceM(a, b);
    if (segLen === 0) continue;
    let pos = step - carry;
    while (pos <= segLen) {
      samples.push(lerpPoint(a, b, pos / segLen));
      pos += step;
    }
    carry = segLen - (pos - step);
  }
  const last = coords[coords.length - 1];
  const tail = samples[samples.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) samples.push(last);
  return samples;
}

/** Box-filter smoothing of point positions. */
function smoothPoints(points, radius) {
  if (radius <= 0 || points.length < 3) return points.slice();
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(points.length - 1, i + radius);
    let sx = 0;
    let sy = 0;
    for (let j = lo; j <= hi; j++) {
      sx += points[j][0];
      sy += points[j][1];
    }
    const n = hi - lo + 1;
    out.push([sx / n, sy / n]);
  }
  return out;
}

/**
 * Build the camera path from a route.
 *
 * Returns:
 *   coords     – the route geometry ([lng, lat][])
 *   total      – route length in metres
 *   stopDist   – distance along the route for each stop
 *   at(d)      – { center, heading } for the (smoothed) camera at distance d
 *   rawAt(d)   – position exactly on the route at distance d (for the walker dot)
 */
export function buildPath(route) {
  const { camera } = MAP_CONFIG;
  const coords = route.coords;

  // Cumulative distance for the raw geometry → stop distances
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]));
  }
  const total = cum[cum.length - 1];
  const stopDist = route.stopIndices.map((i) => cum[i]);

  if (total < SAMPLE_STEP_M) {
    // Degenerate route (all stops at the same place)
    const p = coords[0];
    return {
      coords,
      total: 0,
      stopDist,
      at: () => ({ center: p, heading: 0 }),
      rawAt: () => p,
    };
  }

  const raw = resample(coords, SAMPLE_STEP_M);
  const smooth = smoothPoints(raw, Math.round(camera.smoothingM / SAMPLE_STEP_M));
  const n = raw.length;

  // Heading: local tangent of the smoothed path, unwrapped so it never jumps
  // by 360°, then averaged over a forward-leaning window. Averaging angles
  // (rather than taking a bearing between two points) stays continuous
  // through hairpins, e.g. walking into a side street and back out.
  const behind = Math.max(1, Math.round(camera.lookBehindM / SAMPLE_STEP_M));
  const ahead = Math.max(1, Math.round(camera.lookAheadM / SAMPLE_STEP_M));
  const tangents = unwrapAngles(
    smooth.map((_, i) => bearingDeg(smooth[Math.max(0, i - 1)], smooth[Math.min(n - 1, i + 1)])),
  );
  const headings = tangents.map((_, i) => {
    const lo = Math.max(0, i - behind);
    const hi = Math.min(n - 1, i + ahead);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += tangents[j];
    return sum / (hi - lo + 1);
  });

  function sampleIndex(d) {
    const u = clamp(d, 0, total) / SAMPLE_STEP_M;
    const i = Math.min(Math.floor(u), n - 2);
    return { i, t: clamp(u - i, 0, 1) };
  }

  return {
    coords,
    total,
    stopDist,
    at(d) {
      const { i, t } = sampleIndex(d);
      return {
        center: lerpPoint(smooth[i], smooth[i + 1], t),
        heading: lerp(headings[i], headings[i + 1], t),
      };
    },
    rawAt(d) {
      const { i, t } = sampleIndex(d);
      return lerpPoint(raw[i], raw[i + 1], t);
    },
  };
}
