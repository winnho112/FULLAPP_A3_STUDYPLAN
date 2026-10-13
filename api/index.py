import sys
import os

# Debug: print Python path and installed packages
print("Python version:", sys.version)
print("sys.path:", sys.path)

try:
    import pkg_resources
    installed = [p.project_name for p in pkg_resources.working_set]
    print("Installed packages:", installed)
except Exception as e:
    print("Could not list packages:", e)

backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, os.path.abspath(backend_path))

from app.main import app
