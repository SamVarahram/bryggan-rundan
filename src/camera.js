// Maps scroll progress (0..1) onto the route: the camera alternates between
// "dwelling" at a stop and "travelling" along the route to the next one.

import { MAP_CONFIG } from "./stops.js";
import { clamp, lerp, smoothstep } from "./geo.js";

/**
 * Split the journey into weighted segments starting from `startIndex`.
 * Each segment gets a progress range [p0, p1].
 */
export function buildSegments(path, startIndex) {
  const { scroll } = MAP_CONFIG;
  const stopCount = path.stopDist.length;
  const start = clamp(startIndex, 0, stopCount - 1);
  const segments = [];

  for (let k = start; k < stopCount; k++) {
    segments.push({ type: "dwell", stop: k, weight: scroll.dwellUnits });
    if (k < stopCount - 1) {
      const legDist = path.stopDist[k + 1] - path.stopDist[k];
      if (legDist > 1) {
        segments.push({
          type: "travel",
          from: k,
          to: k + 1,
          weight: clamp(legDist / scroll.metersPerUnit, scroll.minLegUnits, scroll.maxLegUnits),
        });
      }
    }
  }

  const totalUnits = segments.reduce((sum, s) => sum + s.weight, 0) || 1;
  let acc = 0;
  for (const s of segments) {
    s.p0 = acc / totalUnits;
    acc += s.weight;
    s.p1 = acc / totalUnits;
  }

  const dwellByStop = new Map(segments.filter((s) => s.type === "dwell").map((s) => [s.stop, s]));

  return { segments, totalUnits, startIndex: start, dwellByStop };
}

function findSegment(segments, progress) {
  const p = clamp(progress, 0, 1);
  for (const s of segments) {
    if (p >= s.p0 && p <= s.p1) return s;
  }
  return segments[segments.length - 1];
}

/** Smooth 0→1→0 bump used to zoom out in the middle of a leg. */
function bump(t) {
  return smoothstep(0, 0.35, t) * (1 - smoothstep(0.65, 1, t));
}

/**
 * Camera state for a given scroll progress.
 * Returns { center, zoom, pitch, bearing, distance, stopIndex|null }
 */
export function cameraAt(progress, plan, path) {
  const { camera } = MAP_CONFIG;
  const seg = findSegment(plan.segments, progress);
  const span = seg.p1 - seg.p0 || 1;
  const t = clamp((clamp(progress, 0, 1) - seg.p0) / span, 0, 1);

  if (seg.type === "dwell") {
    const d = path.stopDist[seg.stop];
    const { center, heading } = path.at(d);
    // Gentle orbit while standing still – starts/ends at the travel heading
    const orbit = Math.sin(Math.PI * t) * camera.dwellOrbitDeg;
    return {
      center,
      zoom: camera.dwell.zoom,
      pitch: camera.dwell.pitch,
      bearing: heading + orbit,
      distance: d,
      stopIndex: seg.stop,
    };
  }

  const d0 = path.stopDist[seg.from];
  const d1 = path.stopDist[seg.to];
  const d = lerp(d0, d1, t);
  const { center, heading } = path.at(d);
  const b = bump(t);
  return {
    center,
    zoom: lerp(camera.dwell.zoom, camera.travel.zoom, b),
    pitch: lerp(camera.dwell.pitch, camera.travel.pitch, b),
    bearing: heading,
    distance: d,
    stopIndex: null,
  };
}

/**
 * Opacity (0..1) and vertical offset (px) for stop `k`'s annotation.
 * Fades in over the last part of the incoming leg, stays during the dwell,
 * fades out over the first part of the outgoing leg. If two stops sit at the
 * same place (no leg between them) the cards cross-fade inside the dwells.
 */
export function annotationState(progress, k, plan) {
  const dwell = plan.dwellByStop.get(k);
  if (!dwell) return { opacity: 0, y: 16 };

  const idx = plan.segments.indexOf(dwell);
  const prev = plan.segments[idx - 1];
  const next = plan.segments[idx + 1];
  const span = dwell.p1 - dwell.p0;

  let inStart = dwell.p0;
  let inEnd = dwell.p0;
  if (prev?.type === "travel") inStart = dwell.p0 - (prev.p1 - prev.p0) * 0.3;
  else if (prev) inEnd = dwell.p0 + span * 0.2;

  let outStart = dwell.p1;
  let outEnd = dwell.p1;
  if (next?.type === "travel") outEnd = dwell.p1 + (next.p1 - next.p0) * 0.3;
  else if (next) outStart = dwell.p1 - span * 0.2;

  const p = clamp(progress, 0, 1);
  if (p < inStart || p > outEnd) return { opacity: 0, y: 16 };
  if (p < inEnd) {
    const u = (p - inStart) / (inEnd - inStart);
    return { opacity: smoothstep(0, 1, u), y: 16 * (1 - u) };
  }
  if (p > outStart) {
    const u = (p - outStart) / (outEnd - outStart);
    return { opacity: 1 - smoothstep(0, 1, u), y: -16 * u };
  }
  return { opacity: 1, y: 0 };
}
