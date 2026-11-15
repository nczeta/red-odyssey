# RED ODYSSEY — Martian Terrain Explorer

Atlante planetario educativo per un progetto indipendente destinato alla NASA International Space Apps Challenge 2026, challenge Martian Map. HTML5, JavaScript ES Modules, Vite e OpenLayers, senza framework UI. IBM Plex Sans Condensed e Inter sono inclusi localmente. L'unico CSS sorgente è `src/style.css`.

## Le tre pagine

- `index.html`: landing fotografica, link all’app e footer.
- `app.html`: explorer OpenLayers a viewport intero, senza navbar o footer pubblici; pannelli inizialmente chiusi.
- `project.html`: overview, workflow, catalogo degli otto layer, analisi del terreno, routing, tecnologie, fonti e team.
- `app.html`: accesso diretto all’explorer, anche dalla pagina Project.

`vite.config.js` dichiara i tre ingressi HTML tramite `build.rolldownOptions.input`. `cssCodeSplit: false` produce un unico CSS condiviso anche in produzione. Tutte le pagine collegano direttamente lo stesso stylesheet. La pagina Project non importa i moduli OpenLayers.

Navbar, footer e icone statiche sono scritti direttamente in `index.html` e `project.html`. La struttura della dashboard, dei pannelli e del dialog informativo è in `app.html`; JavaScript gestisce interazioni e risultati dinamici. Gli URL di navigazione sono veri link HTML: possono essere aperti in nuove schede e funzionano senza un router JavaScript.

## Aggiornare contatti, team e documentazione

Contatti e link del footer si modificano direttamente in `index.html` e `project.html`; mantenere allineate le due copie. Team, portali di riferimento e descrizioni editoriali dei layer si modificano in `project.html`. Pubblicare solo informazioni confermate: i contatti non disponibili restano testo, senza link fittizi.

Fonte, risoluzione e unità restano in `layerConfig` in `src/config/app.js`. `src/project.js` aggiorna solo questi metadati e lo stato delle sorgenti, oltre alla navigazione interattiva dell'indice. Una sorgente configurata resta indicata come da verificare.

Il logo ufficiale originale è `public/images/red-odyssey-logo.svg` (copia inalterata di `red-odyssey-logo.svg`, viewBox 180 × 180, sfondo trasparente). La variante con isolinee nere è usata nell’header di Project, su sfondo chiaro, e nella favicon SVG. La Home, il launcher dell’app e la finestra informativa dell’explorer, su sfondi scuri, usano `public/images/red-odyssey-logo-white-isolines.svg`, copia inalterata della variante con isolinee bianche. Entrambi gli SVG mantengono la linea rossa e lo sfondo trasparente; solo le dimensioni CSS cambiano. `public/favicon.png`, `public/favicon.ico` e `public/apple-touch-icon.png` sono versioni trasparenti rasterizzate dallo stesso SVG per compatibilità. Nessun logo viene generato con JavaScript.

## Avvio

Questa cartella è già la radice del frontend: non serve creare un'altra directory `frontend/`.

Prerequisito: una versione di Node compatibile con Vite 8 (`^20.19.0 || >=22.12.0`). Ambiente di sviluppo verificato: Node 26.13.0.

```powershell
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1
```

