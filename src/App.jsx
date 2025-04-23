import React, { useEffect, useRef, useState } from 'react';
import L, { map } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from './config/supabase';


function App() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [radius, setRadius] = useState(1000);
  const [selectedDataset, setSelectedDataset] = useState('brannstasjoner');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeLayer, setActiveLayer] = useState('osm');
  const [loading, setLoading] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [error, setError] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [useRoadDistance, setUseRoadDistance] = useState(false);
  
  // Referanser til kartlag
  const osmLayerRef = useRef(null);
  const flyFotoLayerRef = useRef(null);
  const circleLayerRef = useRef(null);
  
  // Kartlegg datasettnavn til tabellnavn og navnekolonner
  const datasetConfig = {
    'brannstasjoner': { 
      table: 'NyBrannstasjoner', 
      nameColumn: 'brannstasjon'
    },
    'sykehus': { 
      table: 'sykehus', 
      nameColumn: 'navn'
    },
    'politistasjoner': { 
      table: 'politistasjon', 
      nameColumn: 'name'
    }
  };

  // Test databasetilkobling ved oppstart
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
  
  
  // Initialiser kartet
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
      
      // Definer kartlag
      osmLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        crossOrigin: true
      });
      
      flyFotoLayerRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, and the GIS User Community',
        maxZoom: 18,
        crossOrigin: true
      });
      
      // Legg til standard kartlag
      if (activeLayer === 'osm') {
        osmLayerRef.current.addTo(mapInstanceRef.current);
      } else {
        flyFotoLayerRef.current.addTo(mapInstanceRef.current);
      }

      // Legg til klikkhåndtering
      mapInstanceRef.current.on('click', (e) => {
        const { lat, lng } = e.latlng;
        setSelectedPoint({ lat, lng });
      });
    }

    // Gjør kartet responsive
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Håndter bytte av kartlag
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

  // Funksjon for å fjerne alle markører
  const removeAllMarkers = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.eachLayer(layer => {
        if (layer instanceof L.Marker) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });
    }
  };  

  // Funksjon for å fjerne alle linjer
  const removeAllPolylnes = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });
    }
  };

  // Hent data fra Supabase
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

  // Håndter endring av datasett
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

        if (!userPosition) {
          console.warn("User position is not available.");
          return;
        }
          const { closestMarker, shortestDistance } = findClosestMarker(items, useRoadDistance);        
          if (!closestMarker || !closestMarker.coordinates || closestMarker.coordinates.length !== 2) {
          console.error("Invalid closest marker or coordinates:", closestMarker);
          return;
        }

        let line = drawLineBetweenTwoPoints(userPosition, closestMarker.coordinates);
        if (!line) {
          console.error("Failed to draw line.");
          return;
        }


        const distancePopup = `
          <div>
            <strong>${Math.round(shortestDistance)}m</strong>
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

  // Håndter søkeradius
  /*
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
  */
  
  // Funksjon for å utføre analyse innenfor radius
  const performRadiusAnalysis = async (point, radius) => {
    // Implementer geografisk spørring her senere
  };


  // Variabel for å lagre brukerens posisjon-marker
  let userMarker = null;
  // Funksjon for å oppdatere brukerens posisjon
  function updateUserPosition(position) {
    if (!position || !position.coords) {
      console.error("Invalid position data received:", position);
      return;
    }
    
    const { latitude, longitude } = position.coords;
    // console.log("User position updated:", latitude, longitude); // Debugging log
    if (isNaN(latitude) || isNaN(longitude)) {
      console.error("Invalid GPS coordinates received:", latitude, longitude);
      return;
    }

    const newPosition = L.latLng(latitude, longitude);

    // Hvis markør allerede finnes, oppdater posisjonen, ellers opprett ny
    if (userMarker) {
      userMarker.setLatLng(newPosition);
    } else {
      userMarker = L.circleMarker(newPosition, {
        radius: 10,
        color: 'blue',
        fillColor: 'blue',
        fillOpacity: 0.6,
      }).addTo(mapInstanceRef.current).bindPopup("Du er her");
    }

    setUserPosition(newPosition); // Oppdater state
  }

  // Funksjon for å regne ut avstand mellom to punkter og tegne en linje mellom de
  function calculateDistanceBetweenTwoPoints(pointA, pointB) {
    if (!pointA || !pointB || !pointB[0] || !pointB[1]) {
      console.error("Invalid points for distance calculation:", pointA, pointB);
      return Infinity; // Return a high value to avoid incorrect comparisons
    }
    try {
      let distance = pointA.distanceTo(L.latLng(pointB[0], pointB[1]));
      return distance;
    } catch (e) {
      console.error('Feil ved lesing av posisjon:', e);
      return Infinity;
    }
  }

  function drawLineBetweenTwoPoints(pointA, pointB) {
    if (!pointA || !pointB || !pointB[0] || !pointB[1]) {
      console.error("Invalid points for drawing line:", pointA, pointB);
      return null;
    }

    try {
      let line = L.polyline([pointA, L.latLng(pointB[0], pointB[1])], {
        color: 'red',
        weight: 5,
      }).addTo(mapInstanceRef.current);
      return line;
    } catch (e) {
      console.error('Feil ved lesing av posisjon:', e);
      return null;
    }
  }


  // Add this function to calculate road distances using OpenRouteService
  async function findClosestByRoad(userCoords, items) {
    let shortestDistance = Infinity;
    let closestMarker = null;

    const apikey = process.env.REACT_APP_OPENROUTESERVICE_API_KEY; 
    if (!apiKey) {
      console.error("API key is missing. Please check your .env file.");
      return { closestMarker: null, shortestDistance: Infinity };
    }

    for (const item of items) {
      if (!item.coordinates || item.coordinates.length !== 2) {
        console.error("Invalid coordinates for item:", item);
        continue;
      }
      
      const destCoords = [item.coordinates[1], item.coordinates[0]]; // Ensure [lng, lat]

      try {
        const response = await fetch('https://cors-anywhere.herokuapp.com/https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
          method: 'POST',
          headers: {
            'Authorization': apikey, 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            coordinates: [
              [userCoords.lng, userCoords.lat], // [lng, lat]
              [destCoords[1], destCoords[0]],  // [lng, lat]
            ],
          }),
        });

        if (!response.ok) {
          console.error(`API error: ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        console.log("API response:", data); // Debugging log

        const distance = data.features[0].properties.summary.distance; // meters
        console.log(`Road distance to ${item.name}: ${distance} meters`); // Debugging log


        if (distance < shortestDistance) {
          shortestDistance = distance;
          closestMarker = item;
        }
      } catch (error) {
        console.error('Error fetching road distance:', error);
      }
    }

    return { closestMarker, shortestDistance };
  }



  // Funksjon for å finne nærmeste valgte type marker
  function findClosestMarker(items,  useRoadDistance = false) {
    if (!userPosition) {
      console.warn("User position is not set.");
      return null;
    }
    if (useRoadDistance) {
      console.log("Calculating road distance..."); // Debugging log
      return findClosestByRoad(userPosition, items);
    } else {
    console.log("Calculating air distance..."); // Debugging log
    console.log("GA:")
    console.log(items)
    let shortest = Infinity;
    let marker = null;

    items.forEach((item) => {
      if (!item.coordinates || item.coordinates.length !== 2) {
        console.error("Invalid coordinates for item:", item);
        return;
      }

      let distance = calculateDistanceBetweenTwoPoints(userPosition, item.coordinates);
      if (distance < shortest) {
        shortest = distance;
        marker = item;
      }
    });

    if (!marker) {
      console.error("No valid marker found.");
    }
    return { closestMarker: marker, shortestDistance: shortest };
    }
  }

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


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#1a1a1a',
        color: 'white'
      }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Beredskapsanalyse</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Kartlag-velger */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => setActiveLayer('osm')}
              style={{ 
                padding: '0.5rem 1rem', 
                backgroundColor: activeLayer === 'osm' ? '#3b82f6' : '#2a2a2a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeLayer === 'osm' ? 'bold' : 'normal'
              }}
            >
              OpenStreetMap
            </button>
            <button 
              onClick={() => setActiveLayer('flyfoto')}
              style={{ 
                padding: '0.5rem 1rem', 
                backgroundColor: activeLayer === 'flyfoto' ? '#3b82f6' : '#2a2a2a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeLayer === 'flyfoto' ? 'bold' : 'normal'
              }}
            >
              Flyfoto
            </button>
          </div>

          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', backgroundColor: '#2a2a2a', color: 'white' }}
          >
            <option value="brannstasjoner">Brannstasjoner</option>
            <option value="sykehus">Sykehus</option>
            <option value="politistasjoner">Politistasjoner</option>
          </select>


             {/* Checkbox for toggling distance type */}
          <div>
            <label style={{ color: 'white' }}>
              <input
                type="checkbox"
                checked={useRoadDistance}
                onChange={(e) => setUseRoadDistance(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
              />
              Bruk veidistanse
            </label>
          </div>


          
          {/* <div style={{ flex: 1 }}>
            <label>Søkeradius: {radius} meter</label>
            <input
              type="range"
              min="100"
              max="5000"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div> */}
          
          {loading ? (
            <div>Laster data...</div>
          ) : (
            <div>Viser {pointCount} punkter</div>
          )}
        </div>
        
        {error && (
          <div style={{ 
            marginTop: '0.5rem', 
            padding: '0.5rem', 
            backgroundColor: '#ff5555', 
            color: 'white',
            borderRadius: '4px'
          }}>
            {error}
          </div>
        )}
      </div>

      <div 
        ref={mapRef} 
        style={{
          flex: 1,
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
}

export default App;