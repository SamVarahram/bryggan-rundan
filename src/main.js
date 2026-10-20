import "./style.css";
import { EVENT_DATE, stops } from "./stops.js";
import { createWalkMap } from "./walk-map.js";

const STORAGE_VISITED = "pubar-pa-rad-visited";

let visited = new Set(JSON.parse(localStorage.getItem(STORAGE_VISITED) || "[]"));

function assetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

function parseTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Current time in minutes since midnight. Supports a `?time=HH:MM` query
 * parameter so the "Du är här"-logic and the map start can be tested.
 */
function currentMinutes() {
  const override = new URLSearchParams(window.location.search).get("time");
  if (override && /^\d{1,2}:\d{2}$/.test(override)) {
    return parseTime(override);
  }
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getCurrentStopIndex() {
  const minutes = currentMinutes();

  return stops.findIndex((stop, index) => {
    const stopMinutes = parseTime(stop.time);
    const next = stops[index + 1];

    if (!next) {
      return minutes >= stopMinutes;
    }

    const nextMinutes = parseTime(next.time);
    return minutes >= stopMinutes && minutes < nextMinutes;
  });
}

function mapsUrl(stop) {
  const query = encodeURIComponent(stop.address || `${stop.lat},${stop.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function saveVisited() {
  localStorage.setItem(STORAGE_VISITED, JSON.stringify([...visited]));
}

function renderStopCards() {
  const currentStopIndex = getCurrentStopIndex();

  return stops
    .map((stop, index) => {
      const isCurrent = index === currentStopIndex;
      const isVisited = visited.has(index);
      const activeClass = isCurrent ? " stop-card-current" : "";
      const visitedClass = isVisited ? " stop-card-visited" : "";

      return `
        <li class="stop-card${activeClass}${visitedClass}" data-stop-index="${index}">
          <div class="stop-row">
            <label class="stop-check">
              <input type="checkbox" class="visit-checkbox" data-index="${index}" ${isVisited ? "checked" : ""} />
              <span class="check-ui" aria-hidden="true"></span>
              <h3>${index + 1}. ${stop.name}</h3>
            </label>
            <div class="stop-meta">
              ${isCurrent ? '<span class="current-badge">Du är här</span>' : ""}
              <span class="stop-time">${stop.time}</span>
            </div>
          </div>
          <p class="stop-address">${stop.address}</p>
          <p><span class="pill pill-${stop.tag}">${stop.tag}</span> Förslag: <strong>${stop.drink}</strong></p>
          <div class="stop-links">
            <a class="maps-link" href="${mapsUrl(stop)}" target="_blank" rel="noopener noreferrer">Öppna i Maps</a>
            <button type="button" class="maps-link show-on-map" data-index="${index}">Visa på kartan</button>
          </div>
        </li>
      `;
    })
    .join("");
}

function render() {
  const currentStopIndex = getCurrentStopIndex();
  const visitedCount = visited.size;

  document.querySelector("#app").innerHTML = `
    <main class="layout">
      <header class="hero">
        <p class="eyebrow">Varför är vi här?</p>
        <h1>Pubar på rad, ingen är glad!</h1>
        <p class="hero-text">${EVENT_DATE}. Rundan startar ${stops[0].time} på ${stops[0].name}. Vi äter mat här tillsammans så magen är redo för kvällen!</p>
        <div class="hero-actions">
          <button type="button" id="share-btn" class="btn btn-primary">Dela rundan</button>
          <span id="share-status" class="share-status" aria-live="polite"></span>
        </div>
      </header>

      <section class="panel stops-panel">
        <div class="stops-header">
          <h2>Pubar & drinkar</h2>
          <p class="progress">${visitedCount} / ${stops.length} besökta</p>
        </div>
        <div class="stop-list-scroll">
          <ul class="stop-list">${renderStopCards()}</ul>
        </div>
      </section>

      <section id="walk-section"></section>

      <footer class="panel safety">
        <h2>Plan B</h2>
        <p>Om du blir för full kan du istället köpa Sam dina drinkar — du kan dricksa med Swish på <a class="swish-link" href="swish://payment?data=%7B%22version%22%3A1%2C%22payee%22%3A%7B%22value%22%3A%220707877793%22%7D%7D">+46 70 787 77 93</a>.</p>
      </footer>
    </main>
  `;

  // The walk starts at the stop we're at right now (based on the clock),
  // or from the beginning if the evening hasn't started yet.
  const walkMap = createWalkMap({
    section: document.querySelector("#walk-section"),
    stops,
    startIndex: Math.max(0, currentStopIndex),
    currentStopIndex,
    mapsUrl,
    assetUrl,
  });

  bindEvents(walkMap);
}

function bindEvents(walkMap) {
  bindStopListEvents(walkMap);
  document.querySelector("#share-btn").addEventListener("click", shareCrawl);
}

function updateStopList(walkMap) {
  const list = document.querySelector(".stop-list");
  const progress = document.querySelector(".progress");
  if (!list || !progress) return;

  list.innerHTML = renderStopCards();
  progress.textContent = `${visited.size} / ${stops.length} besökta`;
  bindStopListEvents(walkMap);
}

function bindStopListEvents(walkMap) {
  document.querySelectorAll(".visit-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      if (event.target.checked) {
        visited.add(index);
      } else {
        visited.delete(index);
      }
      saveVisited();
      updateStopList(walkMap);
    });
  });

  document.querySelectorAll(".show-on-map").forEach((button) => {
    button.addEventListener("click", (event) => {
      walkMap.scrollToStop(Number(event.currentTarget.dataset.index));
    });
  });
}

async function shareCrawl() {
  const url = window.location.href;
  const title = "Pubar på rad igen är glad";
  const text = `Häng med på pubrundan ${EVENT_DATE}! ${stops.length} stopp från ${stops[0].time} till ${stops[stops.length - 1].time}.`;

  const status = document.querySelector("#share-status");

  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      status.textContent = "Delat!";
    } else {
      await navigator.clipboard.writeText(url);
      status.textContent = "Länk kopierad!";
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      status.textContent = "Kunde inte dela — kopiera länken manuellt.";
    }
  }

  if (status.textContent) {
    setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }
}

render();