Aprire l'indirizzo stampato da Vite, normalmente `http://127.0.0.1:5173/`. Su Windows si usa `npm.cmd` quando l'ExecutionPolicy blocca `npm.ps1`, senza modificare le policy del computer. Su altri sistemi è sufficiente `npm`.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1
```

`dist/` contiene la build statica. Non è stato eseguito alcun deployment. Il font non richiede Google Fonts o altri servizi esterni.

Inter e IBM Plex sono distribuiti con le rispettive licenze in `public/licenses/`, copiate nella build. I font sono distribuiti localmente. La hero usa una fotografia NASA locale (PIA21042), separata dai dati GIS: vedere `public/images/CREDITS.md`.

## Cosa è operativo

- Mappa OpenLayers con pan, zoom, reset, selezione locale e marker.
- Sidebar indipendenti su desktop, con quattro configurazioni persistenti. Chiudere un pannello libera lo spazio; `ResizeObserver` e `map.updateSize()` seguono il cambiamento del viewport.
- Map Focus nella pagina: espande lo stesso contenitore mappa con `position: fixed`, senza ricreare l'istanza OpenLayers; nasconde e rende non interattivi navbar, hero, footer e pannelli. Il documento sottostante è bloccato; pulsante di uscita ed ESC ripristinano scroll, pannelli e focus. Tab/Shift+Tab restano nei controlli visibili. Non utilizza la Fullscreen API nativa.
- Sotto 1100px, drawer esclusivi. Le preferenze desktop restano separate; scegliere un endpoint richiude il drawer per poter usare la mappa.
- Route Planner per posizionare, sostituire e cancellare A/B. Nessun percorso viene disegnato tra punti locali.
- Registry con adapter GeoJSON e XYZ, visibilità, ordine, opacità raster, attribution, caricamento ed errori. I controlli dei dataset non configurati sono disabilitati.
- Dialog informazioni, etichette accessibili, focus visibile, pannelli chiusi `inert`, controlli touch, reduced-motion.

La mappa è focalizzabile: frecce per spostarsi, `+`/`-` per zoomare, Invio per selezionare il centro o collocare l'endpoint attivo. Si può anche cliccare o toccare direttamente la mappa.

## Il placeholder non rappresenta Marte

`LOCAL:WORKSPACE` è un sistema astratto, non globale. Le unità `pixels` indicano unità di disegno, non pixel dello schermo, metri o gradi. Griglia, origine e coordinate servono a verificare l'interazione cartografica. Non esistono latitudine, longitudine, scala metrica, terreno, distanze, pendenze o difficoltà reali in questa configurazione.

Elevazione, slope e difficoltà restano senza dati. L'adapter XYZ visualizza raster già renderizzati: non campiona DEM né interpreta i colori come quote. Il profilo altimetrico non viene simulato. GeoTIFF/COG, campionamento raster e algoritmi di pathfinding non sono implementati.

## Organizzazione

```text
index.html                 Homepage con fotografia NASA e link all’app
app.html                   Explorer a viewport intero
project.html               Documentazione del progetto
vite.config.js             Build multipagina con un solo CSS
public/                    Asset statici e futuri dataset
src/
  main.js                  Coordinamento stato, strumenti ed eventi
  project.js               Catalogo, team e indice della pagina Project
  style.css                Tema completo e stili OpenLayers utilizzati
  config/app.js            Contatti, team, regione, CRS, registry e backend
  config/project.js        Descrizioni e limiti dei layer
  map/createMap.js         OpenLayers, griglia locale, selezione, resize
  layers/manager.js        Adapter e gestione dei layer
  components/              Shell, icone, layout e pannelli
  services/api.js          Adapter delle richieste di percorso
tests/core.test.js         Fixture GIS, stato e test API
tests/site.test.js         Test DOM di pagine, navigazione e Map Focus
```

## Integrare i dati QGIS

1. Verificare CRS planetario, ellissoide/raggi, orientamento degli assi, unità, bounds, risoluzioni e convenzioni dei tile nei propri export QGIS.
2. Configurare lo spazio cartografico e registrare la proiezione come descritto sotto.
3. Collocare gli export in `public/data/`, ad esempio `public/data/sites.geojson` e `public/data/imagery/{z}/{x}/{y}.png`, oppure usare un servizio con CORS abilitato. Nell'URL non includere `public`: `/data/sites.geojson`.
4. Compilare la relativa voce di `layerConfig` in `src/config/app.js`.

Ogni voce può dichiarare:

```js
{
  id: 'sites',
  name: 'Scientific Sites',
  type: 'geojson',         // 'geojson' oppure 'xyz'; 'cog' non è supportato
  icon: 'pin',
  sourceUrl: '/data/sites.geojson',
  crs: 'MARS:QGIS',        // Nome interno della proiezione VERIFICATA e registrata
  extent: null,           // Bounds nel CRS sorgente; obbligatori per XYZ senza tileGrid
  visible: true,
  opacity: 1,
  legend: null,           // Descrizione testuale della legenda, se verificata
  units: null,
  dataSource: null,       // Nome/provenienza verificata
  resolution: null,
  order: 6,
}
```

`MARS:QGIS` è solo un identificatore esemplificativo, non una definizione di proiezione fornita dal progetto. Non configurare layer marziani con EPSG:4326 o EPSG:3857 per aggirare gli errori.

Per XYZ impostare `type: 'xyz'`, `sourceUrl`, `crs`, `extent` e `maxZoom` coerenti con l'export. Il manager costruisce una griglia XYZ dall'estensione esplicita, senza usare il default Web Mercator. Per tiling diverso dallo standard fornire `tileGrid: { extent, origin, resolutions, tileSize }`, utilizzando i parametri reali del proprio export. Non rinominare tile TMS come XYZ senza verificarne l'asse Y. `attribution` può contenere l'attribuzione della fonte; OpenLayers la mantiene visibile.

GeoJSON viene letto con `dataProjection` e `featureProjection` esplicite. Eventuali dichiarazioni legacy `crs` interne al file non sovrascrivono la configurazione verificata. Sono supportati punti, linee e poligoni. Gli attributi scalari delle feature del layer `sites` appaiono in Scientific Information, trattati come testo.

Il CRS del layer e quello della vista devono coincidere oppure avere una trasformazione registrata. Il clipping tramite `extent` del layer viene applicato solo se l'estensione è già nel CRS della vista; la griglia raster rimane sempre nel CRS sorgente.

Il manager espone `register`, `load`, `loadConfigured`, `setVisible`, `setOpacity`, `setOrder`, `setGeoJSON` e `clear`. `setOrder` controlla lo z-index dei layer dati; la selezione tecnica resta sopra i dati. Per aggiungere voci visibili nell'interfaccia, estendere `layerConfig` prima dell'avvio.

## Configurare il CRS marziano

In `appConfig.spatial`, impostare `local: false`, `code`, `units`, `extent`, `center` e i limiti di zoom in base ai dati verificati. Non esiste una scelta planetaria predefinita.

Nel metodo `registerProjections()` registrare la definizione verificata prima della creazione della mappa. Se tutti i dati hanno lo stesso CRS proiettato, OpenLayers può lavorare direttamente nelle relative coordinate:

```js
// Import da aggiungere a src/config/app.js:
import Projection from 'ol/proj/Projection.js';
import { addProjection } from 'ol/proj.js';

