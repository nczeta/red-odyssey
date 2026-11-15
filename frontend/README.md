# RED ODYSSEY — Martian Terrain Explorer

Atlante planetario educativo per un progetto indipendente destinato alla NASA International Space Apps Challenge 2026, challenge Martian Map. HTML5, JavaScript ES Modules, Vite e OpenLayers, senza framework UI. IBM Plex Sans Condensed e Inter sono inclusi localmente. L'unico CSS sorgente è `src/style.css`.

## Le tre pagine

- `index.html`: landing fotografica, link all’app e footer.
- `app.html`: explorer OpenLayers a viewport intero, senza navbar o footer pubblici; pannelli inizialmente chiusi.
- `project.html`: overview, workflow, catalogo degli otto layer, analisi del terreno, routing, tecnologie, fonti e team.
- `app.html`: accesso diretto all’explorer, anche dalla pagina Project.

`vite.config.js` dichiara i tre ingressi HTML tramite `build.rolldownOptions.input`. `cssCodeSplit: false` produce un unico CSS condiviso anche in produzione. Tutte le pagine collegano direttamente lo stesso stylesheet. La pagina Project condivide la configurazione dei layer e del CRS, senza inizializzare una mappa.

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

- Mappa OpenLayers in MARS con Mars Imagery COG, pan, zoom, reset sulla copertura, selezione metrica e marker.
- Sidebar indipendenti su desktop, con quattro configurazioni persistenti. Chiudere un pannello libera lo spazio; `ResizeObserver` e `map.updateSize()` seguono il cambiamento del viewport.
- Map Focus nella pagina: espande lo stesso contenitore mappa con `position: fixed`, senza ricreare l'istanza OpenLayers; nasconde e rende non interattivi navbar, hero, footer e pannelli. Il documento sottostante è bloccato; pulsante di uscita ed ESC ripristinano scroll, pannelli e focus. Tab/Shift+Tab restano nei controlli visibili. Non utilizza la Fullscreen API nativa.
- Sotto 1100px, drawer esclusivi. Le preferenze desktop restano separate; scegliere un endpoint richiude il drawer per poter usare la mappa.
- Route Planner per posizionare, sostituire e cancellare A/B nel CRS della mappa. Nessun percorso viene calcolato senza backend.
- Registry con adapter GeoJSON, XYZ e COG, visibilità, ordine, opacità raster, attribution, caricamento ed errori. I controlli dei dataset non configurati sono disabilitati.
- Dialog informazioni, etichette accessibili, focus visibile, pannelli chiusi `inert`, controlli touch, reduced-motion.

La mappa è focalizzabile: frecce per spostarsi, `+`/`-` per zoomare, Invio per selezionare il centro o collocare l'endpoint attivo. Si può anche cliccare o toccare direttamente la mappa.

## MAP LEGEND — sidebar destra

La sidebar destra è dedicata a **MAP LEGEND** e mantiene dimensioni, tipografia, controlli di apertura/chiusura e comportamento responsive esistenti. Il contenuto è derivato da `LayerManager.entries` e dalla visibilità effettiva dei layer: nessun toggle o stato di selezione separato. Le sezioni compaiono/scompaiono con le mappe e si impilano quando sono attivi più layer tematici. Imagery non richiede una legenda: senza layer tematici visibili si mostra uno stato vuoto minimo.

`src/components/legend.js` rende un unico modello riutilizzabile con gruppi, note, campioni SVG e label. I campioni delle isoipse sono rettangoli con lo stesso RGBA dello stroke sullo stesso sfondo nero; larghezza delle linee e opacità sono indicate nel testo. I campioni poligonali riproducono fill, alpha e contorni continui/tratteggiati dei vettori. Dati e stringhe delle categorie sono escapati. Le notifiche dei tile non ricostruiscono il DOM se la legenda non cambia; lo scorrimento resta stabile durante la navigazione, mentre il cambio dei layer attivi riparte dall'inizio.

