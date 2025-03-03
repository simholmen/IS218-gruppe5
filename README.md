# Oppgave 2: Geografiske IT-utvikling (IS-218 Gruppe 5)

## Problemstilling

> Hvordan kan vi visualisere og analysere geografisk beredskap ved hjelp av PostGIS og Leaflet for å finne nærmeste beredskapsressurser i sanntid?

## Beskrivelse

### Formål:

Applikasjonen er utviklet for å visualisere og analysere beredskapsressurser som brannstasjoner, sykehus og politistasjoner på et interaktivt kart. Ved å bruke sanntids geolokasjon kan brukeren se sin egen posisjon, finne nærmeste beredskapsressurs og analysere avstanden til denne.

### Hovedfunksjoner:

* Sanntids geolokasjon: Applikasjonen oppdaterer brukerens posisjon hvert 5. sekund og markerer denne på kartet.
* Kartbasert visualisering: Brukeren kan velge mellom OpenStreetMap eller flyfoto for å vise geografiske data.
* Dynamisk datainnhenting: Applikasjonen henter data fra en PostGIS-database via Supabase og viser relevante beredskapsressurser.
* Avstandsanalyse: Systemet finner nærmeste ressurs basert på brukerens posisjon og tegner en linje mellom disse.
* Søkeradius: Brukeren kan justere radius for å avgrense hvilke punkter som skal vurderes i analysen.
* Interaktivt grensesnitt: Brukeren kan velge mellom ulike datasetttyper, og kartet zoomer automatisk til relevante områder.

### Teknologier brukt:

* Frontend: Vite med react plugin + Leaflet for kartvisualisering
* Backend: Supabase (PostgreSQL med PostGIS for geodata)
* Kartdata: OpenStreetMap, Esri Flyfoto
* Geolokasjon: Browser-basert navigator.geolocation.watchPosition()

### Bruksområder:

* Beredskapsplanlegging: Finne nærmeste brannstasjon, sykehus eller politistasjon i en nødsituasjon.
* Beslutningsstøtte for nødetater: Optimalisering av responstid basert på geografisk fordeling.
* By- og transportplanlegging: Analyse av dekning for kritiske tjenester.

## Valg av teknologi

## Valg av datasett

## Implementasjon

## Datahenting fra Supabase

```javascript
const fetchDataDirectly = async (tableName) => {
  try {
    console.log(`Henter data fra ${tableName}...`);
    const { data, error } = await supabase.rpc('get_points', {
      table_name: tableName
    });

    if (error) {
      throw new Error(`Feil ved henting av data fra ${tableName}: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Konverter og valider hvert datapunkt
    const processedData = [];
    data.forEach((item) => {
      console.log("Legger til markør:", item);
      try {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);
        
        if (isNaN(lat) || isNaN(lng)) {
          return; 
        }
        
        const name = item.name || 'Ukjent';
        
        processedData.push({
          id: item.id,
          name: name,
          adresse: '',
          coordinates: [lat, lng]
        });
      } catch (itemError) {
        console.error('Feil ved prosessering av punkt:', itemError);
      }
    });
    console.log(`Data mottatt fra tabellen ${tableName}:`, data);

    return processedData;
  } catch (error) {
    setError(`Kunne ikke hente data fra ${tableName}: ${error.message}`);
    return [];
  }
};
```

Denne funksjonen kaller en tilpasset RPC-funksjon i Supabase kalt `get_points` for å hente geodata fra spesifiserte tabeller. Den utfører validering av hvert datapunkt, konverterer tekstverdier til numeriske koordinater, og returnerer en array av punkter. Feilhåndtering er bygget inn for å fange opp ulike problemer. 

## Database Tilkoblingstest (for debugging)

```js
useEffect(() => {
  const testConnection = async () => {
    try {
      const { data, error } = await supabase
        .from('NyBrannstasjoner')
        .select('*')
        .limit(1);

      if (error) {
        console.error('Database connection error:', error.message);
        setError('Kunne ikke koble til databasen: ' + error.message);
      }
    } catch (error) {
      console.error('Connection error:', error.message);
      setError('Tilkoblingsfeil: ' + error.message);
    }
  };

  testConnection();
}, []);
```

Ved oppstart av applikasjonen kjøres en diagnostisk test for å sjekke tilkoblingen til Supabase-databasen. Dette sikrer at problemer med databasetilkoblingen oppdages tidlig.

## Kartinitialisering

```js
useEffect(() => {
  if (!mapInstanceRef.current && mapRef.current) {
    // Kristiansand koordinater
    const defaultPosition = [58.1599, 8.0182];
    
    // Opprett kartet
    mapInstanceRef.current = L.map(mapRef.current, {
      center: defaultPosition,
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      fadeAnimation: true,
      zoomAnimation: true,
      minZoom: 5,
      maxZoom: 19,
      maxBounds: [
        [57.0, 4.0],
        [72.0, 32.0]
      ],
      maxBoundsViscosity: 1.0
    });
  }
}, []);
```
### Posisjonssporing

For posisjonssporing brukte vi denne funksjonen:
```js
  useEffect(() => {
    // Sette opp geolokasjon som oppdateres hvert 5. sekund
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(updateUserPosition, 
        error => console.error('Kunne ikke hente GPS-posisjon:', error), 
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    } else {
        console.error("Geolokasjon støttes ikke av denne nettleseren.");
    }
  }, []);
