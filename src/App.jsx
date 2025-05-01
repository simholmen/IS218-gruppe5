import React, { useEffect, useRef, useState } from 'react';
import L, { map } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw'
import { supabase } from './config/supabase';
import {runShortestPath, visualizeShortestPath } from "./aiShortestPath";

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
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const pointsRef = useRef({ startPoint: null, endPoint: null });
  
  // Referanser til kartlag
  const osmLayerRef = useRef(null);
  const flyFotoLayerRef = useRef(null);
  const circleLayerRef = useRef(null);
  
  // Kartlegg datasettnavn til tabellnavn og navnekolonner
  const datasetConfig = {
    'brannstasjoner': { 
      table: 'NyBrannstasjoner', 
      nameColumn: 'brannstasjon',
      type: 'points' 
    },
    'sykehus': { 
      table: 'sykehus', 
      nameColumn: 'navn',
      type: 'points' 
    },
    'politistasjoner': { 
      table: 'politistasjon', 
      nameColumn: 'name',
      type: 'points' 
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

      // Add draw control
    const drawControl = new L.Control.Draw({
      draw: {
        marker: true, // Enable marker placement
        polyline: true, // Enable line drawing
        polygon: false, // Disable polygon drawing
        rectangle: false, // Disable rectangle drawing
        circle: false, // Disable circle drawing
      },
      edit: {
        featureGroup: new L.FeatureGroup().addTo(mapInstanceRef.current), // Layer for editable features
      },
    });

    mapInstanceRef.current.addControl(drawControl);

    mapInstanceRef.current.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
    
      if (e.layerType === 'marker') {
        const { lat, lng } = layer.getLatLng();
    
        if (!pointsRef.current.startPoint) {
          pointsRef.current.startPoint = { lat, lng };
          setStartPoint({ lat, lng });
          console.log('Start point set:', { lat, lng });
          layer.bindPopup('Start Point').openPopup();
        } else if (!pointsRef.current.endPoint) {
          pointsRef.current.endPoint = { lat, lng };
          setEndPoint({ lat, lng });
          console.log('End point set:', { lat, lng });
          layer.bindPopup('End Point').openPopup();
        } else {
          console.warn('Both points are already set. Reset to select new points.');
        }
      }
    
      // Add the drawn layer to the map
      layer.addTo(mapInstanceRef.current);
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

  // Funksjon for å fjerne alle markører og linjer
const removeAllMarkersAndPolylines = () => {
  if (mapInstanceRef.current) {
    mapInstanceRef.current.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });
  }
};

  // Hent data fra Supabase
  const fetchDataDirectly = async (tableName, type) => {
    try {
      console.log(`Henter data fra ${tableName}...`);
      const { data, error } = await supabase.rpc('get_pointstest', {
        table_name: tableName
      });
  
      if (error) {
        throw new Error(`Feil ved henting av data fra ${tableName}: ${error.message}`);
      }
  
      if (!data || data.length === 0) {
        console.log(`Ingen data funnet i tabellen ${tableName}.`);
        return [];
      }
  
      console.log(`Data hentet fra ${tableName}:`, data); // Log the retrieved data
  
      if (type === 'lines') {
        // Process lines
        return data.map((item) => ({
          id: item.id,
          name: item.name || 'Ukjent',
          coordinates: item.coordinates.coordinates 
        }));
      } else {
        // Process points
        const processedData = data.map((item) => ({
          id: item.id,
          name: item.name || 'Ukjent',
          adresse: '',
          coordinates: item.coordinates 
        }));
  
        console.log("Processed data for brannstasjoner:", processedData);
        return processedData;
      }
    } catch (error) {
      setError(`Kunne ikke hente data fra ${tableName}: ${error.message}`);
      console.error(`Feil ved henting av data fra ${tableName}:`, error); // Log the error
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
      removeAllMarkersAndPolylines();
  
      try {
        const config = datasetConfig[selectedDataset];
        if (!config) {
          throw new Error(`Ugyldig datasett valgt: ${selectedDataset}`);
        }
  
        // Hent data fra riktig tabell via RPC
        const items = await fetchDataDirectly(config.table, config.type);
  
        if (!items || items.length === 0) {
          setPointCount(0);
          setLoading(false);
          return;
        }
  
        setPointCount(items.length);
  
        if (config.type === 'lines') {
          // Add lines to the map
          items.forEach((item) => {
            try {
              // Ensure coordinates are in [lat, lng] format
              const transformedCoordinates = item.coordinates.map(([lng, lat]) => [lat, lng]);
        
              const line = L.polyline(transformedCoordinates, {
                color: 'blue',
                weight: 1
              }).addTo(mapInstanceRef.current);
        
              line.bindPopup(`<strong>${item.name}</strong>`);
            } catch (error) {
              console.error('Feil ved opprettelse av linje:', error);
            }
          });
        } else {
          // Add points to the map
          items.forEach((item) => {
            try {
              const [lat, lng] = item.coordinates;
  
              if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                return;
              }
  
              const marker = L.marker([lat, lng]);
              const popupContent = `
                <div>
                  <strong>${item.name}</strong>
                  ${item.adresse ? `<br>Adresse: ${item.adresse}` : ''}
                </div>
              `;
  
              marker.bindPopup(popupContent);
              marker.addTo(mapInstanceRef.current);
            } catch (error) {
              console.error('Feil ved opprettelse av markør:', error);
            }
          });
        }
      } catch (error) {
        console.error('Feil ved prosessering av data:', error);
        setError(`Feil ved prosessering av data: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
  
    fetchPostGISData();
  }, [selectedDataset, userPosition]);

  // Visualize selected points
useEffect(() => {
  if (startPoint && mapInstanceRef.current) {
    L.marker([startPoint.lat, startPoint.lng], { color: 'green' })
      .addTo(mapInstanceRef.current)
      .bindPopup('Start Point');
  }

  if (endPoint && mapInstanceRef.current) {
    L.marker([endPoint.lat, endPoint.lng], { color: 'red' })
      .addTo(mapInstanceRef.current)
      .bindPopup('End Point');
  }
}, [startPoint, endPoint]);

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
    if (!pointA || !pointB) {
      console.error("Invalid points for distance calculation:", pointA, pointB);
      return Infinity; // Return a high value to avoid incorrect comparisons
    }
    try {
      let distance = pointA.distanceTo(pointB);
      return distance;
    }
    catch (e) {
      console.error('Feil ved lesing av posisjon:', e);
      return Infinity;
    }
  }

  function drawLineBetweenTwoPoints(pointA, pointB) {
    try {
      let line = L.polyline([pointA, pointB], {
        color: 'red',
        weight: 5,
      }).addTo(mapInstanceRef.current);
      return line;
    }
    catch (e) {
      console.error('Feil ved lesing av posisjon:', e);
    }
  }

  // Funksjon for å finne nærmeste valgte type marker
  function findClosestMarker(items) {
    if (!userPosition) {
      console.warn("User position is not set.");
      return null;
    }

    console.log("GA:")
    console.log(items)

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

          <button
  onClick={() => {
    pointsRef.current = { startPoint: null, endPoint: null };
    setStartPoint(null);
    setEndPoint(null);
    console.log('Points reset.');
    removeAllMarkersAndPolylines(); // Clear all markers and lines from the map
  }}
  >
  Nullstill punkter
  </button>

  <button
  onClick={() => {
    if (!startPoint || !endPoint) {
      console.warn('Both start and end points must be set.');
      return;
    }

    const start = `${startPoint.lng},${startPoint.lat} [EPSG:4326]`;
    const end = `${endPoint.lng},${endPoint.lat} [EPSG:4326]`;

    runShortestPath(
      supabase,
      start,
      end,
      (features) => visualizeShortestPath(features, mapInstanceRef),
      mapInstanceRef
    );
  }}
  >
  Finn kortest vei
  </button>

          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', backgroundColor: '#2a2a2a', color: 'white' }}
          >
            <option value="brannstasjoner">Brannstasjoner</option>
            <option value="sykehus">Sykehus</option>
            <option value="politistasjoner">Politistasjoner</option>
          </select>

          
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