import http.server
import socketserver
import socket
import webbrowser
import qrcode

# Trouver un port libre à partir de 8000
def find_free_port(start=8000):
    port = start
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                port += 1

PORT = find_free_port(8000)

# Trouver l'IP locale
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80))
    ip = s.getsockname()[0]
finally:
    s.close()

url = f"http://{ip}:{PORT}"

print()
print("Serveur lancé sur :")
print(url)
print()

# Générer le QR code
img = qrcode.make(url)
img.save("qrcode.png")

# Générer la page QR
html = f"""
<html>
<head>
<meta charset="utf-8">
<title>Accès tablette</title>
<style>
body {{
  font-family: Arial;
  text-align:center;
  background:#111;
  color:white;
}}

img {{
  width:420px;
}}

.url {{
  font-size:34px;
  margin-top:20px;
}}

h1 {{
  font-size:40px;
}}
</style>
</head>

<body>

<h1>Accès tablette</h1>

<img src="qrcode.png">

<div class="url">{url}</div>

<p>Scanne le QR code avec la tablette</p>

</body>
</html>
"""

with open("qr.html", "w", encoding="utf8") as f:
    f.write(html)

# Serveur HTTP
class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

Handler = http.server.SimpleHTTPRequestHandler

with ReusableTCPServer(("", PORT), Handler) as httpd:
    print("Serveur actif. Ferme la fenêtre pour arrêter.")

    # ouvrir le navigateur une fois le serveur prêt
    webbrowser.open(f"http://localhost:{PORT}/qr.html")

    httpd.serve_forever()