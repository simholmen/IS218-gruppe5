import React, { useEffect, useRef, useState } from 'react';
import L, { map } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw'
import { supabase } from './config/supabase';
import { runShortestPath, visualizeShortestPath } from "./aiShortestPath";
import { calculateDistanceBetweenTwoPoints, drawLineBetweenTwoPoints, drawRoadRoute } from './roadroute';

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
  const [useRoadDistance, setUseRoadDistance] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [nearestLocation, setNearestLocation] = useState(null);
  const pointsRef = useRef({ startPoint: null, endPoint: null });
  const isFetchingRef = useRef(false);
  const userMarkerRef = useRef(null);
  
  // Referanser til kartlag
  const osmLayerRef = useRef(null);
  const flyFotoLayerRef = useRef(null);
  const circleLayerRef = useRef(null);
  
  // Kartlegg datasettnavn til tabellnavn og navnekolonner
  const datasetConfig = {
    'brannstasjoner': { 
      table: 'NyBrannstasjoner', 
      nameColumn: 'brannstasjon',
      type: 'points',
      color: '#EF4444',
      icon: '🚒',
      title: 'Brannstasjoner'
    },
    'sykehus': { 
      table: 'sykehus', 
      nameColumn: 'navn',
      type: 'points',
      color: '#10B981',
      icon: '🏥',
      title: 'Sykehus'
    },
    'politistasjoner': { 
      table: 'politistasjon', 
      nameColumn: 'name',
      type: 'points',
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
        table_name: tableName,
      });
  
      if (error) {
        throw new Error(`Feil ved henting av data fra ${tableName}: ${error.message}`);
      }
  
      if (!data || data.length === 0) {
        console.log(`Ingen data funnet i tabellen ${tableName}.`);
        return [];
      }
  
      console.log(`Data hentet fra ${tableName}:`, data);
  
      if (type === 'lines') {
        return data.map((item) => ({
          id: item.id,
          name: item.name || 'Ukjent',
          coordinates: item.coordinates.coordinates,
        }));
      } else {
        const processedData = data.map((item) => ({
          id: item.id,
          name: item.name || 'Ukjent',
          adresse: '',
          coordinates: item.coordinates,
        }));
  
        console.log("Processed data for brannstasjoner:", processedData);
        return processedData;
      }
    } catch (error) {
      console.error(`Feil ved henting av data fra ${tableName}:`, error);
      setError(`Kunne ikke hente data fra ${tableName}: ${error.message}`);
      return [];
    }
  };

  // Håndter endring av datasett
  useEffect(() => {
    const fetchPostGISData = async () => {
      if (isFetchingRef.current) return; // Passer på at den bare fetcher data 1 gang
      isFetchingRef.current = true;
  
      if (!mapInstanceRef.current) return;
  
      setLoading(true);
      setError(null);
      setNearestLocation(null);
  
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
  
        // Add points or lines to the map
if (config.type === 'lines') {
  items.forEach((item) => {
    try {
      const transformedCoordinates = item.coordinates.map(([lng, lat]) => [lat, lng]);
      const line = L.polyline(transformedCoordinates, {
        color: config.color || 'blue',
        weight: 1,
      }).addTo(mapInstanceRef.current);
      line.bindPopup(`<strong>${item.name}</strong>`);
    } catch (error) {
      console.error('Feil ved opprettelse av linje:', error);
    }
  });
} else {
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
 
  const icon = createCustomIcon(config.color || '#3B82F6');
 
  items.forEach((item) => {
    try {
      const [lat, lng] = item.coordinates;
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
 
      const marker = L.marker([lat, lng], { icon });
      const popupContent = `
        <div style="font-family: sans-serif; padding: 4px;">
          <strong>${item.name}</strong>
          ${item.adresse ? `<br><span style="color: #666; font-size: 0.9em;">Adresse: ${item.adresse}</span>` : ''}
        </div>
      `;
     
      marker.bindPopup(popupContent);
      marker.addTo(mapInstanceRef.current);
    } catch (error) {
      console.error('Feil ved opprettelse av markør:', error);
    }
  });
}

// Find the closest marker
try {
  const result = await findClosestMarker(items, useRoadDistance);
  if (!result || !result.closestMarker) {
    console.warn("No closest marker found");
    return;
  }

  const { closestMarker, shortestDistance } = result;
  if (!closestMarker || !closestMarker.coordinates || closestMarker.coordinates.length !== 2) {
    console.error("Invalid closest marker or coordinates:", closestMarker);
    return;
  }

  let line;
  if (useRoadDistance && closestMarker.routeGeometry) {
    if (mapInstanceRef.current) {
      line = drawRoadRoute(closestMarker.routeGeometry, mapInstanceRef.current, config.color || 'blue');
    } else {
      console.error('Map instance is not initialized.');
    }
  } else {
    if (mapInstanceRef.current) {
      line = drawLineBetweenTwoPoints(userPosition, closestMarker.coordinates, mapInstanceRef.current);
    } else {
      console.error('Map instance is not initialized.');
    }
  }

  if (line) {
    // Formaterer avstand i km hvis mer enn 1000m
    const formattedDistance = shortestDistance >= 1000 
      ? `${(shortestDistance / 1000).toFixed(1)} km`
      : `${Math.round(shortestDistance)} m`;
      
    // Lagre informasjon om nærmeste lokasjon
    setNearestLocation({
      name: closestMarker.name,
      distance: formattedDistance,
      type: config.title || 'lokasjon'
    });
    
    const distancePopup = `
      <div style="text-align: center; font-family: sans-serif; padding: 4px;">
        <strong>Avstand: ${formattedDistance}</strong>
      </div>
    `;
    line.bindPopup(distancePopup);
  }
} catch (error) {
  console.error('Feil ved beregning av nærmeste lokasjon:', error);
}
        console.error('Feil ved prosessering av data:', error);
        setError(`Feil ved prosessering av data: ${error.message}`);
      } finally {
        setLoading(false);
        isFetchingRef.current = false; // Reset the flag
      }
    };
  
    fetchPostGISData();
  }, [selectedDataset, userPosition, useRoadDistance]);

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

  // Funksjon for å utføre analyse innenfor radius
  const performRadiusAnalysis = async (point, radius) => {
    // Implementer geografisk spørring her senere
  };

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
      // Fjern gamle pulsering hvis den finnes
      if (userMarkerRef.current && userMarkerRef.current.pulseMarker) {
        mapInstanceRef.current.removeLayer(userMarkerRef.current.pulseMarker);
      }
      
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
        radius: 20,
        color: '#3B82F6', // Sterkere blåfarge
        fillColor: '#60A5FA', // Lysere fyllfarge
        fillOpacity: 0.5, // Økt opasitet
        weight: 2, // Tykkere omriss
        opacity: 0.8 // Høyere opasitet på linjen
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
          if (size >= 35) growing = false; // Større maksimal størrelse
        } else {
          size -= 1;
          if (size <= 15) growing = true; // Ikke reduser så mye
        }
        
        pulseMarker.setRadius(size);
        pulseMarker.setStyle({
          fillOpacity: 0.7 - (size - 15) / 50, // Høyere opasitet
          opacity: 0.9 - (size - 15) / 40 // Høyere opasitet
        });
      }, 80); // Litt raskere pulsering
    }
  }

  // Add this function to calculate road distances using OpenRouteService
  async function findClosestByRoad(userCoords, items) {
    // Add pre-filtering to avoid excessive API calls
    // Only try to calculate road distance for items within a reasonable air distance
    const MAX_AIR_DISTANCE = 20000; // 20km max air distance to even try road calculation
    
    // Pre-filter items to avoid unnecessary API calls
    const closeItems = items.filter(item => {
      if (!item.coordinates || item.coordinates.length !== 2) return false;
      
      // Calculate air distance first
      const airDistance = calculateDistanceBetweenTwoPoints(
        userCoords, 
        [item.coordinates[0], item.coordinates[1]]
      );
      
      // Only process items within reasonable distance
      return airDistance < MAX_AIR_DISTANCE;
    });
    
    console.log(`Filtered from ${items.length} to ${closeItems.length} items within ${MAX_AIR_DISTANCE/1000}km air distance`);
    
    // Add delay between API calls to avoid rate limiting
    let shortestDistance = Infinity;
    let closestMarker = null;
    
    const apikey = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;
    if (!apikey) {
      console.error("API key is missing. Please check your .env file.");
      return { closestMarker: null, shortestDistance: Infinity };
    } else {
      // Log a masked version for debugging (only showing first few chars)
      console.log(`Using API key: ${apikey.substring(0, 4)}...`);
    }

    for (const item of closeItems) {
      if (!item.coordinates || item.coordinates.length !== 2) {
        console.error("Invalid coordinates for item:", item);
        continue;
      }
      
      const destCoords = [item.coordinates[1], item.coordinates[0]]; // Ensure [lng, lat]

      try {
        // Instead of using CORS-Anywhere:
        console.log("Sending request with coordinates:", [
          [userCoords.lng, userCoords.lat],
          [destCoords[0], destCoords[1]]
        ]);
        
        const response = await fetch('/api/v2/directions/driving-car/geojson', {
          method: 'POST',
          headers: {
            'Authorization': apikey,
            'Content-Type': 'application/json',
            'Accept': 'application/json, application/geo+json, application/gpx+xml',
            'Origin': window.location.origin
          },
          body: JSON.stringify({
            coordinates: [
              [parseFloat(userCoords.lng), parseFloat(userCoords.lat)],
              [parseFloat(destCoords[0]), parseFloat(destCoords[1])],
            ],
            preference: "shortest",
            units: "m",
            language: "en-us",
            format: "geojson"
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error (${response.status}): ${response.statusText}`, errorText);
          continue;
        }

        const data = await response.json();
        console.log("API response:", data); // Debugging log

        // Add error checking before accessing nested properties
        if (data && data.features && data.features.length > 0 && 
            data.features[0].properties && data.features[0].properties.summary) {
          const distance = data.features[0].properties.summary.distance; // meters
          console.log(`Road distance to ${item.name}: ${distance} meters`);
          
          // Store the route geometry for the closest path
          if (distance < shortestDistance) {
            shortestDistance = distance;
            closestMarker = item;
            // Store the route geometry for drawing later
            closestMarker.routeGeometry = data.features[0].geometry.coordinates;
          }
        } else {
          console.error("Invalid API response format:", data);
        }
      } catch (error) {
        console.error('Error fetching road distance:', error);
        // Continue with next item
      }
    }

    if (shortestDistance === Infinity || !closestMarker) {
      console.log("No valid road distances calculated, returning null");
      return { closestMarker: null, shortestDistance: Infinity };
    }

    return { closestMarker, shortestDistance };
  }

  // Funksjon for å finne nærmeste valgte type marker
  async function findClosestMarker(items, useRoadDistance = false) {
    if (!userPosition) {
      console.warn("User position is not set.");
      return { closestMarker: null, shortestDistance: Infinity };
    }
    
    if (useRoadDistance) {
      console.log("Calculating road distance...");
      try {
        // Await the result
        const roadResult = await findClosestByRoad(userPosition, items);
        if (roadResult && roadResult.closestMarker) {
          console.log("Successfully found closest by road");
          return roadResult;
        }
        console.warn("Road distance calculation didn't find a result, falling back to air distance");
      } catch (error) {
        console.error("Road distance calculation failed, falling back to air distance:", error);
      }
    }
    
    // Calculate air distance as fallback
    console.log("Calculating air distance...");
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Modern Header with gradient background */}
      <div style={{
        width: '100%',
        background: 'linear-gradient(to right, #1e293b, #334155)',
        color: 'white',
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
          
          {/* Road distance toggle */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center', 
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.875rem'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{
                width: '2.5rem',
                height: '1.25rem',
                backgroundColor: useRoadDistance ? '#10B981' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: '9999px',
                position: 'relative',
                transition: 'background-color 0.2s ease',
                marginRight: '0.5rem'
              }}>
                <div style={{
                  position: 'absolute',
                  width: '1rem',
                  height: '1rem',
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  top: '0.125rem',
                  left: useRoadDistance ? 'calc(100% - 1.125rem)' : '0.125rem',
                  transition: 'left 0.2s ease'
                }}></div>
              </div>
              <span>Bruk veidistanse</span>
              <input 
                type="checkbox"
                checked={useRoadDistance}
                onChange={(e) => setUseRoadDistance(e.target.checked)}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
              />
            </label>
          </div>
          
          {/* Route-finding buttons */}
          <div style={{
            display: 'flex',
            gap: '0.5rem'
          }}>
            <button
              onClick={() => {
                pointsRef.current = { startPoint: null, endPoint: null };
                setStartPoint(null);
                setEndPoint(null);
                console.log('Points reset.');
                removeAllMarkersAndPolylines(); // Clear all markers and lines from the map
              }}
              style={{ 
                padding: '0.5rem 0.75rem',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}>
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
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
                  startPoint,
                  endPoint,
                  (features) => visualizeShortestPath(features, mapInstanceRef),
                  mapInstanceRef
                );
              }}
              style={{ 
                padding: '0.5rem 0.75rem',
                backgroundColor: (!startPoint || !endPoint) ? 'rgba(255, 255, 255, 0.1)' : '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: (!startPoint || !endPoint) ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                opacity: (!startPoint || !endPoint) ? 0.7 : 1
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}>
                <path fillRule="evenodd" d="M13.5 4.938a7 7 0 11-9.006 1.737c.202-.257.59-.218.793.039.278.352.594.672.943.954.332.269.786.217 1.049-.052.21-.223.433-.438.668-.644.316-.28.337-.762.05-1.066a6.974 6.974 0 01-1.28-1.822 7 7 0 012.75-8.464c-.434.23-.865.489-1.293.774-.313.21-.43.606-.233.91a6.969 6.969 0 00-1.225 3.69 6.95 6.95 0 01-2.38-.024c-.367-.065-.699.2-.759.566a7.043 7.043 0 01-1.082 2.509.758.758 0 00.1 1.004c.238.226.39.552.39.917a.75.75 0 11-1.5 0 2.333 2.333 0 00-.362-1.255.946.946 0 01-.625.34 7.01 7.01 0 002.913 3.034c.409.256.608.729.462 1.18-.147.453-.608.653-1.062.542a7.021 7.021 0 01-2.571-1.488c-.291-.256-.673-.327-.993-.141a7.01 7.01 0 01-1.164.5.948.948 0 01.087-.65 7.016 7.016 0 01-1.562-2.69.949.949 0 010-1.897c.284-.14.55-.326.78-.55a.953.953 0 01.687-.88c.262-.065.51-.169.742-.3a.95.95 0 00-.087-1.652c-.327-.234-.428-.647-.25-.975a7.011 7.011 0 012.234-2.297.95.95 0 00.3-1.285c-.176-.34-.069-.756.246-.966a6.98 6.98 0 013.5-1.31.88.88 0 00.854-.562 6.946 6.946 0 12.004 2.062z" clipRule="evenodd" />
              </svg>
              Finn korteste vei
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
      {/* Status bar with nearest location info */}
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
      <div 
        ref={mapRef} 
        style={{
          flex: 1,
          width: '100%',
          height: '100%'
        }}
      />

      {/* Forbedret footer */}
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
          <span>Klikk på markører for mer informasjon om beredskapspunkter</span>
        </div>
        <div style={{ 
          fontSize: '0.75rem', 
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center'
        }}>
          <span>Beredskapsdata © 2025 | </span>
          <span style={{ marginLeft: '0.5rem' }}>UiA IS-218 Gruppe 5</span>
        </div>
      </div>
    </div>
  );
}

export default App;
