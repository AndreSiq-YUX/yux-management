"""Cancel a scoped HTTP operation at an elapsed-time deadline."""

from contextvars import ContextVar, copy_context
from http.client import HTTPConnection, HTTPSConnection
import socket
from threading import Event, Lock, Thread
from urllib.request import HTTPHandler, HTTPSHandler, build_opener, urlopen as standard_urlopen


class HttpDeadlineExceeded(TimeoutError):
    pass


class _NetworkScope:
    def __init__(self):
        self.cancelled = Event()
        self.lock = Lock()
        self.connections = []
        self.sockets = []

    def check(self):
        if self.cancelled.is_set():
            raise HttpDeadlineExceeded("provider_request_deadline_exceeded")

    def add_connection(self, connection):
        with self.lock:
            self.check()
            self.connections.append(connection)

    def add_socket(self, connection_socket):
        with self.lock:
            cancelled = self.cancelled.is_set()
            if not cancelled:
                self.sockets.append(connection_socket)
        if cancelled:
            self._close_socket(connection_socket)
            self.check()

    @staticmethod
    def _close_socket(connection_socket):
        if connection_socket is not None:
            try:
                connection_socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                connection_socket.close()
            except OSError:
                pass

    def abort(self):
        with self.lock:
            self.cancelled.set()
            sockets = [*self.sockets, *(connection.sock for connection in self.connections)]
        # Shutdown the socket directly: BufferedReader.close() can wait on the
        # reader's lock while another thread is blocked in response.read().
        for connection_socket in sockets:
            self._close_socket(connection_socket)


_network_scope: ContextVar[_NetworkScope | None] = ContextVar("provider_network_scope", default=None)


def open_url(request, *, timeout):
    scope = _network_scope.get()
    if scope is None:
        return standard_urlopen(request, timeout=timeout)

    class ConnectionScope:
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            scope.add_connection(self)

        def connect(self):
            scope.check()
            super().connect()
            scope.add_socket(self.sock)

    class PlainConnection(ConnectionScope, HTTPConnection):
        pass

    class SecureConnection(ConnectionScope, HTTPSConnection):
        def connect(self):
            scope.check()
            HTTPConnection.connect(self)
            scope.add_socket(self.sock)
            server_hostname = self._tunnel_host or self.host
            # Keep certificate verification and hostname checking from the
            # normal HTTPSConnection context. Register TLS before handshaking
            # so deadline cancellation also interrupts a slow handshake.
            self.sock = self._context.wrap_socket(self.sock, server_hostname=server_hostname,
                                                  do_handshake_on_connect=False)
            scope.add_socket(self.sock)
            self.sock.do_handshake()
            scope.check()

    class PlainHandler(HTTPHandler):
        def http_open(self, req):
            return self.do_open(PlainConnection, req)

    class SecureHandler(HTTPSHandler):
        def https_open(self, req):
            return self.do_open(SecureConnection, req, context=self._context)

    return build_opener(PlainHandler(), SecureHandler()).open(request, timeout=timeout)


def run_with_deadline(operation, timeout):
    scope, done, result = _NetworkScope(), Event(), {}
    context = copy_context()

    def run():
        token = _network_scope.set(scope)
        try:
            result['value'] = operation()
        except BaseException as error:
            result['error'] = error
        finally:
            _network_scope.reset(token)
            done.set()

    # A DNS lookup itself cannot be cancelled by urllib. The daemon may finish
    # resolving later; scope.check/add_socket then closes it before HTTP data
    # can be sent. The caller's deadline never waits for that resolution.
    Thread(target=lambda: context.run(run), daemon=True).start()
    try:
        if not done.wait(timeout):
            raise HttpDeadlineExceeded("provider_request_deadline_exceeded")
        if 'error' in result:
            raise result['error']
        return result['value']
    finally:
        scope.abort()
