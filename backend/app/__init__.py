import sys
import os

# Add this directory to sys.path so sibling imports (import database, from routes.auth import ...) work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
