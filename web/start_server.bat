@echo off
echo Starting Funk Family Tree Visualization Server...
echo.
echo Open http://localhost:8000 in your browser
echo Press Ctrl+C to stop the server
echo.
cd /d "%~dp0"
python serve.py
pause