Origine delle definizioni:

- **Contour Lines:** `legendDefinition` generata in `src/layers/contours.js` dagli stessi oggetti `Style`, dalle palette invertite e dai limiti calcolati su ELEV. Cinque classi di 560 m, limiti `[-3400, -2840, -2280, -1720, -1160, -600]`, unità metri; l'ultima classe include il massimo. Equidistanza delle isoipse 200 m, stroke da 1 px e alpha 0.65 applicato una sola volta.
- **Geological Map:** `legendDefinition` generata in `src/layers/geology.js` dalle cache degli stili. Mostra 17 categorie Goudge da `Unit_Name` e 14 categorie USGS da `symbol`, con nomi originali da `name` quando presenti. Fill al 14% e contorni come nella mappa. Sono colori vettoriali provvisori: non rappresentano priorità scientifica né una ricostruzione dei colori ufficiali. La sidebar specifica che manca la chiave colore→unità del raster QGIS sottostante.
- **Elevation e Slope:** sezioni informative definite accanto alle configurazioni raster in `src/config/app.js`. I file sono RGB+alpha uint8, PhotometricInterpretation RGB, senza ColorMap né metadati di banda; il solo metadato GDAL globale è `OVERVIEW_RESAMPLING=AVERAGE`. La tavola di corrispondenza colore→valore non è disponibile. Non si ricostruiscono gradienti numerici, classi o soglie. Elevation non documenta valori numerici, unità verticali o datum; Slope non documenta gradi/percentuali o soglie. Per stabilire intervalli continui/discreti e palette quantitative servono i raster scientifici originali e/o gli stili o le legende QGIS.

La precedente ispezione delle coordinate e degli attributi geologici è conservata nella finestra **Location details**, accessibile dal pulsante con mirino dopo una selezione e aperta automaticamente sul clic di un'unità geologica. I risultati e le metriche del percorso sono nel Route Planner a sinistra. La sidebar destra contiene solo legende. Map Focus, selezione dei punti, interruttori e opacità mantengono il comportamento esistente. Nessuna modifica a GeoTIFF o GeoJSON.

Verifiche di questa modifica: 41 test Node, con confronto dei simboli/range rispetto agli stili OpenLayers reali, visibilità multipla, rimozione delle sezioni, cache DOM ed escaping. Browser sulla build di produzione a 1440, 768 e 390 px: sezioni Elevation/Slope simultanee, cinque classi Contour Lines corrette, 31 categorie geologiche, scorrimento senza overflow orizzontale e conservato durante pan/zoom, stato vuoto e cambio mappa sincronizzati. Verificati anche ispezione geologica nella nuova finestra e Route Planner; nessun errore JavaScript, warning del browser o richiesta fallita. Build multipagina riuscita; rimane l'avviso preesistente sul chunk oltre 500 kB. File: nuovo `src/components/legend.js`; aggiornati `app.html`, `src/main.js`, `src/style.css`, `src/components/layout.js`, `src/config/app.js`, `src/layers/contours.js`, `src/layers/geology.js`, `tests/site.test.js`, `tests/contours.test.js`, `tests/geology.test.js` e questo README.

## Mars Imagery 01

La mappa usa il COG originale `public/maps/rasters/01_Mars_Imagery_20m_COG.tif`, senza modificarlo. Il CRS `MARS:JEZERO` (Jezero_Crater_Projection) è registrato con Proj4js e OpenLayers in `src/map/marsProjection.js`; il precedente codice `MARS` resta un alias equivalente, con trasformazione identità e coordinate invariate:

```text
+proj=eqc +lat_ts=18.4663 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs +type=crs
```

Metadati verificati direttamente nel file:

