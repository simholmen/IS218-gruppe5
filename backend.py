import os
import sys
import psycopg2
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from qgis.core import QgsApplication, QgsVectorLayer, QgsFeature, QgsGeometry
from qgis.analysis import QgsNativeAlgorithms 
from pyproj import Transformer


# Set QGIS environment variables
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QGIS_PREFIX_PATH'] = '/Applications/QGIS-LTR.app/Contents/MacOS'
os.environ['PYTHONPATH'] = '/Applications/QGIS-LTR.app/Contents/Resources/python:/Applications/QGIS-LTR.app/Contents/Resources/python/plugins'
print("PYTHONPATH:", os.environ.get('PYTHONPATH'))

sys.path.append('/Applications/QGIS-LTR.app/Contents/Resources/python/plugins')

# Initialize QGIS application
print("Initializing QGIS environment...")
QgsApplication.setPrefixPath("/Applications/QGIS-LTR.app/Contents/MacOS", True)
qgs = QgsApplication([], False)
qgs.setApplicationName("QGIS")  
qgs.initQgis()

import processing

# Register the processing plugin
print("Registering processing plugin...")
QgsApplication.processingRegistry().addProvider(QgsNativeAlgorithms())

# Test the environment
print("QGIS environment is fully initialized!")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Database connection function
load_dotenv()  # Load environment variables from .env file
def get_db_connection():
    connection_string = os.getenv('DATABASE_URL')
    if not connection_string:
        raise ValueError("DATABASE_URL is not set in the .env file")
    return psycopg2.connect(connection_string)

print("DATABASE_URL:", os.getenv('DATABASE_URL'))

@app.route('/')
def home():
    return jsonify({'message': 'Welcome to the Shortest Path API!'})

@app.route('/fetch_lines', methods=['POST'])
def fetch_lines():
    try:
        data = request.json
        min_x = data['min_x']
        min_y = data['min_y']
        max_x = data['max_x']
        max_y = data['max_y']

        # Expansion factor for the bounding box
        expansion_factor = 1.2  # Increase by 20% each iteration
        max_attempts = 5  # Maximum number of expansions
        attempt = 0

        while attempt < max_attempts:
            # Pagination variables
            limit = 1000  # Number of rows to fetch per page
            offset = 0    # Start at the first row
            all_features = []

            conn = get_db_connection()
            cursor = conn.cursor()

            while True:
                query = """
                    SELECT id, ST_AsGeoJSON(geom)::text AS geometry, "POINTA", "POINTB", "POINTC"
                    FROM "linesForShortestPath"
                    WHERE ST_Intersects(
                        geom,
                        ST_Transform(
                            ST_MakeEnvelope(%s, %s, %s, %s, 4326),
                            3395
                        )
                    )
                    LIMIT %s OFFSET %s
                """
                cursor.execute(query, (min_x, min_y, max_x, max_y, limit, offset))
                rows = cursor.fetchall()

                # Convert the result to GeoJSON features
                features = []
                for row in rows:
                    features.append({
                        'type': 'Feature',
                        'geometry': row[1],
                        'properties': {
                            'id': row[0],
                            'pointA': row[2],
                            'pointB': row[3],
                            'pointC': row[4]
                        }
                    })

                # Add the features to the overall list
                all_features.extend(features)

                # Break the loop if no more rows are returned
                if len(features) < limit:
                    break

                # Increment the offset for the next page
                offset += limit

            cursor.close()
            conn.close()

            # If we fetched enough lines, return the result
            if len(all_features) > 0:
                geojson = {
                    'type': 'FeatureCollection',
                    'features': all_features
                }
                return jsonify(geojson)

            # Expand the bounding box
            print(f"Expanding bounding box (attempt {attempt + 1})...")
            min_x -= (max_x - min_x) * (expansion_factor - 1) / 2
            max_x += (max_x - min_x) * (expansion_factor - 1) / 2
            min_y -= (max_y - min_y) * (expansion_factor - 1) / 2
            max_y += (max_y - min_y) * (expansion_factor - 1) / 2
            attempt += 1

        # If no lines are found after expanding, return an error
        return jsonify({'error': 'No lines found in the expanded bounding box'}), 404

    except Exception as e:
        print("Error fetching lines:", str(e))
        return jsonify({'error': str(e)}), 500
    

@app.route('/shortestpath', methods=['OPTIONS'])
def shortest_path_options():
    response = jsonify({'success': True})
    response.headers.add('Access-Control-Allow-Origin', '*')  # Allow all origins for debugging
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    return response

