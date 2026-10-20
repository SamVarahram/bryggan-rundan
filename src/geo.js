// Small geo/math helpers. All coordinates are [lng, lat] (MapLibre order).

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function distanceM([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Compass bearing in degrees (0 = north, 90 = east). */
export function bearingDeg([lng1, lat1], [lng2, lat2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Interpolate two angles along the shortest arc. */
export function lerpAngle(a, b, t) {
  let diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

/** Unwrap a sequence of angles so consecutive values never jump more than 180°. */
export function unwrapAngles(angles) {
  if (angles.length === 0) return [];
  const out = [angles[0]];
  for (let i = 1; i < angles.length; i++) {
    let diff = angles[i] - out[i - 1];
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    out.push(out[i - 1] + diff);
  }
  return out;
}

export function lerpPoint(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}