- Extent: `[4329000, 1041020, 4421160, 1143420]`; centro: `[4375080, 1092220]`. L'extent del DEM è diverso e non viene utilizzato.
- Dimensioni: 4608 × 5120 pixel; pixel: 20 × 20 m; origine: `[4329000, 1143420]`, asse raster Y verso sud.
- Quattro bande uint8: RGB più alpha non premoltiplicato; nessun valore NoData. Normalizzazione fissa 0–255, senza stretch radiometrico. L'alpha della quarta banda conserva i bordi trasparenti.
- Tile: 512 × 512, compressione DEFLATE; overview a 40, 80, 160 e 320 m/pixel.
- Raggio sferico: 3396190 m; parallelo standard: 18.4663°; centro proiezione e false origini: 0.

`src/layers/cog.js` crea `ol/source/GeoTIFF` e `ol/layer/WebGLTile`. La proiezione viene fornita esplicitamente perché il GeoTIFF dichiara un CRS personalizzato (GeoKey 32767), senza sostituirlo con CRS terrestri. L'adapter verifica l'extent dei metadati prima di aggiungere il layer alla stessa mappa esistente. Il manager distingue caricamento metadati, caricamento tile ed errori; gli stessi controlli regolano visibilità e opacità.

La vista iniziale e Reset view inquadrano l'intera copertura nel viewport corrente. Il centro resta entro l'extent; la risoluzione varia tra 1280 e 5 m/pixel. Sotto 20 m/pixel si ingrandiscono i pixel esistenti: non aumenta il dettaglio scientifico.

Il server deve supportare HTTP Range (`206 Partial Content`); Vite dev e preview lo supportano. Per hosting su altro dominio servono anche CORS e accesso agli header di range. Il file viene copiato in `dist/maps/rasters/` dalla build e il suo URL rispetta `BASE_URL`. Nessun backend è necessario per le immagini.

## Elevation 02 e Slope 05

Sono collegati anche `public/maps/rasters/02_Elevation_20m_COG.tif` e `public/maps/rasters/05_Slope_20m_COG.tif`, tramite lo stesso adapter COG, registry e istanza OpenLayers della mappa 01. La sidebar mantiene interruttori indipendenti: si possono sovrapporre i raster e regolarne l'opacità. Per vedere solo una mappa, attivarla e disattivare le altre. Imagery resta visibile all'avvio; Elevation e Slope sono inizialmente nascosti. L'ordine resta Imagery, Elevation, Slope; il layer superiore visibile copre quelli inferiori secondo la propria opacità e alpha.

Il pannello mostra sei toggle: Mars Imagery, Elevation, Slope, Contour Lines, Geological Map e Scientific Sites. Scientific Sites resta predisposto e disabilitato fino al collegamento di un dataset di punti. Hillshade e Terrain Difficulty sono rimossi dal registry; Routes resta un layer interno per i risultati del planner, senza toggle e senza essere incluso nel contatore del pannello. Lo slider di opacità è chiuso all'avvio e si apre con il pulsante a cerchio mezzo pieno, per un raster attivo. Si apre un solo slider alla volta; disattivare il layer o premere ESC lo richiude, conservando il valore. Il pulsante “i” apre una finestra con descrizione e note di legenda del livello, anche per quelli ancora da integrare, senza modificarne la visibilità. Descrizioni e legende non occupano spazio sotto gli slider.

Metadati ispezionati separatamente per ciascun file:

| Proprietà | Elevation 02 | Slope 05 |
| --- | --- | --- |
| Extent | `[4329000, 1041020, 4421160, 1143420]` | `[4329000, 1041020, 4421160, 1143420]` |
| Dimensioni e pixel | 4608 × 5120, 20 m | 4608 × 5120, 20 m |
| Proiezione | Jezero_Crater_Projection, sfera di raggio 3396190 m | Identica definizione, verificata nei GeoKey |
| Bande | RGB uint8 + alpha non premoltiplicato | RGB uint8 + alpha non premoltiplicato |
| NoData | Nessun valore NoData; bordi trasparenti tramite alpha | Nessun valore NoData; bordi trasparenti tramite alpha |
| Tile / overview | 512 × 512; 40, 80, 160, 320 m/pixel | 512 × 512; 40, 80, 160, 320 m/pixel |
| Metadati GDAL | Solo `OVERVIEW_RESAMPLING=AVERAGE`; nessun metadato di banda | Solo `OVERVIEW_RESAMPLING=AVERAGE`; nessun metadato di banda |