# Endre punktene fra EPSG:4326 til EPSG:3395
transformer = Transformer.from_crs("EPSG:4326", "EPSG:3395", always_xy=True)

# Funksjon for å endre punkter fra EPSG:4326 til EPSG:3395
def reproject_point_to_epsg3395(point):
    if isinstance(point, str):
        lng, lat = map(float, point.split(","))
    elif isinstance(point, dict) and 'lat' in point and 'lng' in point:
        lng, lat = point['lng'], point['lat']
    else:
        raise ValueError(f"Invalid point format: {point}")

    x, y = transformer.transform(lng, lat)
    return f"{x},{y}"

def snap_to_nearest_line(point, lines):
    from shapely.geometry import Point, LineString, MultiLineString

    point_geom = Point(point['lng'], point['lat'])
    nearest_line = None
    shortest_distance = float('inf')

    print(f"Snapping point: {point}")

    for line in lines:
        try:
            geometry = line['geometry']
            if geometry['type'] == 'LineString':
                line_geom = LineString(geometry['coordinates'])
                distance = point_geom.distance(line_geom)
                if distance < shortest_distance:
                    shortest_distance = distance
                    nearest_line = line_geom
            elif geometry['type'] == 'MultiLineString':
                for line_coords in geometry['coordinates']:
                    line_geom = LineString(line_coords)
                    distance = point_geom.distance(line_geom)
                    if distance < shortest_distance:
                        shortest_distance = distance
                        nearest_line = line_geom
            else:
                print(f"Unsupported geometry type: {geometry['type']}")
        except Exception as e:
            print(f"Error processing line: {line['geometry']}, Error: {e}")
            continue

    if nearest_line:
        snapped_point = nearest_line.interpolate(nearest_line.project(point_geom))
        print(f"Snapped point: {snapped_point}, Distance: {shortest_distance}")
        return {'lat': snapped_point.y, 'lng': snapped_point.x}
    else:
        print("No nearest line found for point:", point)
        return point  # Return the original point if no line is found

