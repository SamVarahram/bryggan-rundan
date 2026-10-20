# Pubar på rad

Liten sajt för pubrundan: lista med stopp, drinkförslag och en scroll-styrd
3D-karta som "går" rundan längs gatorna. Byggd med Vite + MapLibre GL,
deployas till GitHub Pages vid push till `main`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # produktionsbygge till dist/
```

## Ändra stoppen

Allt styrs från **`src/stops.js`**. Listan, kartan, gångrutten, korten på
kartan och "Du är här"-logiken genereras från listan `stops`, så det räcker
att ändra där.

Varje stopp ser ut så här:

```js
{
  name: "O:conners",
  address: "Stora Torget 1, Uppsala",   // visas + används av "Öppna i Maps"
  lat: 59.8582449,                      // högerklicka i Google Maps → kopiera koordinater
  lng: 17.6386146,
  time: "19:30",                        // HH:MM – måste vara stigande genom listan
  drink: "Guinness",
  tag: "ol",                            // vin | ol | special | alkoholfritt | mat
  image: "pubs/oconners.jpg",           // valfri, ligger i public/pubs/
},
```

- **Lägga till / ta bort / byta ordning:** redigera listan. Ordningen i listan
  är ordningen ni går, och nummer, rutt och kamera uppdateras automatiskt.
- **Tider:** `time` avgör vilket stopp som är "nu". Går man in på sajten
  kl 20:15 startar kartan vid det stopp som pågår då (knappen
  *Visa hela rundan* visar ändå allt). Före första tiden startar den från
  början.
- **Bilder:** lägg filen i `public/pubs/` och ange sökvägen relativt
  `public/`. Utelämna `image` om det inte finns någon bild.
- **Datum i rubriken:** `EVENT_DATE` högst upp i samma fil.

Testa tidslogiken utan att vänta på kvällen genom att lägga till
`?time=20:15` i adressfältet.

## Rutten mellan stoppen

Gångvägen mellan stoppen hämtas automatiskt från OpenStreetMaps ruttmotor
(OSRM, fotgängare) och följer riktiga gator. Den räknas om så fort någon
koordinat ändras, så normalt behöver man inte göra något.

Vill man styra vägen mellan två stopp (t.ex. tvinga rutten över en viss bro
eller genom en park) lägger man till `via` på stoppet man är **på väg till**:

```js
{
  name: "Snerkes",
  // ...
  via: [
    { lat: 59.8597, lng: 17.6335 },   // passera här på vägen från föregående stopp
    { lat: 59.8592, lng: 17.6318 },   // och sedan här
  ],
},
```

`via`-punkterna formar bara linjen och kameran; de får inga markörer eller
kort. Om ruttservern inte går att nå ritas raka linjer mellan stoppen
(och via-punkterna) i stället.

Rutten cachas i webbläsarens `localStorage`, nyckeln innehåller alla
koordinater så cachen blir ogiltig av sig själv när något ändras.

## Kartans utseende

Längst ned i `src/stops.js` finns `MAP_CONFIG` med kommenterade inställningar
för kartstil, 3D-byggnader, kameravinklar (zoom/pitch när man går respektive
står stilla), hur mjukt kameran svänger och hur mycket scroll rundan tar.
Standardstilen (OpenFreeMap) kräver ingen API-nyckel.

## Kodöversikt

| Fil | Gör |
|-----|-----|
| `src/stops.js` | **Det enda som normalt behöver ändras.** Stopp + kartinställningar. |
| `src/main.js` | Renderar sidan (hero, lista, Plan B) och startar kartan. |
| `src/walk-map.js` | Själva kartan: MapLibre, markörer, rutt, kort, scroll → kamera. |
| `src/route.js` | Hämtar gångrutten och bygger den utjämnade kamerabanan. |
| `src/camera.js` | Översätter scroll-position till kameraläge och kort-synlighet. |
| `src/geo.js` | Små geometri-hjälpare (avstånd, bäring, vinklar). |
