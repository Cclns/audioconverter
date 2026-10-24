#!/usr/bin/env python3
import http.server
import socketserver
import socket
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't need to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable cross-origin isolation and caching headers
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    ip = get_local_ip()
    url = f"http://{ip}:{PORT}"
    
    print("\n" + "="*50)
    print("🚀 Video Audio Extractor PWA Server is running!")
    print("="*50)
    print(f"\n👉 On your iPhone (connected to the same Wi-Fi), open Safari and go to:")
    print(f"\n      {url}\n")
    print("👉 To install it as an app on your iPhone:")
    print("   1. Open the URL above in Safari.")
    print("   2. Tap the 'Share' button (square with arrow pointing up).")
    print("   3. Tap 'Add to Home Screen'.")
    print("="*50)
    print("Press Ctrl+C to stop the server.\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
