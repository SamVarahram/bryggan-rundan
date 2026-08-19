import "./style.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const stops = [
  {
    name: "The Harbor Taproom",
    lat: 57.70645,
    lng: 11.96534,
    time: "18:00",
    drink: "Local Lager",
    tag: "beer",
    note: "Start light and grab water early.",
  },
  {
    name: "Copper Kettle",
    lat: 57.70481,
    lng: 11.97153,
    time: "19:00",
    drink: "House G&T",
    tag: "cocktail",
    note: "Ask for the citrus garnish.",
  },
  {
    name: "Neon Cellar",
    lat: 57.70288,
    lng: 11.97621,
    time: "20:00",
    drink: "Chilled Shot",
    tag: "shot",
    note: "Small round only, then move on.",
  },
  {
    name: "Midnight Social",
    lat: 57.70092,
    lng: 11.98042,
    time: "21:00",
    drink: "Berry Mocktail",
    tag: "mocktail",
    note: "Hydration stop and reset.",
  },
];

function getCurrentStopIndex() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return stops.findIndex((stop, index) => {
    const [hour, minute] = stop.time.split(":").map(Number);
    const stopMinutes = hour * 60 + minute;
    const next = stops[index + 1];

    if (!next) {
      return currentMinutes >= stopMinutes;
    }

    const [nextHour, nextMinute] = next.time.split(":").map(Number);
    const nextMinutes = nextHour * 60 + nextMinute;
    return currentMinutes >= stopMinutes && currentMinutes < nextMinutes;
  });
}

const currentStopIndex = getCurrentStopIndex();

const stopCards = stops
  .map((stop, index) => {
    const isCurrent = index === currentStopIndex;
    const activeClass = isCurrent ? " stop-card-current" : "";

    return `
      <li class="stop-card${activeClass}">
        <div class="stop-row">
          <h3>${index + 1}. ${stop.name}</h3>
          <span class="stop-time">${stop.time}</span>
        </div>
        <p><span class="pill pill-${stop.tag}">${stop.tag}</span> Suggested drink: <strong>${stop.drink}</strong></p>
        <p class="note">${stop.note}</p>
      </li>
    `;
  })
  .join("");

document.querySelector("#app").innerHTML = `
  <main class="layout">
    <header class="hero">
      <p class="eyebrow">Pubcrawl Night</p>
      <h1>Bryggan Rundan</h1>
      <p class="hero-text">Meet 17:45 at Harbor Square. Route starts 18:00. Walk together, hydrate often.</p>
    </header>

    <section class="panel">
      <h2>Stops & drinks</h2>
      <ul class="stop-list">${stopCards}</ul>
    </section>

    <section class="panel">
      <div class="map-header">
        <h2>Route map</h2>
        <p>Tap a marker for the drink at each stop.</p>
      </div>
      <div id="map" aria-label="Pubcrawl route map"></div>
    </section>

    <footer class="panel safety">
      <h2>Safety first</h2>
      <p>Water at every stop. Use buddy system. Taxi: +46 31-650000.</p>
    </footer>
  </main>
`;

const map = L.map("map", { zoomControl: true }).setView([stops[0].lat, stops[0].lng], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const routePoints = stops.map((stop) => [stop.lat, stop.lng]);

stops.forEach((stop, index) => {
  L.marker([stop.lat, stop.lng])
    .addTo(map)
    .bindPopup(
      `<strong>${index + 1}. ${stop.name}</strong><br/>${stop.time}<br/>Drink: ${stop.drink}`,
    );
});

const routeLine = L.polyline(routePoints, {
  color: "#ef4444",
  weight: 4,
  opacity: 0.9,
}).addTo(map);

map.fitBounds(routeLine.getBounds(), {
  padding: [24, 24],
});
