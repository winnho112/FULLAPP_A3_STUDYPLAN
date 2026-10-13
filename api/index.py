import sys
import os

# Point to backend directory
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_path)

# Load .env from backend/ BEFORE importing main (which imports database)
from dotenv import load_dotenv
load_dotenv(os.path.join(backend_path, '.env'))

from main import app
from mangum import Mangum

handler = Mangum(app)