L'extent è uguale a quello di Imagery, ma diverso dall'extent DEM di riferimento: non è stato dedotto dal DEM. Ogni voce dichiara la propria copertura e l'adapter la confronta con i metadati. Posizione, scala e griglia dei tre raster coincidono; cambiare visibilità o opacità non chiama `fit`, non sostituisce la vista e non ricrea mappa o sorgenti.

Entrambi sono esportazioni QGIS già colorate: si preservano le quattro bande con normalizzazione fissa 0–255, senza stretch, interpolazioni di palette, classificazioni o soglie aggiunte. I colori vengono visualizzati direttamente e l'alpha originale resta operativo.

**Limiti scientifici:** questi file non contengono una banda di quote o pendenze numeriche, né una tabella per ricavare valori dai colori. Le unità verticali e il datum altimetrico non sono documentati; per Slope non è documentato se i valori originali fossero in gradi o percentuale. I metri dichiarati nel CRS sono unità orizzontali e non provano le unità verticali. Mancano anche progetto QGIS, file di stile e intervalli della legenda originale. Non si inventano una legenda quantitativa o valori di analisi. Per misure servono i raster scientifici originali e i relativi metadati. La sidebar esplicita questi limiti.

## Contour Lines 03

Il toggle `Contour Lines` gestisce un `LayerGroup` con due figli, in quest'ordine: `public/maps/rasters/03_Contour_Background_20m_COG.tif` come sfondo nero, `public/maps/vectors/03_Contour_Lines.geojson` come isoipse sopra lo sfondo. Si riutilizzano l'adapter COG e l'istanza OpenLayers esistenti. Visibilità e z-index del gruppo si applicano a entrambi i figli. Il caricamento del GeoJSON termina prima che il gruppo venga aggiunto: errori di caricamento non pubblicano una composizione parziale. Attivazioni successive riusano gruppo, sorgenti e geometrie già caricati.

Il TIFF è RGBA uint8, con nero opaco al centro e bordi trasparenti originali. Ha pixel di 20 m, extent `[4329000, 1041020, 4421160, 1143420]` e GeoKey che confermano Jezero_Crater_Projection, raggio 3396190 m, parallelo standard 18.4663°, centro e false origini zero. Il GeoJSON non dichiara un CRS: le coordinate sono metriche e hanno extent circa `[4329000, 1042100, 4418100, 1143400]`, contenuto nel TIFF e compatibile con il DEM Jezero. Viene interpretato esplicitamente in `MARS:JEZERO`, senza trasformazioni, preservando tutte le coordinate originali. Questa è un'inferenza verificata dalla compatibilità spaziale, non una dichiarazione CRS contenuta nel GeoJSON. Un controllo a runtime rifiuta geometrie esterne alla copertura con tolleranza di 1 cm per gli arrotondamenti.

Sono presenti **4322 LineString**, con 371964 vertici e nessun valore ELEV invalido. Minimo: **−3400 m**; massimo: **−600 m**. I 15 valori distinti sono separati da 200 m. Le classi cromatiche usano equal interval sull'intero intervallo osservato: `(−600 − (−3400)) / 5 = 560 m` per classe, indipendentemente dall'equidistanza verticale delle isoipse.

| Classe | Intervallo ELEV (m) | Colore | Feature |
| --- | --- | --- | --- |
| 1 | [−3400, −2840) | `#6E6862` | 150 |
| 2 | [−2840, −2280) | `#8B847D` | 1596 |
| 3 | [−2280, −1720) | `#A9A39C` | 1674 |
| 4 | [−1720, −1160) | `#C5C0BA` | 718 |
| 5 | [−1160, −600] | `#D9D6D1` | 184 |

