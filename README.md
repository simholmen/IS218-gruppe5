# Oppgave 2: Geografiske IT-utvikling (IS-218 Gruppe 5)

## Problemstilling

## Valg av teknologi

## Valg av datasett

## Implementasjon

### Posisjonssporing

For posisjonssporing brukte vi denne funksjonen:
```jsx
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