// Corpo del metodo registerProjections(), dopo aver configurato spatial:
addProjection(new Projection({
  code: this.spatial.code,
  units: this.spatial.units,
  extent: this.spatial.extent,
  global: false,
}));
```

Questo registra coordinate e metadati; **non definisce una trasformazione matematica tra CRS diversi**. Per riproiezioni aggiungere separatamente definizioni planetarie verificate, per esempio tramite proj4 e la registrazione OpenLayers, o `addCoordinateTransforms`. Proj4 non è attualmente una dipendenza. La configurazione dei raggi planetari e delle trasformazioni compete alla verifica GIS dei dataset; nessun valore terrestre viene sostituito automaticamente.

## Collegare FastAPI

`src/services/api.js` contiene il punto di integrazione. `appConfig.api` dichiara `routeUrl`, `responseCrs` e `timeoutMs`. Nessuna chiamata viene effettuata se il servizio non è configurato. Il pulsante richiede anche `spatial.local: false` e i due endpoint.

Il contratto proposto dall'adapter frontend, da concordare con il futuro backend, è:

```text
POST <routeUrl>
Content-Type: application/json

{ "start": [x, y], "end": [x, y], "crs": "<CRS della vista>" }

Risposta:
{ "route": <GeoJSON FeatureCollection con LineString/MultiLineString>,
  "metrics": <oggetto opzionale> }
```

`responseCrs` è esplicito e non viene dedotto dal GeoJSON. Le metriche sono opzionali; vengono mostrate solo le voci con `{ value: numeroFinito, units: stringaNonVuota }`. Nessuna metrica viene calcolata sul client. Se il backend adotta un contratto diverso, modificare il solo adapter e la mappatura dei dati effettivamente disponibili.

Il percorso restituito entra nel layer `routes`. Modificare o cancellare gli endpoint annulla la richiesta pendente e rimuove il percorso generato precedente. HTTP error, timeout, GeoJSON incompatibile e CRS sconosciuto producono uno stato di errore leggibile. Nessun FastAPI, A* o Dijkstra è incluso. Configurare CORS sul servizio; nessun segreto deve essere inserito nel frontend.

## Verifiche e limiti

Verifiche eseguite per il redesign:

- `npm.cmd test`: 23 test superati (stati dei pannelli, Map Focus, drawer, storage negato/corrotto, CRS, GeoJSON, XYZ, registry e API).
- `npm.cmd run build`: tre HTML (`index`, `app`, `project`), un CSS condiviso, font locali e fotografia locale.
- Browser: landing a 1440, 768 e 390 pixel; documentazione a 1440 e 390 pixel; explorer desktop e mobile. Nessuno scorrimento orizzontale nelle pagine controllate.
- Browser: selezione e marker, pan da tastiera, zoom, pannelli indipendenti desktop, drawer mobile, endpoint A/B e stato senza backend, Map Focus e ritorno con ESC, navigazione tra le tre pagine, apertura delle note scientifiche.
- Resize canvas osservato: 1440 pixel con pannelli chiusi, 856 pixel con entrambi aperti. Il rendering OpenLayers è stato controllato anche nella build di produzione.
- Nessun errore o warning nei log del browser durante i flussi verificati.

I test dei layer usano fixture tecniche e oggetti OpenLayers reali; non verificano dataset o servizi scientifici esterni. Nessun dataset marziano, backend FastAPI o algoritmo di routing è collegato. Elevazioni, pendenze e percorsi non vengono simulati. Repository e contatti del team restano da fornire. Nessun deployment pubblico eseguito.

## Redesign novembre 2026

La landing e Project usano una palette carta, terracotta e grafite; l’app conserva un tema scuro da strumento cartografico. La homepage è HTML statico e non carica JavaScript applicativo o OpenLayers. Nessuna nuova dipendenza. La build produce tre HTML e un solo CSS. Le preferenze dei pannelli sono salvate nella chiave v2, con entrambi chiusi al primo accesso. Il resize resta gestito dal ResizeObserver esistente.

Fotografia: Farewell to Murray Buttes (Image 2), NASA/JPL-Caltech/MSSS, Mastcam, 8 settembre 2016, sol 1454. Fonte e trattamento in `public/images/CREDITS.md`. Repository del progetto e contatti del team restano non configurati perché non forniti.
