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
      mapInstanceRef.current = L.map(mapRef.current).setView([58.1599, 8.0182], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);

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

  useEffect(() => {
    if (selectedPoint && mapInstanceRef.current) {
      mapInstanceRef.current.eachLayer((layer) => {
        if (layer instanceof L.Circle) {
          layer.remove();
        }
      });

      L.circle([selectedPoint.lat, selectedPoint.lng], {
        radius: radius,
        color: 'blue',
        fillColor: '#30c',
        fillOpacity: 0.1
      }).addTo(mapInstanceRef.current);
    }
  }, [selectedPoint, radius]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#1a1a1a',
        color: 'white'
      }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Beredskapsanalyse</h1>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px' }}
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