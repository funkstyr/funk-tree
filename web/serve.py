"""
Simple HTTP server to serve the family tree visualization.
Run this script and open http://localhost:8000 in your browser.
"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8000

# Change to web directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler

# Set MIME types
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
})

print(f"Starting server at http://localhost:{PORT}")
print("Press Ctrl+C to stop")
print()

# Open browser
webbrowser.open(f'http://localhost:{PORT}')

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