```
I funksjonen `updateUserPosition` lagres brukerens posisjon som en `latLng` i en React `useState` kalt `userPosition`.

### Beregne avstand mellom to punkter

Vi har definert følgende funksjoner:
```jsx
  // Funksjon for å regne ut avstand mellom to punkter
  function calculateDistanceBetweenTwoPoints(pointA, pointB) {
    let distance = pointA.distanceTo(pointB);
    return distance;
  }

  // Funksjon for å finne nærmeste valgte type marker
  function findClosestMarker(items) {
    let shortest = Infinity;
    let marker = null;
    items.forEach((item) => {
      let coordinate = item.coordinates;
      let distance = calculateDistanceBetweenTwoPoints(userPosition, coordinate);
      if (distance < shortest) {
        shortest = distance;
        marker = item;
      }
    });
    return marker;
  }
```


Kartet initialiseres med Kristiansand som standardposisjon og konfigureres med ulike parametre for å forbedre brukeropplevelsen. To kartlag defineres: OpenStreetMap for standardkart og ESRI World Imagery for flyfotovisning. Brukeren kan klikke på kartet for å sette et punkt for radiusanalyse. 

---

# Håndtering av Kartlagbytte

```javascript
useEffect(() => {
  if (mapInstanceRef.current && osmLayerRef.current && flyFotoLayerRef.current) {
    // Fjern begge lag først
    if (mapInstanceRef.current.hasLayer(osmLayerRef.current)) {
      mapInstanceRef.current.removeLayer(osmLayerRef.current);
    }
    
    if (mapInstanceRef.current.hasLayer(flyFotoLayerRef.current)) {
      mapInstanceRef.current.removeLayer(flyFotoLayerRef.current);
    }
    
    // Legg til det aktive laget
    if (activeLayer === 'osm') {
      osmLayerRef.current.addTo(mapInstanceRef.current);
    } else {
      flyFotoLayerRef.current.addTo(mapInstanceRef.current);
    }
  }
}, [activeLayer]);
```

Denne funksjonen reagerer på endringer i `activeLayer`-tilstanden. Den fjerner først begge kartlagene (OpenStreetMap og flyfoto) for å sikre en ren overgang, og legger deretter til det valgte laget. Dette gir brukeren mulighet til å veksle mellom standardkart og satellittbilder. 

# Datahåndtering ved Datasettbytte

```javascript
useEffect(() => {
  const fetchPostGISData = async () => {
    if (!mapInstanceRef.current) return;
    
    setLoading(true);
    setError(null);
    
    // Fjern alle eksisterende markører og linjer
    removeAllMarkers();
    removeAllPolylnes();
    
    try {
      const config = datasetConfig[selectedDataset];
      if (!config) {
        throw new Error(`Ugyldig datasett valgt: ${selectedDataset}`);
      }
      
      // Hent data fra riktig tabell via RPC
      const items = await fetchDataDirectly(config.table);
      
      if (!items || items.length === 0) {
        setPointCount(0);
        setLoading(false);
        return;
      }
      
      // Oppdater antall punkter som vises
      setPointCount(items.length);
      
      // Legg til markører på kartet
      const markers = [];
      
      items.forEach((item) => {
        try {
          const [lat, lng] = item.coordinates;
          
          if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            return;
          }
          
          // Opprett markør
          const marker = L.marker([lat, lng]);
          
          // Legg til popup
          const popupContent = `
            <div>
              <strong>${item.name}</strong>
              ${item.adresse ? `<br>Adresse: ${item.adresse}` : ''}
            </div>
          `;
          
          marker.bindPopup(popupContent);
          marker.addTo(mapInstanceRef.current);
          markers.push(marker);
        } catch (error) {
          console.error('Feil ved opprettelse av markør:', error);
        }
      });
      
      // Zoom til markørene
      if (markers.length > 0) {
        try {
          // Opprett en featureGroup for å finne bounds
          const tempGroup = L.featureGroup(markers);
          const bounds = tempGroup.getBounds();
          
          if (bounds && bounds.isValid()) {
            mapInstanceRef.current.fitBounds(bounds, {
              padding: [50, 50],
              maxZoom: 13,
              animate: true
            });
          }
        } catch (e) {
          console.error('Feil ved zoom til data:', e);
        }
      }

      let closestMarker = findClosestMarker(items);
      let line = drawLineBetweenTwoPoints(userPosition, closestMarker.coordinates);
      let distance = calculateDistanceBetweenTwoPoints(userPosition, closestMarker.coordinates);
      const distancePopup = `
        <div>
          <strong>${Math.round(distance)}m</strong>
        </div>
      `;
      line.bindPopup(distancePopup);

    } catch (error) {
      console.error('Feil ved prosessering av data:', error);
      setError(`Feil ved prosessering av data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  fetchPostGISData();
}, [selectedDataset, userPosition]);
```

Når brukeren bytter datasett eller deres posisjon endres, utføres datainnhenting og oppdatering av kartet. Prosessen inkluderer rydding av eksisterende markører, henting av nye data, validering av datapunkter, og plassering av markør. 

# Søkeradiushåndtering

```javascript
useEffect(() => {
  if (selectedPoint && mapInstanceRef.current) {
    // Fjern eksisterende sirkel
    if (circleLayerRef.current) {
      mapInstanceRef.current.removeLayer(circleLayerRef.current);
    }

    // Legg til ny sirkel
    circleLayerRef.current = L.circle([selectedPoint.lat, selectedPoint.lng], {
      radius: radius,
      color: 'blue',
      fillColor: '#30c',
      fillOpacity: 0.1
    }).addTo(mapInstanceRef.current);
    
    // Utfør analyse innenfor radius
    performRadiusAnalysis(selectedPoint, radius);
  }
}, [selectedPoint, radius]);
```

Når brukeren velger et punkt på kartet eller justerer søkeradiusen, tegnes en sirkel med den spesifiserte radiusen. Eksisterende sirkler fjernes først for å unngå overlapping. Visuell fremstilling bruker en blå kontur med transparent fyll for å tydelig vise det analyserte området.

## Fjerne Markører

```javascript
const removeAllMarkers = () => {
  if (mapInstanceRef.current) {
    mapInstanceRef.current.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });
  }
};
```

Denne funksjonen går gjennom alle lag på kartet og fjerner de som er markører. Dette brukes ved datasettbytte for å sikre at gamle markører ikke forblir på kartet og skaper forvirring.

## Fjerne Linjer

```javascript
const removeAllPolylnes = () => {
  if (mapInstanceRef.current) {
    mapInstanceRef.current.eachLayer(layer => {
      if (layer instanceof L.Polyline) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });
  }
};
```

Alle linjer fra kartet ved å identifisere lag av typen L.Polyline. Dette sikrer at gamle avstandslinjer ikke forblir synlige når nye data lastes.


