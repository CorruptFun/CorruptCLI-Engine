import http.server
import socketserver
import os

PORT = 8000
DIRECTORY = "frontend"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    if not os.path.exists(DIRECTORY):
        print(f"❌ Error: {DIRECTORY} directory not found.")
        return

    print("\n" + "="*50)
    print("💠 CORRUPT SOLUTIONS | LOCAL DEV HARNESS 💠")
    print("="*50)
    print(f"📡 Serving frontend at: http://localhost:{PORT}")
    print("\n👉 To test the full stack:")
    print("1. Ensure Supabase Local is running: 'supabase start'")
    print("2. Update 'js/booking.js' with your local Supabase URL.")
    print("3. Open your browser to http://localhost:8000")
    print("="*50 + "\n")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()

if __name__ == "__main__":
    start_server()
