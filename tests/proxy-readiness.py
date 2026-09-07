"""Real Nginx + TLS regression: old 401 responses and initial 502s must not commit a release."""
import base64
import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time

authorization = 'Basic ' + base64.b64encode(b'test:local-test-password-only').decode()

def backend(release):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get('Authorization') != authorization:
                self.send_response(401); self.end_headers(); return
            self.send_response(200); self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'release': release}).encode())
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

old = backend('a' * 40)
new = backend('b' * 40)
source = Path('deploy/deploy.sh').read_text()
function = source[source.index('wait_proxy() {'):source.index('\ncleanup() {')]
with tempfile.TemporaryDirectory(prefix='moya-real-nginx-') as directory:
    root = Path(directory)
    probe = socket.socket(); probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]; probe.close()
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
                    '-keyout', str(root/'key.pem'), '-out', str(root/'cert.pem')], check=True, capture_output=True)
    config = root/'nginx.conf'
    upstream = root/'upstream.conf'
    config.write_text(f'''pid {root}/nginx.pid;
error_log {root}/error.log;
events {{}}
http {{
 access_log off;
 server {{ listen 127.0.0.1:{port} ssl; server_name localhost;
 ssl_certificate {root}/cert.pem; ssl_certificate_key {root}/key.pem;
 location / {{ include {upstream}; }}
 }}
}}
''')
    binaries = root/'bin'; binaries.mkdir()
    docker = binaries/'docker'
    docker.write_text('#!/bin/sh\nprintf \'%s\\n\' \'Authorization: '+authorization+"'\n")
    docker.chmod(0o755)
    runner = root/'check.sh'
    adjusted = function.replace(':443:127.0.0.1', f':{port}:127.0.0.1').replace('https://$origin/', f'https://$origin:{port}/')
    runner.write_text(f'set -Eeuo pipefail\nROOT={root}\norigin=localhost\n'+adjusted+'\nwait_proxy test '+('b'*40)+'\n')
    command = ['nginx', '-p', str(root), '-c', str(config)]
    upstream.write_text(f'proxy_pass http://127.0.0.1:{old.server_port};\n')
    subprocess.run(command, check=True)
    child = None
    try:
        for label, initial_port in [('old release still returns 401', old.server_port), ('first deployment returns 502', 1)]:
            upstream.write_text(f'proxy_pass http://127.0.0.1:{initial_port};\n')
            subprocess.run(command + ['-s', 'reload'], check=True)
            time.sleep(0.4)
            child = subprocess.Popen(['bash', str(runner)], env={**os.environ,
                'PATH': str(binaries)+os.pathsep+os.environ['PATH'], 'CURL_CA_BUNDLE': str(root/'cert.pem')},
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            time.sleep(0.6)
            assert child.poll() is None, 'Probe accepted an old or unavailable release'
            upstream.write_text(f'proxy_pass http://127.0.0.1:{new.server_port};\n')
            subprocess.run(command + ['-s', 'reload'], check=True)
            out, err = child.communicate(timeout=15)
            assert child.returncode == 0, out+err
            print('PASS real Nginx/TLS:', label)
    finally:
        if child is not None and child.poll() is None:
            child.kill(); child.wait()
        subprocess.run(command + ['-s', 'quit'], check=True)
        old.shutdown(); new.shutdown()
