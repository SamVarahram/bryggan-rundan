// Scroll-driven "walk along the route" map.
//
// A tall section with a sticky full-screen map: as the page scrolls, the
// camera walks along the real walking route, pausing at each stop while an
// annotation card fades in. Inspired by the venue map in Forskåpong.

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CONFIG } from "./stops.js";
import { buildPath, loadWalkingRoute, straightRoute } from "./route.js";
import { annotationState, buildSegments, cameraAt } from "./camera.js";
import { clamp } from "./geo.js";

const ROUTE_SOURCE = "walk-route";

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function formatKm(metres) {
  return `${(metres / 1000).toFixed(1).replace(".", ",")} km`;
}

function directionsUrl(stops) {
  const coord = (s) => `${s.lat},${s.lng}`;
  const origin = coord(stops[0]);
  const destination = coord(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(coord).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${encodeURIComponent(waypoints)}&travelmode=walking`;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.section   Empty <section> to render into
 * @param {Array} options.stops
 * @param {number} options.startIndex     Stop to start the walk from
 * @param {number} options.currentStopIndex  Stop that is "now" (-1 if none)
 * @param {(stop) => string} options.mapsUrl
 * @param {(path: string) => string} options.assetUrl
 */
export function createWalkMap({ section, stops, startIndex, currentStopIndex, mapsUrl, assetUrl }) {
  const { camera, colors, scroll } = MAP_CONFIG;

  // ---------- DOM ----------
  section.classList.add("walk-section");
  section.innerHTML = "";

  const sticky = el("div", "walk-sticky");
  const mapEl = el("div", "walk-map");
  mapEl.setAttribute("aria-label", "Karta över pubrundan");
  const overlay = el("div", "walk-overlay");

  const topbar = el("div", "walk-topbar");
  const title = el("div", "walk-title");
  title.appendChild(el("h2", null, "Karta"));
  const subtitle = el("p", "walk-subtitle", `${stops.length} stopp`);
  title.appendChild(subtitle);
  const toggleBtn = el("button", "btn btn-ghost walk-toggle");
  toggleBtn.type = "button";
  topbar.append(title, toggleBtn);

  const annotationsEl = el("div", "walk-annotations");
  const annotationEls = stops.map((stop, k) => {
    const wrap = el("div", "walk-annotation");
    wrap.dataset.stop = String(k);
    const imageHtml = stop.image
      ? `<img class="walk-annotation-image" src="${assetUrl(stop.image)}" alt="" loading="lazy" />`
      : "";
    const nowBadge = k === currentStopIndex ? '<span class="current-badge">Du är här</span>' : "";
    wrap.innerHTML = `
      <div class="walk-annotation-card">
        ${imageHtml}
        <div class="walk-annotation-body">
          <p class="walk-annotation-index">Stopp ${k + 1} av ${stops.length} ${nowBadge}</p>
          <h3>${stop.name}</h3>
          <p class="walk-annotation-meta">
            <span class="stop-time">${stop.time}</span>
            <span class="pill pill-${stop.tag}">${stop.tag}</span>
          </p>
          <p class="walk-annotation-drink">Förslag: <strong>${stop.drink}</strong></p>
          <a class="maps-link" href="${mapsUrl(stop)}" target="_blank" rel="noopener noreferrer">Öppna i Maps</a>
        </div>
      </div>
    `;
    annotationsEl.appendChild(wrap);
    return wrap;
  });

  const hint = el("div", "walk-hint", "<span>Scrolla för att gå rundan</span><span class=\"walk-hint-arrow\">↓</span>");

  const rail = el("div", "walk-rail");
  const railTrack = el("div", "walk-rail-track");
  const railFill = el("div", "walk-rail-fill");
  railTrack.appendChild(railFill);
  rail.appendChild(railTrack);
  const dotEls = stops.map((stop, k) => {
    const dot = el("button", "walk-dot");
    dot.type = "button";
    dot.title = `${k + 1}. ${stop.name} (${stop.time})`;
    dot.setAttribute("aria-label", dot.title);
    dot.style.left = `${(k / Math.max(1, stops.length - 1)) * 100}%`;
    dot.addEventListener("click", () => scrollToStop(k));
    rail.appendChild(dot);
    return dot;
  });

  overlay.append(topbar, annotationsEl, hint, rail);
  sticky.append(mapEl, overlay);
  section.appendChild(sticky);

  // ---------- State ----------
  let path = buildPath(straightRoute(stops));
  let plan = buildSegments(path, startIndex);
  let map = null;
  let styleReady = false;
  let walker = null;
  const markers = [];
  let isActive = true;
  let frame = 0;
  let lastProgress = -1;

  function applySectionHeight() {
    section.style.setProperty("--walk-track", `${plan.totalUnits * scroll.vhPerUnit}`);
  }

  function updateToggle() {
    if (plan.startIndex > 0) {
      toggleBtn.textContent = "Visa hela rundan";
      toggleBtn.hidden = false;
    } else if (currentStopIndex > 0) {
      toggleBtn.textContent = "Hoppa till nu";
      toggleBtn.hidden = false;
    } else {
      toggleBtn.hidden = true;
    }
  }

  function updateSubtitle() {
    const km = path.total > 0 ? ` · ${formatKm(path.total)}` : "";
    const from = plan.startIndex > 0 ? ` · från ${stops[plan.startIndex].name}` : "";
    subtitle.textContent = `${stops.length} stopp${km}${from}`;
  }

  // ---------- Map ----------
  const startStop = stops[plan.startIndex];
  try {
    map = new maplibregl.Map({
      container: mapEl,
      style: MAP_CONFIG.style,
      center: [startStop.lng, startStop.lat],
      zoom: camera.dwell.zoom,
      pitch: camera.dwell.pitch,
      bearing: 0,
      maxPitch: 75,
      interactive: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
  } catch (error) {
    console.error("Kartan kunde inte skapas", error);
    section.classList.add("walk-fallback");
    overlay.innerHTML = "";
    const fallback = el(
      "div",
      "walk-fallback-card",
      `<h2>Karta</h2><p>Kartan kunde inte laddas i den här webbläsaren.</p><a class="btn btn-primary" href="${directionsUrl(stops)}" target="_blank" rel="noopener noreferrer">Öppna rutten i Google Maps</a>`,
    );
    overlay.appendChild(fallback);
    return { setStartIndex() {}, scrollToStop() {} };
  }

  map.on("error", (e) => {
    // Tile/style errors shouldn't break the page – just log them.
    if (e?.error) console.warn("Kartfel:", e.error.message || e.error);
  });

  map.on("load", () => {
    styleReady = true;
    addBuildings();
    addRouteLayers();
    collapseAttribution();
    update(true);
  });

  /** The compact attribution starts expanded and only collapses on map
   *  interaction – which never happens on a non-interactive map. */
  function collapseAttribution() {
    const details = mapEl.querySelector("details.maplibregl-ctrl-attrib");
    if (details) {
      details.open = false;
      details.classList.remove("maplibregl-compact-show");
    }
  }

  function addBuildings() {
    const b = MAP_CONFIG.buildings;
    if (!b.enabled) return;
    const layers = map.getStyle()?.layers || [];
    const firstSymbol = layers.find((l) => l.type === "symbol" && l.layout?.["text-field"])?.id;
    if (!map.getSource(b.source)) return;
    map.addLayer(
      {
        id: "walk-3d-buildings",
        source: b.source,
        "source-layer": b.sourceLayer,
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": b.color,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": b.opacity,
        },
      },
      firstSymbol,
    );
  }

  function routeGeoJson() {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: path.coords },
    };
  }

  function addRouteLayers() {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeGeoJson(), lineMetrics: true });
    map.addLayer({
      id: "walk-route-casing",
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "rgba(15, 23, 42, 0.7)", "line-width": 10, "line-blur": 2 },
    });
    map.addLayer({
      id: "walk-route-line",
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colors.route, "line-width": 5, "line-gradient": gradientExpression(0) },
    });
  }

  /** Gradient: skipped part (before start) → walked part → upcoming part. */
  function gradientExpression(distance) {
    if (!path.total) return colors.routeUpcoming;
    const skipped = clamp(path.stopDist[plan.startIndex] / path.total, 0, 1);
    const walked = clamp(Math.max(skipped, distance / path.total), 0, 1);
    const parts = [
      [0, skipped, colors.routeSkipped],
      [skipped, walked, colors.routeDone],
      [walked, 1, colors.routeUpcoming],
    ].filter(([from, to]) => to - from > 1e-6);
    if (parts.length === 1) return parts[0][2];
    const expr = ["step", ["line-progress"], parts[0][2]];
    for (let i = 1; i < parts.length; i++) expr.push(parts[i][0], parts[i][2]);
    return expr;
  }

  function setRouteData() {
    if (!styleReady) return;
    map.getSource(ROUTE_SOURCE)?.setData(routeGeoJson());
  }

  // ---------- Markers ----------
  // The walker is added first so stop markers render on top of it.
  const walkerEl = el("div", "walk-walker");
  walker = new maplibregl.Marker({ element: walkerEl, anchor: "center" })
    .setLngLat([startStop.lng, startStop.lat])
    .addTo(map);

  stops.forEach((stop, k) => {
    const node = el("button", "walk-marker", `<span>${k + 1}</span>`);
    node.type = "button";
    node.title = `${k + 1}. ${stop.name}`;
    node.setAttribute("aria-label", `Gå till ${stop.name}`);
    if (k === currentStopIndex) node.classList.add("is-now");
    node.addEventListener("click", () => scrollToStop(k));
    const marker = new maplibregl.Marker({ element: node, anchor: "center" })
      .setLngLat([stop.lng, stop.lat])
      .addTo(map);
    markers.push(marker);
  });

  function updateMarkerStates(progress) {
    stops.forEach((_, k) => {
      const node = markers[k].getElement();
      const dwell = plan.dwellByStop.get(k);
      const passed = k < plan.startIndex;
      const done = !!dwell && progress > dwell.p1;
      // "Active" follows the annotation card so marker, rail dot and card light up together
      const active = !!dwell && annotationState(progress, k, plan).opacity > 0.5;
      node.classList.toggle("is-passed", passed);
      node.classList.toggle("is-done", done);
      node.classList.toggle("is-active", active);
      dotEls[k].classList.toggle("is-passed", passed);
      dotEls[k].classList.toggle("is-done", done || active);
      dotEls[k].classList.toggle("is-active", active);
    });
  }

  // ---------- Scroll → camera ----------
  function getProgress() {
    const rect = section.getBoundingClientRect();
    const scrollable = section.offsetHeight - sticky.offsetHeight;
    if (scrollable <= 0) return 0;
    return clamp(-rect.top / scrollable, 0, 1);
  }

  function update(force = false) {
    frame = 0;
    const progress = getProgress();
    if (!force && progress === lastProgress) return;
    lastProgress = progress;

    const cam = cameraAt(progress, plan, path);
    map.jumpTo({
      center: cam.center,
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      // Keep the focus point in the lower part of the screen so the road
      // ahead fills the view (and the annotation card doesn't cover it).
      padding: { top: Math.round(sticky.offsetHeight * camera.focusOffset), bottom: 0, left: 0, right: 0 },
    });
    walker.setLngLat(path.rawAt(cam.distance));

    if (styleReady && map.getLayer("walk-route-line")) {
      map.setPaintProperty("walk-route-line", "line-gradient", gradientExpression(cam.distance));
    }

    annotationEls.forEach((node, k) => {
      const { opacity, y } = annotationState(progress, k, plan);
      node.style.opacity = opacity.toFixed(3);
      node.style.transform = `translateY(${y.toFixed(1)}px)`;
      node.style.visibility = opacity > 0.02 ? "visible" : "hidden";
    });

    updateMarkerStates(progress);
    // Fill the rail from the start-stop's dot to the current position
    const startFrac = plan.startIndex / Math.max(1, stops.length - 1);
    railFill.style.left = `${(startFrac * 100).toFixed(2)}%`;
    railFill.style.width = `${(progress * (1 - startFrac) * 100).toFixed(2)}%`;
    hint.style.opacity = String(clamp(1 - progress / 0.04, 0, 1));
  }

  function requestUpdate() {
    if (!isActive || frame) return;
    frame = requestAnimationFrame(() => update());
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", () => {
    lastProgress = -1;
    requestUpdate();
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        isActive = entry.isIntersecting;
        if (isActive) requestUpdate();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(section);
  }

  // ---------- Navigation ----------
  function sectionTop() {
    return section.getBoundingClientRect().top + window.scrollY;
  }

  function scrollToProgress(progress, behavior = "smooth") {
    const scrollable = section.offsetHeight - sticky.offsetHeight;
    window.scrollTo({ top: sectionTop() + progress * scrollable, behavior });
  }

  function scrollToStop(k) {
    if (k < plan.startIndex) setStartIndex(0, { scroll: false });
    const dwell = plan.dwellByStop.get(k);
    if (!dwell) return;
    scrollToProgress((dwell.p0 + dwell.p1) / 2);
  }

  function setStartIndex(index, { scroll: doScroll = true } = {}) {
    plan = buildSegments(path, index);
    applySectionHeight();
    updateToggle();
    updateSubtitle();
    lastProgress = -1;
    if (doScroll) scrollToProgress(0, "auto");
    update(true);
  }

  toggleBtn.addEventListener("click", () => {
    setStartIndex(plan.startIndex > 0 ? 0 : Math.max(0, currentStopIndex));
  });

  // ---------- Init ----------
  applySectionHeight();
  updateToggle();
  updateSubtitle();
  update(true);

  loadWalkingRoute(stops).then((route) => {
    path = buildPath(route);
    plan = buildSegments(path, plan.startIndex);
    applySectionHeight();
    updateSubtitle();
    setRouteData();
    lastProgress = -1;
    update(true);
  });

  return { setStartIndex, scrollToStop };
}