# Funksjonen for å kalkulere shortestpathAI
@app.route('/shortestpath', methods=['POST'])
def shortest_path():
    try:
        data = request.json
        start_point = data['start_point']
        end_point = data['end_point']

        # Reproject start and end points to EPSG:3395
        formatted_start_point = reproject_point_to_epsg3395(start_point)
        formatted_end_point = reproject_point_to_epsg3395(end_point)

        # Expansion factor for the bounding box
        expansion_factor = 1.2  # Increase by 20% each iteration
        max_attempts = 3  # Maximum number of expansions
        attempt = 0

        # Calculate initial bounding box
        min_x = min(start_point['lng'], end_point['lng'])
        min_y = min(start_point['lat'], end_point['lat'])
        max_x = max(start_point['lng'], end_point['lng'])
        max_y = max(start_point['lat'], end_point['lat'])

        # Ensure the bounding box is slightly expanded to include nearby lines
        initial_expansion_factor = 1.1  # Expand by 10%
        width = max_x - min_x
        height = max_y - min_y

        min_x -= width * (initial_expansion_factor - 1) / 2
        max_x += width * (initial_expansion_factor - 1) / 2
        min_y -= height * (initial_expansion_factor - 1) / 2
        max_y += height * (initial_expansion_factor - 1) / 2

        while attempt < max_attempts:
            # Fetch lines directly from the backend
            response = fetch_lines_from_backend(min_x, min_y, max_x, max_y)
            if not response['success']:
                print(f"Attempt {attempt + 1}: No lines found in the bounding box.")
                attempt += 1
                # Expand the bounding box
                min_x -= (max_x - min_x) * (expansion_factor - 1) / 2
                max_x += (max_x - min_x) * (expansion_factor - 1) / 2
                min_y -= (max_y - min_y) * (expansion_factor - 1) / 2
                max_y += (max_y - min_y) * (expansion_factor - 1) / 2
                continue

            line_data = response.get('geojson', {})
            if not isinstance(line_data, dict):
                print("Error: Invalid GeoJSON data received.")
                return jsonify({'success': False, 'error': 'Invalid GeoJSON data received.'})

            # Create a QGIS layer from the GeoJSON data
            layer = QgsVectorLayer("LineString?crs=EPSG:3395", "network", "memory")
            provider = layer.dataProvider()

            for feature in line_data['features']:
                if not isinstance(feature, dict):
                    print("Error: Invalid feature format:", feature)
                    continue

                qgs_feature = QgsFeature()
                geometry = feature['geometry']

                if isinstance(geometry, str):
                    import json
                    geometry = json.loads(geometry)

                if geometry['type'] == 'LineString':
                    coordinates = geometry['coordinates']
                    wkt = f"LINESTRING ({', '.join([f'{x[0]} {x[1]}' for x in coordinates])})"
                    qgs_feature.setGeometry(QgsGeometry.fromWkt(wkt))
                elif geometry['type'] == 'MultiLineString':
                    for line in geometry['coordinates']:
                        wkt = f"LINESTRING ({', '.join([f'{x[0]} {x[1]}' for x in line])})"
                        qgs_feature = QgsFeature()
                        qgs_feature.setGeometry(QgsGeometry.fromWkt(wkt))
                        qgs_feature.setAttributes([
                            feature['properties']['id'], 
                            feature['properties']['pointA'], 
                            feature['properties']['pointB'], 
                            feature['properties']['pointC']
                        ])
                        provider.addFeatures([qgs_feature])
                else:
                    raise ValueError(f"Unsupported geometry type: {geometry['type']}")
                
                qgs_feature.setAttributes([
                    feature['properties']['id'], 
                    feature['properties']['pointA'], 
                    feature['properties']['pointB'], 
                    feature['properties']['pointC']
                ])
                provider.addFeatures([qgs_feature])

            # Debugging logs
            print("Snapped START_POINT WKT:", QgsGeometry.fromWkt(f"POINT ({formatted_start_point.replace(',', ' ')})").asWkt())
            print("Snapped END_POINT WKT:", QgsGeometry.fromWkt(f"POINT ({formatted_end_point.replace(',', ' ')})").asWkt())
            print(f"Number of lines in the network layer: {layer.featureCount()}")

            # Define parameters for the shortest path algorithm
            params = {
                'INPUT': layer,
                'STRATEGY': 0,
                'DIRECTION_FIELD': '',
                'VALUE_FORWARD': '',
                'VALUE_BACKWARD': '',
                'VALUE_BOTH': '',
                'DEFAULT_DIRECTION': 2,
                'SPEED_FIELD': '',
                'DEFAULT_SPEED': 50,
                'TOLERANCE': 1,  # Tolerance for how much the line can deviate from the point
                'START_POINT': formatted_start_point,
                'END_POINT': formatted_end_point,
                'OUTPUT': 'TEMPORARY_OUTPUT'
            }

            # Run the shortest path algorithm
            try:
                print("Running shortest path algorithm...")
                result = processing.run("native:shortestpathpointtopoint", params)
                output_layer = result['OUTPUT']

                # Retrieve the results
                features = []
                for feature in output_layer.getFeatures():
                    features.append({
                        'geometry': feature.geometry().asWkt(),
                        'attributes': feature.attributes()
                    })

                print("Shortest path calculation successful")
                return jsonify({'success': True, 'features': features})

            except Exception as e:
                print(f"Attempt {attempt + 1}: No route found. Expanding bounding box...")
                attempt += 1
                # Expand the bounding box
                min_x -= (max_x - min_x) * (expansion_factor - 1) / 2
                max_x += (max_x - min_x) * (expansion_factor - 1) / 2
                min_y -= (max_y - min_y) * (expansion_factor - 1) / 2
                max_y += (max_y - min_y) * (expansion_factor - 1) / 2

        # If no route is found after all attempts, return an error
        return jsonify({'success': False, 'error': 'No route found after expanding the bounding box'})

    except Exception as e:
        print("Error:", str(e))
        return jsonify({'success': False, 'error': str(e)})


def fetch_lines_from_backend(min_x, min_y, max_x, max_y):
    """
    Helper function to fetch lines from the /fetch_lines endpoint.
    """
    try:
        response = requests.post("http://127.0.0.1:5000/fetch_lines", json={
            'min_x': min_x,
            'min_y': min_y,
            'max_x': max_x,
            'max_y': max_y
        })
        if response.status_code == 200:
            return {'success': True, 'geojson': response.json()}
        else:
            return {'success': False, 'error': response.json()}
    except Exception as e:
        print("Error fetching lines from backend:", str(e))
        return {'success': False, 'error': str(e)}
    

# Exit QGIS application when the script stops
@app.route('/shutdown', methods=['POST'])
def shutdown():
    print("Exiting QGIS environment...")
    qgs.exitQgis()
    return jsonify({'success': True, 'message': 'QGIS environment shut down.'})

if __name__ == '__main__':
    app.run(debug=True)