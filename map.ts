import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapComponent = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapInstanceRef.current && mapRef.current) {
      // Kristiansand koordinater
      const defaultPosition = [58.1599, 8.0182];
      
      // Initialiser kartet
      mapInstanceRef.current = L.map(mapRef.current).setView(defaultPosition, 13);

      // Legg til kartlag (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);

      // Legg til en eksempel markør
      L.marker(defaultPosition)
        .bindPopup('Kristiansand sentrum')
        .addTo(mapInstanceRef.current);
    }

    // Cleanup når komponenten unmountes
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="p-4 bg-white shadow-lg">
        <h1 className="text-2xl font-bold">Beredskapsanalyse</h1>
      </div>
      <div 
        ref={mapRef} 
        className="w-full flex-grow"
      />
    </div>
  );
};

export default MapComponent;