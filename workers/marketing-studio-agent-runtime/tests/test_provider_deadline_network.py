import threading
import time
import unittest
import ssl
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from yux_agent_runtime.providers import (
    ProviderDeadlineExceededError,
    ProviderRequestError,
    _default_transport,
    provider_request_budget,
)


class ProviderDeadlineNetworkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = TemporaryDirectory()
        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
        now = datetime.now(timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=1))
                .not_valid_after(now + timedelta(days=1))
                .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ip_address('127.0.0.1'))]), critical=False)
                .sign(key, hashes.SHA256()))
        cls.cert_path, cls.key_path = Path(cls.directory.name) / 'cert.pem', Path(cls.directory.name) / 'key.pem'
        cls.cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        cls.key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                 serialization.NoEncryption()))

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def assert_trickling_request_stops(self, phase, tls=False):
        disconnected = threading.Event()

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                try:
                    if phase == 'headers':
                        for byte in b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}':
                            self.connection.sendall(bytes([byte]))
                            time.sleep(0.04)
                    else:
                        self.send_response(200)
                        self.send_header('Content-Length', '11')
                        self.end_headers()
                        for byte in b'{"ok":true}':
                            self.wfile.write(bytes([byte]))
                            self.wfile.flush()
                            time.sleep(0.04)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    disconnected.set()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.daemon_threads = True
        if tls:
            server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            server_context.load_cert_chain(self.cert_path, self.key_path)
            server.socket = server_context.wrap_socket(server.socket, server_side=True)
            client_context = ssl.create_default_context(cafile=str(self.cert_path))
            self.assertTrue(client_context.check_hostname)
            self.assertEqual(client_context.verify_mode, ssl.CERT_REQUIRED)
        thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
        thread.start()
        started = time.monotonic()
        try:
            tls_context = patch('http.client._create_https_context', return_value=client_context) if tls else nullcontext()
            with tls_context, provider_request_budget(0.15):
                with self.assertRaises(ProviderDeadlineExceededError):
                    _default_transport(f'{"https" if tls else "http"}://127.0.0.1:{server.server_port}/', {}, {}, 'POST')
            self.assertLess(time.monotonic() - started, 0.35)
            self.assertTrue(disconnected.wait(0.3), 'deadline must close the active connection')
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=1)

    def test_deadline_interrupts_a_trickling_body(self):
        self.assert_trickling_request_stops('body')

    def test_deadline_interrupts_trickling_response_headers(self):
        self.assert_trickling_request_stops('headers')

    def test_deadline_interrupts_trickling_https_body_with_certificate_verification(self):
        self.assert_trickling_request_stops('body', tls=True)

    def test_scoped_https_completes_normally_and_still_rejects_an_untrusted_certificate(self):
        received = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                received.append(True)
                self.send_response(200)
                self.send_header('Content-Length', '11')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.daemon_threads = True
        server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server_context.load_cert_chain(self.cert_path, self.key_path)
        server.socket = server_context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
        thread.start()
        try:
            trusted = ssl.create_default_context(cafile=str(self.cert_path))
            with patch('http.client._create_https_context', return_value=trusted), provider_request_budget(2):
                self.assertEqual(_default_transport(f'https://127.0.0.1:{server.server_port}/', {}, {}, 'POST'), {'ok': True})
            with provider_request_budget(2), self.assertRaisesRegex(ProviderRequestError, 'provider_transport_unavailable'):
                _default_transport(f'https://127.0.0.1:{server.server_port}/', {}, {}, 'POST')
            self.assertEqual(received, [True])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=1)