Gli intervalli includono il limite inferiore; solo l'ultimo include anche quello superiore. I limiti sono calcolati dai dati durante il caricamento. La funzione di stile riutilizza cinque `Style` con `Stroke` da **1 px** e alpha **0.65** nel colore. Opacità del vettore e del gruppo: 1. Il gruppo non espone un secondo slider di opacità, per mantenere l'alpha richiesto. Valori ELEV numerici o stringhe numeriche sono accettati; mancanti, vuoti e non finiti non vengono disegnati. Se tutte le quote coincidono si usa il primo stile; se nessuna è valida rimane lo sfondo senza curve. La legenda effettiva è accessibile dal pulsante “i”. Nessuna modifica ai file GIS originali.

Gli interruttori restano indipendenti, come per gli altri raster: attivando 03 si mostrano insieme sfondo e curve sopra le altre mappe; disattivandolo si rivelano le mappe ancora attive. Per passare interamente a un'altra mappa, disattivare 03 e attivare quella desiderata. Centro e zoom restano invariati.

File dell'integrazione 03: nuovo `src/layers/contours.js`, aggiornati `src/layers/manager.js`, `src/config/app.js`, `src/main.js`, `src/style.css`, `app.html`, questo README; nuovo `tests/contours.test.js`. La suite comprende 34 test, inclusi metadati reali, uguaglianza delle geometrie originali, classi, valori limite/invalidi/costanti, caricamento HTTP delle due risorse e visibilità effettiva del gruppo.

Verifica browser sulla build di produzione: TIFF 03 caricato via HTTP 206, GeoJSON via HTTP 200 con una sola richiesta anche dopo più attivazioni. Curve visibili sopra il nero e rimosse alla disattivazione (83089 pixel di vettore nel controllo desktop contro i soli 167 pixel del marker senza isoipse). Centro e scala identici prima/dopo la selezione; verificati pan, zoom, reset, legenda, ritorno a Imagery e attivazione di Elevation/Slope. Rendering ispezionato a 1440 e 390 px, senza errori JavaScript, warning del browser o richieste fallite. La build conserva il precedente avviso sul chunk oltre 500 kB. Touch e pinch su dispositivo fisico restano una verifica manuale.

## Geological Map 04

Il toggle `Geological Map`, senza prefissi numerici, controlla un unico `LayerGroup` nello stesso oggetto Map. Il gruppo riutilizza la composizione di Contour Lines tramite `src/layers/rasterGroup.js`, mantenendo l'ordine raster → Goudge → USGS:

| Dataset | Contenuto verificato | Attributi principali |
| --- | --- | --- |
| `public/maps/rasters/04_Geology_20m_COG.tif` | 4608 × 5120, pixel 20 m, RGB uint8 + alpha non premoltiplicato, overview 40/80/160/320 m | Colori originali preservati, nessun NoData dichiarato |
| `public/maps/vectors/04_Goudge_Geology.geojson` | 113 MultiPolygon, 64816 vertici, 17 unità distinte | `fid`, `TARGET_FID`, `Unit_Name` |
| `public/maps/vectors/04_USGS_Geology.geojson` | 1021 MultiPolygon, 1059651 vertici, 14 simboli distinti | `fid`, `OBJECTID`, `unit`, `name`, `symbol_noSub`, `subscript`, `symbol`, `ORIG_FID`, `SHAPE_Length`, `SHAPE_Area`, `Color_ID` |

**Non sono presenti Point, MultiPoint o record POI.** Non si generano centroidi da presentare come siti scientifici. Sono invece selezionabili le unità geologiche: il clic apre Analysis e rende visibili fonte, nome/codice dell'unità e gli altri attributi scalari disponibili. Valori nulli e geometria non vengono mostrati; gli attributi non vengono rinominati né inventati e le stringhe sono trattate come testo. Disattivare Geological Map nasconde tutti i figli e rimuove i dettagli dell'unità selezionata. Il valore numerico di `SHAPE_Area`/`SHAPE_Length` resta quello del file, senza attribuirgli unità non documentate.

