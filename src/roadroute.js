import L from 'leaflet';

export function calculateDistanceBetweenTwoPoints(pointA, pointB) {
  if (!pointA || !pointB || !pointB[0] || !pointB[1]) {
    console.error("Invalid points for distance calculation:", pointA, pointB);
    return Infinity;
  }
  try {
    return pointA.distanceTo(L.latLng(pointB[0], pointB[1]));
  } catch (e) {
    console.error('Error calculating distance:', e);
    return Infinity;
  }
}

export function drawLineBetweenTwoPoints(pointA, pointB, mapInstance) {
    if (!pointA || !pointB || !pointB[0] || !pointB[1]) {
      console.error("Invalid points for drawing line:", pointA, pointB);
      return null;
    }
    if (!mapInstance) {
      console.error("Map instance is not defined.");
      return null;
    }
    try {
      return L.polyline([pointA, L.latLng(pointB[0], pointB[1])], {
        color: 'red',
        weight: 5,
      }).addTo(mapInstance);
    } catch (e) {
      console.error('Error drawing line:', e);
      return null;
    }
  }

export function drawRoadRoute(routeGeometry, mapInstance, color = 'blue') {
  if (!mapInstance || !routeGeometry || routeGeometry.length === 0) {
    console.error("Invalid route geometry or map instance");
    return null;
  }
  try {
    const latLngs = routeGeometry.map(coord => L.latLng(coord[1], coord[0]));
    return L.polyline(latLngs, {
      color,
      weight: 5,
      opacity: 0.7,
      lineJoin: 'round',
    }).addTo(mapInstance);
  } catch (e) {
    console.error('Error drawing road route:', e);
    return null;
  }
}