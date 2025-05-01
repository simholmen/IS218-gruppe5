import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from qgis.core import QgsApplication, QgsVectorLayer, QgsFeature, QgsGeometry
from qgis.analysis import QgsNativeAlgorithms  # Required to register native algorithms
import processing
from pyproj import Transformer

# Set QGIS environment variables
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QGIS_PREFIX_PATH'] = '/Applications/QGIS-LTR.app/Contents/MacOS'
os.environ['PYTHONPATH'] = '/Applications/QGIS-LTR.app/Contents/Resources/python:/Applications/QGIS-LTR.app/Contents/Resources/python/plugins'

# Initialize QGIS application
print("Initializing QGIS environment...")
QgsApplication.setPrefixPath("/Applications/QGIS-LTR.app/Contents/MacOS", True)
qgs = QgsApplication([], False)
qgs.setApplicationName("QGIS")  # Set application name
qgs.initQgis()

# Register the processing plugin
print("Registering processing plugin...")
QgsApplication.processingRegistry().addProvider(QgsNativeAlgorithms())

# Test the environment
print("QGIS environment is fully initialized!")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({'message': 'Welcome to the Shortest Path API!'})

@app.route('/shortestpath', methods=['OPTIONS'])
def shortest_path_options():
    response = jsonify({'success': True})
    response.headers.add('Access-Control-Allow-Origin', '*')  # Allow all origins for debugging
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    return response

# Define the shortest path route
@app.route('/shortestpath', methods=['POST'])
def shortest_path():
    try:
        data = request.json
        start_point = data['start_point']
        end_point = data['end_point']
        line_data = data['line_data']  # GeoJSON data for the lines

        # Reproject start_point and end_point to EPSG:3395
        formatted_start_point = reproject_point_to_epsg3395(start_point)
        formatted_end_point = reproject_point_to_epsg3395(end_point)

        print("Reprojected Start Point (EPSG:3395):", formatted_start_point)
        print("Reprojected End Point (EPSG:3395):", formatted_end_point)

        # Create a QGIS layer from the GeoJSON data
        layer = QgsVectorLayer("LineString?crs=EPSG:3395", "network", "memory")
        provider = layer.dataProvider()

        for feature in line_data['features']:
            qgs_feature = QgsFeature()
            geometry = feature['geometry']
            if geometry['type'] == 'LineString':
                coordinates = geometry['coordinates']
                wkt = f"LINESTRING ({', '.join([f'{x[0]} {x[1]}' for x in coordinates])})"
                qgs_feature.setGeometry(QgsGeometry.fromWkt(wkt))
            else:
                raise ValueError(f"Unsupported geometry type: {geometry['type']}")
            qgs_feature.setAttributes([
                feature['properties']['id'], 
                feature['properties']['pointA'], 
                feature['properties']['pointB'], 
                feature['properties']['pointC']
            ])
            provider.addFeatures([qgs_feature])

        print("Line data successfully added to the layer")
        print("Network CRS:", layer.crs().authid())

        # Add debug logs for snapped points
        print("Snapped START_POINT WKT:", QgsGeometry.fromWkt(f"POINT ({formatted_start_point.replace(',', ' ')})").asWkt())
        print("Snapped END_POINT WKT:", QgsGeometry.fromWkt(f"POINT ({formatted_end_point.replace(',', ' ')})").asWkt())

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
            'TOLERANCE': 1,  # Increase tolerance
            'START_POINT': formatted_start_point,
            'END_POINT': formatted_end_point,
            'OUTPUT': 'TEMPORARY_OUTPUT'
        }

        # Run the shortest path algorithm
        print("Running shortest path algorithm...")
        result = processing.run("native:shortestpathpointtopoint", params)
        output_layer = result['OUTPUT']

        # Extract features from the output layer
        features = []
        for feature in output_layer.getFeatures():
            features.append({
                'geometry': feature.geometry().asWkt(),
                'attributes': feature.attributes()
            })

        print("Shortest path calculation successful")
        return jsonify({'success': True, 'features': features})

    except Exception as e:
        print("Error:", str(e))
        return jsonify({'success': False, 'error': str(e)})
    
# Initialize a transformer for EPSG:4326 to EPSG:3395
transformer = Transformer.from_crs("EPSG:4326", "EPSG:3395", always_xy=True)

def reproject_point_to_epsg3395(point):
    if isinstance(point, str):
        # Parse the point string (e.g., "7.998127912203988,58.16109290942553")
        lng, lat = map(float, point.split(","))
    elif isinstance(point, dict) and 'lat' in point and 'lng' in point:
        lng, lat = point['lng'], point['lat']
    else:
        raise ValueError(f"Invalid point format: {point}")

    # Reproject the point to EPSG:3395
    x, y = transformer.transform(lng, lat)
    return f"{x},{y}"
    

# Exit QGIS application when the script stops
@app.route('/shutdown', methods=['POST'])
def shutdown():
    print("Exiting QGIS environment...")
    qgs.exitQgis()
    return jsonify({'success': True, 'message': 'QGIS environment shut down.'})

if __name__ == '__main__':
    app.run(debug=True)