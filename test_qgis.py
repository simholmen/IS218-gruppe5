import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from qgis.core import QgsApplication, QgsVectorLayer, QgsFeature, QgsGeometry
from qgis.analysis import QgsNativeAlgorithms  # Required to register native algorithms
import processing

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

        # Create a QGIS layer from the GeoJSON data
        layer = QgsVectorLayer("LineString?crs=EPSG:3395", "network", "memory")
        provider = layer.dataProvider()

        for feature in line_data['features']:
            qgs_feature = QgsFeature()
            qgs_feature.setGeometry(QgsGeometry.fromWkt(feature['geometry']))
            qgs_feature.setAttributes([feature['properties']['id'], feature['properties']['name']])
            provider.addFeatures([qgs_feature])

        print("Line data features:")
        for feature in line_data['features']:
            print("Geometry:", feature['geometry'])
            print("Properties:", feature['properties'])

        print("Start point:", start_point)
        print("End point:", end_point)

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
            'TOLERANCE': 10, # Hvor mye toleranse det er for å finne nærmeste linje
            'START_POINT': start_point,
            'END_POINT': end_point,
            'OUTPUT': 'TEMPORARY_OUTPUT'
        }

        # Run the shortest path algorithm
        result = processing.run("native:shortestpathpointtopoint", params)
        output_layer = result['OUTPUT']

        # Extract features from the output layer
        features = []
        for feature in output_layer.getFeatures():
            features.append({
                'geometry': feature.geometry().asWkt(),
                'attributes': feature.attributes()
            })

        return jsonify({'success': True, 'features': features})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Exit QGIS application when the script stops
@app.route('/shutdown', methods=['POST'])
def shutdown():
    print("Exiting QGIS environment...")
    qgs.exitQgis()
    return jsonify({'success': True, 'message': 'QGIS environment shut down.'})

if __name__ == '__main__':
    app.run(debug=True)