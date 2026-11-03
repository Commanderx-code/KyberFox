import threading
import urllib.error
import urllib.request

import pytest

from tools.serve_update import make_server


def test_any_update_xml_path_serves_the_manifest(tmp_path):
    (tmp_path / "update.xml").write_text("<updates/>")
    (tmp_path / "a.mar").write_bytes(b"MAR1")
    server = make_server(tmp_path, 0)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        base = f"http://127.0.0.1:{port}"
        for path in ("/update.xml", "/release/WINNT_x86_64-msvc/update.xml"):
            assert urllib.request.urlopen(base + path).read() == b"<updates/>"
        assert urllib.request.urlopen(base + "/a.mar").read() == b"MAR1"
        with pytest.raises(urllib.error.HTTPError):
            urllib.request.urlopen(base + "/missing.mar")
    finally:
        server.shutdown()
        server.server_close()
