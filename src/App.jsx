import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from './config/supabase';

function App() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [radius, setRadius] = useState(1000);
  const [selectedDataset, setSelectedDataset] = useState('tilfluktsrom');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeLayer, setActiveLayer] = useState('osm');
  
  // Referanser til kartlag
  const osmLayerRef = useRef(null);
  const flyFotoLayerRef = useRef(null);

  useEffect(() => {
    const testConnection = async () => {
      try {
        // Test tilkobling ved å hente alle tabeller
        const { data, error } = await supabase
          .from('tilfluktsrom')
          .select('*')
          .limit(1);
  
        if (error) {
          console.error('Test failed:', error.message);
        } else {
          console.log('Test successful, data:', data);
        }
      } catch (error) {
        console.error('Connection error:', error);
      }
    };
  
    testConnection();
  }, []);
  
  useEffect(() => {
    if (!mapInstanceRef.current && mapRef.current) {
      // Kristiansand koordinater
      const defaultPosition = [58.1599, 8.0182];
      
      mapInstanceRef.current = L.map(mapRef.current).setView(defaultPosition, 13);
      
      // Opprett kartlagene
      osmLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      });
      
      flyFotoLayerRef.current = L.tileLayer('https://waapi.webatlas.no/maptiles/tiles/webatlas-orto-newup/wa_grid/{z}/{x}/{y}.jpeg?APITOKEN=800247D7-F729-42CA-827E-4AF0D8D7C1F9', {
        attribution: '© Webatlas'
      });
      
      // Legg til standard kartlag basert på activeLayer
      if (activeLayer === 'osm') {
        osmLayerRef.current.addTo(mapInstanceRef.current);
      } else {
        flyFotoLayerRef.current.addTo(mapInstanceRef.current);
      }

      mapInstanceRef.current.on('click', (e) => {
        const { lat, lng } = e.latlng;
        setSelectedPoint({ lat, lng });
      });
    }

    // Trigger en resize event etter kartet er lastet
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 100);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Håndter bytte av kartlag
  useEffect(() => {
    console.log('Aktivt lag endret til:', activeLayer);
    
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

  useEffect(() => {
    if (selectedPoint && mapInstanceRef.current) {
      // Fjern alle sirkel-lag
      mapInstanceRef.current.eachLayer((layer) => {
        if (layer instanceof L.Circle) {
          layer.remove();
        }
      });

      // Legg til ny sirkel
      L.circle([selectedPoint.lat, selectedPoint.lng], {
        radius: radius,
        color: 'blue',
        fillColor: '#30c',
        fillOpacity: 0.1
      }).addTo(mapInstanceRef.current);
    }
  }, [selectedPoint, radius]);


  // Variabel for å lagre brukerens posisjon-marker
  let userMarker = null;
  let userPosition = null;
  // Funksjon for å oppdatere brukerens posisjon
  function updateUserPosition(position) {
    const { latitude, longitude } = position.coords;

    // Hvis markør allerede finnes, oppdater posisjonen, ellers opprett ny
    if (userMarker) {
      userMarker.setLatLng([latitude, longitude]);
    } else {
      userMarker = L.circleMarker([latitude, longitude], {
        radius: 10,
        color: 'blue',
        fillColor: 'blue',
        fillOpacity: 0.6,
      }).addTo(mapInstanceRef.current).bindPopup("Du er her");
    }

    userPosition = L.latLng(latitude, longitude)
    let examplePoint = L.latLng(latitude-0.01, longitude)
    showDistanceBetweenTwoPoints(userPosition, examplePoint)
  }

  // Funksjon for å regne ut avstand mellom to punkter og tegne en linje mellom de
  function showDistanceBetweenTwoPoints(pointA, pointB) {
    L.polyline([pointA, pointB], {
      color: 'red',
      weight: 5,
    }).addTo(mapInstanceRef.current);

    let distance = pointA.distanceTo(pointB)
    console.log(distance)
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
            <option value="tilfluktsrom">Tilfluktsrom</option>
            <option value="brannstasjoner">Brannstasjoner</option>
          </select>

          <div style={{ flex: 1 }}>
            <label>Søkeradius: {radius} meter</label>
            <input
              type="range"
              min="100"
              max="5000"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
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