**CRS e coperture:** il GeoTIFF conferma Jezero_Crater_Projection (eqc, raggio 3396190 m, parallelo standard 18.4663°, centro e false origini zero), con extent `[4329000, 1041020, 4421160, 1143420]`. Entrambi i GeoJSON omettono la dichiarazione CRS. Le coordinate metriche sono compatibili con `MARS:JEZERO` e vengono lette con proiezioni sorgente e vista esplicite, senza trasformazione. Extent Goudge: `[4328978.253932305, 1058000.0001220717, 4406291.218729166, 1143420]`; USGS: `[4329000.815389324, 1049161.5916794778, 4374122.782702505, 1108437.4109384015]`. Goudge si estende circa 21.75 m a ovest del TIFF: nessuna correzione o traslazione viene applicata; l'extent di rendering del gruppo include questa porzione. La registrazione del CRS esistente resta unica. La corrispondenza dei CRS vettoriali è un'inferenza dalla compatibilità spaziale, non una dichiarazione formale nei file.

**Simbologia:** nessun QML/SLD/progetto QGIS o lookup cromatico è presente nel repository. I colori del TIFF restano originali. I vettori usano una rappresentazione provvisoria, esplicitata nella finestra “i”: colori categoriali riutilizzati per `Unit_Name` (Goudge) e `symbol` (USGS), fill al 14%, contorni Goudge tratteggiati sabbia da 1.25 px e contorni USGS continui grigio-azzurri da 1 px. Non vengono applicati gli stili o le classi ELEV delle isoipse. `Color_ID` viene conservato come attributo, senza inventare una relazione con colori ufficiali. I colori non esprimono priorità o valore scientifico. Gli stili sono memorizzati per categoria, non ricreati a ogni feature/frame.

**Caricamento:** i due GeoJSON pesano circa 56 MB complessivi; vengono richiesti in parallelo solo alla prima attivazione. Il gruppo viene pubblicato dopo aver preparato entrambe le sorgenti e verificato i metadati del TIFF. Se viene disattivato durante il caricamento, il risultato rimane nascosto; le attivazioni successive riusano il gruppo e non richiedono nuovamente i GeoJSON. Attivare Geological Map nasconde le altre mappe; attivare un'altra mappa nasconde insieme tutti e tre i figli del gruppo geologico. Le altre sovrapposizioni già esistenti e i risultati del planner mantengono il proprio comportamento. Il cambio non modifica centro, risoluzione o configurazione geografica. Non vengono ricostruite geometrie o stili durante l'animazione/interazione.

**Verifiche:** 39 test Node, inclusi metadati reali, attributi/geometrie originali, simbologia per categoria, caricamento differito, attivazioni ripetute, cambio mappa coordinato e disattivazione durante il caricamento. Browser sulla build di produzione a 1440 e 390 px: tre file caricati (GeoJSON HTTP 200, TIFF HTTP 206), una richiesta per GeoJSON; una sola viewport OpenLayers, centro e scala invariati, entrambe le sorgenti vettoriali visibili e selezionabili, tutte le geometrie nascoste con il gruppo, pan/zoom/reset e regressioni di Imagery/Elevation/Slope/Contour Lines. Selezioni reali controllate: USGS `fid=881`, “Jezero floor unit”; Goudge `fid=77`, “Dusty massive basement”. Nessun errore JavaScript, warning del browser o richiesta fallita nel percorso verificato. La build mantiene l'avviso sul chunk oltre 500 kB; il primo caricamento vettoriale può richiedere tempo e memoria, e non è un benchmark su tutti i dispositivi.

File per l'integrazione: nuovi `src/layers/geology.js`, `src/layers/rasterGroup.js` e `tests/geology.test.js`; aggiornati `src/layers/contours.js`, `src/layers/manager.js`, `src/config/app.js`, `src/components/panels.js`, `src/main.js`, `app.html`, `tests/site.test.js` e questo README. Nessuna nuova dipendenza, modifica ai dati originali, commit, push o merge. Restano da fornire eventuali POI puntuali, stili geologici ufficiali/lookup e dichiarazioni formali del CRS dei vettori.

