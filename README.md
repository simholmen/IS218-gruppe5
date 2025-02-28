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

* Frontend: React + Leaflet for kartvisualisering
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
Når det aktive datasettet endres, går vi gjennom alle datapunktene og regner ut avstanden til de fra brukerens posisjon, og lagrer dermed punktet med kortest avstand i en variabel. Vi kan da tegne opp en linje mellom disse to punktene med denne funksjonen:
```jsx
  function drawLineBetweenTwoPoints(pointA, pointB) {
    let line = L.polyline([pointA, pointB], {
      color: 'red',
      weight: 5,
    }).addTo(mapInstanceRef.current);
    return line;
  }
```
