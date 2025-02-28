# Oppgave 2: Geografiske IT-utvikling (IS-218 Gruppe 5)

## Problemstilling

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