Quote campionate da DEM, pendenze numeriche, difficoltà, profili e percorsi non vengono simulati.

### Verifica locale

```powershell
cd frontend
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1
```

Aprire l'URL stampato da Vite (normalmente `http://127.0.0.1:5173/app.html`). Controllare Jezero, trascinare, usare rotella e pulsanti +/−, quindi Reset view. Aprire Map Layers e provare Mars Imagery, Elevation e Slope, mantenendo attivo solo il raster desiderato oppure sovrapponendoli. Provare le tre opacità. Il cambio layer deve conservare posizione e zoom. Aprire Analysis, selezionare un punto e verificare coordinate metriche in MARS:JEZERO. Provare pannelli, Map Focus/ESC e Route Planner: A/B sono georeferenziati, il calcolo resta disabilitato senza backend.

Verifica dei tre raster: 30 test Node superati (inclusi metadati reali di ogni file, equivalenza MARS/MARS:JEZERO e caricamento COG su HTTP Range), build multipagina e browser Chrome headless sia sul server Vite dev sia sulla preview di produzione. Rendering controllato a 1440, 768 e 390 px; pan con drag e tastiera, zoom in/out, reset, visibilità, opacità, pannelli, Map Focus/ESC, dialog e selezione A/B. Verificati cambio Imagery → Elevation → Slope → Imagery con centro e scala invariati, sovrapposizione indipendente e resa distinta dei tre raster. Nessun errore JavaScript; nella verifica di produzione tutti i COG hanno risposto HTTP 206 senza richieste fallite. La build mantiene l'avviso per un chunk applicativo oltre 500 kB, senza impedirne la produzione. I test browser sono una verifica di sviluppo; `npm test` esegue la suite Node. Touch e pinch su hardware fisico restano una verifica manuale; il layout mobile è stato controllato in emulazione browser.

File aggiornati per Elevation e Slope: `src/config/app.js` (configurazioni RGBA condivise), `src/map/marsProjection.js` (MARS:JEZERO e alias MARS), `src/layers/cog.js` (messaggio di validazione comune), `src/main.js` (stati dei raster attivi), `app.html` (note sui tre layer), `tests/imagery.test.js` e questo README. Riutilizzati senza nuove istanze o adapter i moduli mappa, manager e pannelli esistenti. Nessuna nuova dipendenza e nessuna modifica ai dati GIS originali; nessun commit, push o merge.

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
  map/createMap.js         OpenLayers, inquadratura, selezione, resize
  map/marsProjection.js    CRS marziano e copertura verificata
  layers/manager.js        Registry e gestione dei layer
  layers/cog.js            Adapter GeoTIFF/WebGLTile
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
  type: 'geojson',         // 'geojson', 'xyz' oppure 'cog'
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

## Configurare nuovi layer marziani

`appConfig.spatial` usa `MARS:JEZERO` e la copertura del COG 01; `MARS` resta un alias compatibile. `registerProjections()` richiama `registerMarsProjection()` prima di creare la mappa. Non configurare layer marziani con EPSG:4326 o EPSG:3857 per aggirare errori.

Prima di aggiungere un dataset, verificarne CRS, unità, extent, bande e risoluzioni. Configurare solo la sua voce di `layerConfig`: gli altri dataset restano scollegati. Per un COG usare `type: 'cog'`, `sourceUrl`, `crs`, `extent`, parametri di banda in `raster` e uno `style` coerente con le bande. La ricetta RGBA di Mars Imagery non va riutilizzata automaticamente per un DEM.

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

## Verifiche storiche del redesign

Questa sezione descrive lo stato precedente all'integrazione Mars Imagery; per lo stato attuale vedere la sezione dedicata sopra.

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
