import proj4 from "proj4";
import L from "leaflet";
import 'leaflet-geometryutil';

// Define the projection for EPSG:3395
const epsg3395 = "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs";
const epsg4326 = "+proj=longlat +datum=WGS84 +no_defs";

export const wktToGeoJSON = (wkt) => {
  if (!wkt.startsWith("LineString")) {
    throw new Error("Unsupported WKT type. Only LineString is supported.");
  }

  // Extract the coordinates from the WKT string
  const coordinates = wkt
    .replace("LineString (", "")
    .replace(")", "")
    .split(", ")
    .map((pair) => {
      const [x, y] = pair.split(" ").map(Number);
      // Reproject from EPSG:3395 to EPSG:4326
      const [lng, lat] = proj4(epsg3395, epsg4326, [x, y]);
      return [lng, lat];
    });

  return {
    type: "LineString",
    coordinates
  };
};

export const runShortestPath = async (startPoint, endPoint, visualizeShortestPath, mapInstanceRef) => {
  try {
    const response = await fetch("http://127.0.0.1:5000/shortestpath", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        start_point: startPoint,
        end_point: endPoint
      })
    });

    const data = await response.json();
    if (data.success) {
      console.log("Shortest path result:", data.features);
      visualizeShortestPath(data.features, mapInstanceRef); // Visualize the path on the map
    } else {
      console.error("Error running shortest path:", data.error);
    }
  } catch (error) {
    console.error("Error connecting to backend:", error);
  }
};

export const visualizeShortestPath = (features, mapInstanceRef) => {
  features.forEach((feature) => {
    try {
      // Convert WKT to GeoJSON
      const wkt = feature.geometry;
      const geoJson = wktToGeoJSON(wkt);

      console.log("Converted GeoJSON:", geoJson);

      // Create a polyline from the GeoJSON coordinates
      const line = L.polyline(
        geoJson.coordinates.map(([lng, lat]) => [lat, lng]), // Convert to [lat, lng]
        { color: "red", weight: 5 }
      ).addTo(mapInstanceRef.current);

      // Adjust the map view to fit the polyline
      mapInstanceRef.current.fitBounds(line.getBounds());

      console.log("Polyline added to the map:", line);
    } catch (error) {
      console.error("Error visualizing shortest path:", error);
    }
  });
};

const snapToNearestLine = (point, geoJson, mapInstanceRef) => {
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
    throw new Error(`Invalid point object: ${JSON.stringify(point)}`);
  }

  let closestPoint = null;
  let shortestDistance = Infinity;

  geoJson.features.forEach((feature) => {
    const coordinates = feature.geometry.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      console.warn(`Skipping invalid feature coordinates: ${JSON.stringify(coordinates)}`);
      return;
    }

    for (let i = 0; i < coordinates.length - 1; i++) {
      // Reproject the segment start and end points from EPSG:3395 to EPSG:4326
      const [startLng, startLat] = proj4(epsg3395, epsg4326, coordinates[i]);
      const [endLng, endLat] = proj4(epsg3395, epsg4326, coordinates[i + 1]);

      const segmentStart = L.latLng(startLat, startLng);
      const segmentEnd = L.latLng(endLat, endLng);

      // Find the closest point on the segment
      const snappedPoint = L.GeometryUtil.closestOnSegment(
        mapInstanceRef.current, // Pass the map instance
        L.latLng(point.lat, point.lng),
        segmentStart,
        segmentEnd
      );

      if (!snappedPoint) {
        console.warn(`No snapped point found for segment: ${segmentStart}, ${segmentEnd}`);
        continue;
      }

      const distance = L.latLng(point.lat, point.lng).distanceTo(snappedPoint);

      if (distance < shortestDistance) {
        shortestDistance = distance;
        closestPoint = snappedPoint;
      }
    }
  });

  if (!closestPoint) {
    throw new Error('No closest point found on any line segment.');
  }

  return closestPoint;
};