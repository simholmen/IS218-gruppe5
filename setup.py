import os
import subprocess

def install_dependencies():
    print("Installing dependencies...")
    # Endre til din QGIS Python 3 path
    subprocess.check_call(['/Applications/QGIS-LTR.app/Contents/MacOS/bin/python3', '-m', 'pip', 'install', '-r', 'requirements.txt'])

def create_env_file():
    if not os.path.exists('.env'):
        print("Creating .env file...")
        with open('.env.example', 'r') as example_file:
            with open('.env', 'w') as env_file:
                env_file.write(example_file.read())
    else:
        print(".env file already exists.")

if __name__ == "__main__":
    install_dependencies()
    create_env_file()
    print("Setup complete!")