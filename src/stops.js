// =====================================================================
//  RUNDANS STOPP – ÄNDRA HÄR
// =====================================================================
//
//  Allt på sidan (listan, kartan, promenad-rutten, annoteringarna och
//  "Du är här"-logiken) genereras från listan `stops` nedan.
//  Lägg till, ta bort eller flytta om stopp – resten sköter sig självt:
//
//   • Gångrutten mellan stoppen hämtas automatiskt (OSRM, OpenStreetMap)
//     och följer riktiga gator. Ingen handritad rutt behövs.
//   • Kamerans "promenad" på kartan byggs automatiskt från rutten.
//   • Stoppen MÅSTE ligga i den ordning ni går dem, och `time` måste
//     vara stigande (HH:MM). Tiden styr vilket stopp som är "nu".
//
//  Fält per stopp:
//    name     – visas i listan och på kartan
//    address  – visas i listan + används för "Öppna i Maps"-länken
//    lat, lng – koordinater (högerklicka i Google Maps → kopiera)
//    time     – när ni är där, "HH:MM"
//    drink    – drinkförslag
//    tag      – en av: vin | ol | special | alkoholfritt | mat (styr färg på pillen)
//    image    – valfri bild i public/pubs/ (relativ sökväg, t.ex. "pubs/foo.jpg")
//    via      – valfritt: punkter rutten ska passera PÅ VÄG TILL det här
//               stoppet, t.ex. via: [{ lat: 59.8588, lng: 17.6420 }]
//               Använd om den automatiska gångvägen tar "fel" väg.
//
//  Se README.md för en längre förklaring.
//
//  Tips för test: lägg till ?time=20:15 i adressfältet för att låtsas
//  att klockan är 20:15 (styr "Du är här" och var kartan startar).
// =====================================================================

export const EVENT_DATE = "1 september";

export const stops = [
  {
    name: "Bene Pasta bar",
    address: "S:t Persgatan 35, 753 29 Uppsala",
    lat: 59.8630749,
    lng: 17.6453787,
    time: "17:00",
    drink: "Glas rött och MAT",
    tag: "vin",
    image: "pubs/bene-pasta-bar.jpg",
  },
  {
    name: "Liljebaren",
    address: "Liljegatan 2, Uppsala",
    lat: 59.8592681,
    lng: 17.6569461,
    time: "18:30",
    drink: "Öl för 16 åringar",
    tag: "ol",
    image: "pubs/sam.JPEG",
  },
  {
    name: "TacoBar",
    address: "Stationsgatan 12-16, 753 25 Uppsala",
    lat: 59.8585988,
    lng: 17.6491675,
    time: "19:00",
    drink: "Frostat glas å ÖL",
    tag: "ol",
    image: "pubs/valborg.jpg",
  },
  {
    name: "O:conners",
    address: "Stora Torget 1, Uppsala",
    lat: 59.8582449,
    lng: 17.6386146,
    time: "19:30",
    drink: "Guinness",
    tag: "ol",
    image: "pubs/mirre_skadad.PNG",
  },
  {
    name: "Ica City",
    address: "Svartbäcksgatan 7-11, Uppsala",
    lat: 59.8598469,
    lng: 17.6369864,
    time: "20:00",
    drink: "MAGI",
    tag: "special",
    image: "pubs/mirre_skadad.PNG",
  },
  {
    name: "Sushi yama",
    address: "Svartbäcksgatan 7, Uppsala",
    lat: 59.8598469,
    lng: 17.6369864,
    time: "20:30",
    drink: "Soja?",
    tag: "alkoholfritt",
    image: "pubs/amanda_död.jpg",
  },
  {
    name: "Monster Chicken",
    address: "Dragarbrunnsgatan 21, Uppsala",
    lat: 59.8618044,
    lng: 17.6356975,
    time: "21:00",
    drink: "Gochujang",
    tag: "mat",
    image: "pubs/sausage.png",
  },
  {
    name: "Filmstaden Luxe",
    address: "Dragarbrunnsgatan 22, Uppsala",
    lat: 59.861272,
    lng: 17.6375857,
    time: "21:30",
    drink: "Movie Beer",
    tag: "ol",
    image: "pubs/Filmstaden.JPG",
  },
  {
    name: "Snerkes",
    address: "S:t Larsgatan 4, 753 11 Uppsala",
    lat: 59.858976,
    lng: 17.630683,
    time: "22:00",
    drink: "Vem har KK-kort?",
    tag: "special",
    image: "pubs/IMG_0030.jpg",
  },
];

// =====================================================================
//  KART-INSTÄLLNINGAR (behöver normalt inte ändras)
// =====================================================================
export const MAP_CONFIG = {
  // Kartstil utan API-nyckel (OpenFreeMap, OpenMapTiles-schema).
  // Alternativ: "https://tiles.openfreemap.org/styles/liberty" (ljus/färg)
  style: "https://tiles.openfreemap.org/styles/dark",

  // 3D-byggnader. Källa/lager matchar OpenFreeMap-stilen ovan.
  buildings: {
    enabled: true,
    source: "openmaptiles",
    sourceLayer: "building",
    color: "#1f2937",
    opacity: 0.85,
  },

  // Gångrutt-API (OSRM "foot"-profil, drivs av FOSSGIS). Faller tillbaka
  // på raka linjer mellan stoppen om det inte går att nå.
  routing: {
    url: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
    cacheKey: "bryggan-route-v1",
  },

  // Kamera: hur det ser ut när man "går" respektive står vid ett stopp.
  camera: {
    travel: { zoom: 16.7, pitch: 60 },
    dwell: { zoom: 17.4, pitch: 62 },
    // Hur mycket kameran svänger runt när man står vid ett stopp (grader).
    dwellOrbitDeg: 22,
    // Hur långt ned på skärmen "du" är (0 = mitten, 0.3 = en bit ned).
    focusOffset: 0.3,
    // Hur långt kameran "tittar" bakåt/framåt när den bestämmer riktning (m).
    // Större värden = lugnare svängar (men kameran börjar svänga tidigare).
    lookBehindM: 20,
    lookAheadM: 50,
    // Utjämning av kamerabanan (m). Större = mjukare men genar mer i hörn.
    smoothingM: 20,
  },

  // Hur mycket scroll som krävs. Allt mäts i "enheter"; en enhet = vhPerUnit
  // procent av skärmhöjden. Varje stopp får dwellUnits, varje gångsträcka
  // får meter / metersPerUnit (begränsat till min/max).
  scroll: {
    dwellUnits: 1,
    metersPerUnit: 250,
    minLegUnits: 0.5,
    maxLegUnits: 3,
    vhPerUnit: 55,
  },

  colors: {
    route: "#f59e0b",
    routeDone: "#fbbf24",
    routeUpcoming: "rgba(148, 163, 184, 0.55)",
    routeSkipped: "rgba(100, 116, 139, 0.35)",
  },
};
