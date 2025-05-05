import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from './config/supabase';

// Add this CSS to your component for animations and transitions
const styles = {
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' }
  }
};

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
  const [nearestLocation, setNearestLocation] = useState(null);
  
  // Referanser til kartlag
  const osmLayerRef = useRef(null);
  const flyFotoLayerRef = useRef(null);
  const circleLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  
  // Kartlegg datasettnavn til tabellnavn og navnekolonner
  const datasetConfig = {
    'brannstasjoner': { 
      table: 'NyBrannstasjoner', 
      nameColumn: 'brannstasjon',
      color: '#EF4444',
      icon: '🚒',
      title: 'Brannstasjoner'
    },
    'sykehus': { 
      table: 'sykehus', 
      nameColumn: 'navn',
      color: '#10B981',
      icon: '🏥',
      title: 'Sykehus'
    },
    'politistasjoner': { 
      table: 'politistasjon', 
      nameColumn: 'name',
      color: '#3B82F6',
      icon: '👮',
      title: 'Politistasjoner'
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

  // Funksjon for å fjerne alle markører (unntatt brukerposisjon)
  const removeAllMarkers = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== userMarkerRef.current) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });
    }
  };  

  // Funksjon for å fjerne alle linjer
  const removeAllPolylines = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.eachLayer(layer => {
        if (layer instanceof L.Polyline && !(layer instanceof L.CircleMarker)) {
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
      setNearestLocation(null);
      
      // Fjern alle eksisterende markører og linjer
      removeAllMarkers();
      removeAllPolylines();
      
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
        
        // Opprett egendefinert ikon med datasetfarge
        const createCustomIcon = (color) => {
          return L.divIcon({
            html: `
              <div style="
                background-color: ${color};
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 4px rgba(0,0,0,0.3);
              "></div>
            `,
            className: '',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });
        };
        
        const icon = createCustomIcon(config.color);
        
        items.forEach((item) => {
          try {
            const [lat, lng] = item.coordinates;
            
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
              return;
            }
            
            // Opprett markør
            const marker = L.marker([lat, lng], { icon });
            
            // Legg til popup
            const popupContent = `
              <div style="font-family: sans-serif; padding: 4px;">
                <strong>${item.name}</strong>
                ${item.adresse ? `<br><span style="color: #666; font-size: 0.9em;">Adresse: ${item.adresse}</span>` : ''}
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

        // Finn nærmeste markør og tegn linje hvis brukerposisjon er tilgjengelig
        if (userPosition) {
          const closestMarker = findClosestMarker(items);
          if (closestMarker) {
            drawRouteToNearestLocation(closestMarker, config.color);
          }
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

  // Tegn linje til nærmeste lokasjon
  const drawRouteToNearestLocation = (marker, color) => {
    if (!marker || !userPosition || !mapInstanceRef.current) return;

    try {
      // Fjern eksisterende linje
      if (routeLineRef.current) {
        mapInstanceRef.current.removeLayer(routeLineRef.current);
      }

      const markerLatLng = L.latLng(marker.coordinates[0], marker.coordinates[1]);
      const distance = calculateDistanceBetweenTwoPoints(userPosition, markerLatLng);
      
      // Formaterer avstand i km hvis mer enn 1000m
      const formattedDistance = distance >= 1000 
        ? `${(distance / 1000).toFixed(1)} km`
        : `${Math.round(distance)} m`;
        
      // Lagre informasjon om nærmeste lokasjon
      setNearestLocation({
        name: marker.name,
        distance: formattedDistance,
        type: datasetConfig[selectedDataset]?.title || 'lokasjon'
      });
      
      // Tegn linjen på kartet
      routeLineRef.current = L.polyline([userPosition, markerLatLng], {
        color: color || '#3388ff',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        lineJoin: 'round'
      }).addTo(mapInstanceRef.current);
      
      // Legg til avstandspopup på linjen
      routeLineRef.current.bindPopup(`
        <div style="text-align: center; font-family: sans-serif; padding: 4px;">
          <strong>Avstand: ${formattedDistance}</strong>
        </div>
      `);
    } catch (e) {
      console.error('Feil ved tegning av rute:', e);
    }
  };

  // Funksjon for å regne ut avstand mellom to punkter
  function calculateDistanceBetweenTwoPoints(pointA, pointB) {
    if (!pointA || !pointB) {
      console.error("Invalid points for distance calculation:", pointA, pointB);
      return Infinity;
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

  // Funksjon for å finne nærmeste markør
  function findClosestMarker(items) {
    if (!userPosition || !items || items.length === 0) {
      return null;
    }

    let shortest = Infinity;
    let marker = null;
    
    items.forEach((item) => {
      try {
        let latlng = L.latLng(item.coordinates[0], item.coordinates[1]);
        let distance = calculateDistanceBetweenTwoPoints(userPosition, latlng);
        
        if (distance < shortest) {
          shortest = distance;
          marker = { ...item, distance };
        }
      } catch (e) {
        console.error('Feil ved beregning av avstand:', e);
      }
    });
    
    return marker;
  }

  // Funksjon for å oppdatere brukerens posisjon
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
  setUserPosition(newPosition);
  
  // Oppdater brukerens posisjon på kartet
  if (mapInstanceRef.current) {
    // Fjern eksisterende markører
    if (userMarkerRef.current && userMarkerRef.current.pulseMarker) {
      mapInstanceRef.current.removeLayer(userMarkerRef.current.pulseMarker);
    }
    
    // Oppdater eller opprett hovedmarkør
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(newPosition);
    } else {
      // Opprett hovedmarkør
      userMarkerRef.current = L.circleMarker(newPosition, {
        radius: 8,
        color: '#1E40AF',
        fillColor: '#3B82F6',
        fillOpacity: 0.8,
        weight: 2
      }).addTo(mapInstanceRef.current);
      
      userMarkerRef.current.bindPopup("<div style='text-align: center;'>Din posisjon</div>");
    }
    
    // Opprett pulserende markør
    const pulseMarker = L.circleMarker(newPosition, {
      radius: 30,
      color: '#3B82F6',
      fillColor: '#60A5FA',
      fillOpacity: 0.5,
      weight: 2,
      opacity: 0.8
    }).addTo(mapInstanceRef.current);
    
    // Lagre referanse til pulsmarkøren
    userMarkerRef.current.pulseMarker = pulseMarker;
    
    // Start pulsering med enkel størrelseendring
    let growing = false;
    let size = 20;
    
    if (userMarkerRef.current.pulseInterval) {
      clearInterval(userMarkerRef.current.pulseInterval);
    }
    
    userMarkerRef.current.pulseInterval = setInterval(() => {
      if (growing) {
        size += 1;
        if (size >= 30) growing = false;
      } else {
        size -= 1;
        if (size <= 12) growing = true;
      }
      
      pulseMarker.setRadius(size);
      pulseMarker.setStyle({
        fillOpacity: 0.3 - (size - 12) / 60,
        opacity: 0.5 - (size - 12) / 40
      });
    }, 100);
  }
}

useEffect(() => {
  // Sette opp geolokasjon som oppdateres hvert 5. sekund
  if ("geolocation" in navigator) {
    const watchId = navigator.geolocation.watchPosition(updateUserPosition,
      error => console.error('Kunne ikke hente GPS-posisjon:', error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
      
    // Cleanup funksjon
    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (userMarkerRef.current && userMarkerRef.current.pulseInterval) {
        clearInterval(userMarkerRef.current.pulseInterval);
        if (userMarkerRef.current.pulseMarker && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(userMarkerRef.current.pulseMarker);
        }
      }
    };
  } else {
    console.error("Geolokasjon støttes ikke av denne nettleseren.");
  }
}, []);

  // Bestem farge for avstandsindikator
  const getDistanceStatusColor = () => {
    if (!nearestLocation) return '#6B7280'; // Grå som standard
    
    const distance = nearestLocation.distance;
    if (distance.includes('km')) {
      const km = parseFloat(distance);
      if (km >= 10) return '#EF4444'; // Rød for over 10km
      if (km >= 5) return '#F97316';  // Oransje for 5-10km
      if (km >= 2) return '#FBBF24';  // Gul for 2-5km
      return '#10B981';              // Grønn for under 2km
    } else {
      const m = parseInt(distance);
      if (m >= 2000) return '#EF4444'; // Rød for over 2000m
      if (m >= 1000) return '#F97316'; // Oransje for 1000-2000m
      if (m >= 500) return '#FBBF24';  // Gul for 500-1000m
      return '#10B981';               // Grønn for under 500m
    }
  };

  // Modern Header Component
  const ModernHeader = () => (
    <div style={{
      width: '100%',
      background: 'linear-gradient(to right, #1e293b, #334155)',
      color: 'white',
      padding: '0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    }}>
      {/* Title Bar */}
      <div style={{
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '1.5rem', height: '1.5rem', marginRight: '0.75rem' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1.5rem', 
            fontWeight: '600',
            letterSpacing: '0.025em'
          }}>
            Beredskapsanalyse
          </h1>
        </div>
        
        {/* Status indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          fontSize: '0.875rem',
          backgroundColor: loading ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
          padding: '0.375rem 0.75rem',
          borderRadius: '9999px',
          transition: 'background-color 0.2s ease'
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ 
                width: '1rem', 
                height: '1rem', 
                borderRadius: '50%', 
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTopColor: '#ffffff',
                marginRight: '0.5rem',
                animation: 'spin 1s linear infinite'
              }}></div>
              Laster data...
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }}>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>
                Viser <strong>{pointCount}</strong> {datasetConfig[selectedDataset]?.title.toLowerCase() || 'punkter'}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Controls bar */}
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center'
      }}>
        {/* Dataset selector */}
        <div style={{ 
          display: 'flex', 
          borderRadius: '0.375rem',
          overflow: 'hidden'
        }}>
          {Object.entries(datasetConfig).map(([key, config]) => (
            <button 
              key={key}
              onClick={() => setSelectedDataset(key)}
              style={{ 
                padding: '0.5rem 1rem', 
                backgroundColor: selectedDataset === key 
                  ? config.color
                  : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: 'none',
                fontWeight: selectedDataset === key ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                borderRight: key !== 'politistasjoner' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
              }}
            >
              <span style={{ marginRight: '0.5rem' }}>{config.icon}</span>
              {config.title}
            </button>
          ))}
        </div>

        {/* Map layer selector */}
        <div style={{ 
          display: 'flex', 
          borderRadius: '0.375rem',
          overflow: 'hidden',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        }}>
          <button 
            onClick={() => setActiveLayer('osm')}
            style={{ 
              padding: '0.5rem 0.75rem',
              backgroundColor: activeLayer === 'osm' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              fontSize: '0.875rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}>
              <path fillRule="evenodd" d="M8.161 2.58a1.875 1.875 0 011.678 0l4.993 2.498c.106.052.23.052.336 0l3.869-1.935A1.875 1.875 0 0121.75 4.82v12.485c0 .71-.401 1.36-1.037 1.677l-4.875 2.437a1.875 1.875 0 01-1.676 0l-4.994-2.497a.375.375 0 00-.336 0l-3.868 1.935A1.875 1.875 0 012.25 19.18V6.695c0-.71.401-1.36 1.036-1.677l4.875-2.437zM9 6a.75.75 0 01.75.75V15a.75.75 0 01-1.5 0V6.75A.75.75 0 019 6zm6.75 3a.75.75 0 00-1.5 0v8.25a.75.75 0 001.5 0V9z" clipRule="evenodd" />
            </svg>
            Kart
          </button>
          <button 
            onClick={() => setActiveLayer('flyfoto')}
            style={{ 
              padding: '0.5rem 0.75rem',
              backgroundColor: activeLayer === 'flyfoto' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              fontSize: '0.875rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}>
              <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
            </svg>
            Flyfoto
          </button>
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div style={{ 
          backgroundColor: '#f87171',
          color: 'white',
          padding: '0.75rem 1.5rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }}>
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <ModernHeader />

      {/* Status bar with nearest location info */}
      {/* Status bar med nærmeste lokasjon info */}
      {nearestLocation && (
  <div style={{
    backgroundColor: '#1F2937',
    color: 'white',
    padding: '0.5rem 1.5rem',
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center'
  }}>
    <div style={{ 
      display: 'flex', 
      alignItems: 'center',
      marginRight: 'auto' // Skyver alt til venstre
    }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }}>
        <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
      </svg>
      <span>Nærmeste {nearestLocation.type.toLowerCase()}:</span>
      <span style={{ fontWeight: 'bold', marginLeft: '0.5rem' }}>{nearestLocation.name}</span>
      
      {/* Avstandsindikator integrert med teksten */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: getDistanceStatusColor(),
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontWeight: 'bold',
        marginLeft: '1rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}>
          <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
        </svg>
        {nearestLocation.distance}
      </div>
    </div>
  </div>
)}
      {/* Map container */}
      <div 
        ref={mapRef} 
        style={{
          flex: 1,
          width: '100%',
          height: '100%'
        }}
      />

      {/* Helper text */}
      <div style={{
  backgroundColor: '#0f172a', /* Mørkere blå farge */
  color: '#e2e8f0',
  borderTop: '1px solid #1e293b',
  padding: '0.75rem 1.5rem',
  fontSize: '0.875rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem'
}}>
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem', color: '#60a5fa' }}>
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
    <span>Klikk på markørene for mer informasjon om beredskapssenteret</span>
  </div>
  <div style={{ 
    fontSize: '0.75rem', 
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center'
  }}>
    <span>UiA - IS-218 © 2025 | </span>
    <span style={{ marginLeft: '0.5rem' }}>UiA IS-218 Gruppe 5</span>
  </div>
</div>
</div>
  );
}

export default App;