import "./style.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const STORAGE_VISITED = "pubar-pa-rad-visited";
const EVENT_DATE = "1 september";

const stops = [
  {
    name: "Bene Pasta bar",
    address: "S:t Persgatan 35, 753 29 Uppsala",
    lat: 59.8630749,
    lng: 17.6453787,
    time: "17:00",
    drink: "Glas rött och MAT",
    tag: "vin",
  },
  {
    name: "Liljebaren",
    address: "Liljegatan 2, Uppsala",
    lat: 59.8592681,
    lng: 17.6569461,
    time: "18:30",
    drink: "Öl för 16 åringar",
    tag: "ol",
  },
  {
    name: "TacoBar",
    address: "Stationsgatan 12-16, 753 25 Uppsala",
    lat: 59.8585988,
    lng: 17.6491675,
    time: "19:00",
    drink: "Frostat glas å ÖL",
    tag: "ol",
  },
  {
    name: "O:conners",
    address: "Stora Torget 1, Uppsala",
    lat: 59.8582449,
    lng: 17.6386146,
    time: "19:30",
    drink: "Guinness",
    tag: "ol",
  },
  {
    name: "Ica City",
    address: "Svartbäcksgatan 7-11, Uppsala",
    lat: 59.8598469,
    lng: 17.6369864,
    time: "20:00",
    drink: "MAGI",
    tag: "special",
  },
  {
    name: "Sushi yama",
    address: "Svartbäcksgatan 7, Uppsala",
    lat: 59.8598469,
    lng: 17.6369864,
    time: "20:30",
    drink: "Soja?",
    tag: "alkoholfritt",
  },
  {
    name: "Monster Chicken",
    address: "Dragarbrunnsgatan 21, Uppsala",
    lat: 59.8618044,
    lng: 17.6356975,
    time: "21:00",
    drink: "Gochujang",
    tag: "mat",
  },
  {
    name: "Filmstaden Luxe",
    address: "Dragarbrunnsgatan 22, Uppsala",
    lat: 59.861272,
    lng: 17.6375857,
    time: "21:30",
    drink: "Movie Beer",
    tag: "ol",
  },
  {
    name: "Snerkes",
    address: "S:t Larsgatan 4, 753 11 Uppsala",
    lat: 59.858976,
    lng: 17.630683,
    time: "22:00",
    drink: "Vem har KK-kort?",
    tag: "special",
  },
];

let map;
let routeLine;
let markers = [];
let visited = new Set(JSON.parse(localStorage.getItem(STORAGE_VISITED) || "[]"));

function parseTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function getCurrentStopIndex() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return stops.findIndex((stop, index) => {
    const stopMinutes = parseTime(stop.time);
    const next = stops[index + 1];

    if (!next) {
      return currentMinutes >= stopMinutes;
    }

    const nextMinutes = parseTime(next.time);
    return currentMinutes >= stopMinutes && currentMinutes < nextMinutes;
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
          <a class="maps-link" href="${mapsUrl(stop)}" target="_blank" rel="noopener noreferrer">Öppna i Maps</a>
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
        <p class="eyebrow">Varför är vi här</p>
        <h1>Pubar på rad igen är glad</h1>
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

      <section class="panel">
        <div class="map-header">
          <h2>Karta</h2>
          <p>Tryck på en markör för att se drinkförslaget.${currentStopIndex >= 0 ? ` Nuvarande stopp: ${stops[currentStopIndex].name}.` : ""}</p>
        </div>
        <div id="map" aria-label="Karta över pubrundan"></div>
      </section>

      <footer class="panel safety">
        <h2>Plan B</h2>
        <p>Om du blir för full kan du istället köpa Sam dina drinkar — du kan dricksa med Swish på <a class="swish-link" href="swish://payment?data=%7B%22version%22%3A1%2C%22payee%22%3A%7B%22value%22%3A%220707877793%22%7D%7D">+46 70 787 77 93</a>.</p>
      </footer>
    </main>
  `;

  bindEvents();
  initMap(currentStopIndex);
}

function bindEvents() {
  document.querySelectorAll(".visit-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      if (event.target.checked) {
        visited.add(index);
      } else {
        visited.delete(index);
      }
      saveVisited();
      updateStopList();
    });
  });

  document.querySelector("#share-btn").addEventListener("click", shareCrawl);
}

function updateStopList() {
  const list = document.querySelector(".stop-list");
  const progress = document.querySelector(".progress");
  if (!list || !progress) return;

  list.innerHTML = renderStopCards();
  progress.textContent = `${visited.size} / ${stops.length} besökta`;
  bindVisitCheckboxesOnly();
}

function bindVisitCheckboxesOnly() {
  document.querySelectorAll(".visit-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      if (event.target.checked) {
        visited.add(index);
      } else {
        visited.delete(index);
      }
      saveVisited();
      updateStopList();
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

function initMap(currentStopIndex) {
  if (map) {
    map.remove();
    map = null;
    markers = [];
    routeLine = null;
  }

  map = L.map("map", { zoomControl: true }).setView([stops[0].lat, stops[0].lng], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const routePoints = stops.map((stop) => [stop.lat, stop.lng]);

  stops.forEach((stop, index) => {
    const isCurrent = index === currentStopIndex;
    const marker = L.marker([stop.lat, stop.lng]).addTo(map).bindPopup(`
        <strong>${index + 1}. ${stop.name}</strong><br/>
        ${stop.time}<br/>
        Förslag: ${stop.drink}<br/>
        <a href="${mapsUrl(stop)}" target="_blank" rel="noopener noreferrer">Öppna i Maps</a>
      `);

    if (isCurrent) {
      marker.openPopup();
    }

    markers.push(marker);
  });

  routeLine = L.polyline(routePoints, {
    color: "#ef4444",
    weight: 4,
    opacity: 0.9,
  }).addTo(map);

  map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
}

render();
