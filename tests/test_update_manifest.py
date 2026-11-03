import hashlib
import xml.etree.ElementTree as ET

from tools.update_manifest import main, render_empty, render_update_xml

URL = "https://github.com/Commanderx-code/KyberFox/releases/download/v159.0.1-1/kyberfox-159.0.1-1.complete.mar"


def test_update_xml_has_complete_patch():
    root = ET.fromstring(render_update_xml("159.0.1", "20261110000000", URL, "ab" * 64, 123))
    update = root.find("update")
    assert update.get("appVersion") == "159.0.1"
    assert update.get("buildID") == "20261110000000"
    patch = update.find("patch")
    assert (patch.get("type"), patch.get("hashFunction")) == ("complete", "sha512")
    assert patch.get("URL") == URL and patch.get("size") == "123"
    assert patch.get("hashValue") == "ab" * 64


def test_display_version_and_escaping():
    url = URL + "?a=1&b=2"
    xml = render_update_xml("159.0", "1", url, "00", 1, display_version="159.0-1")
    update = ET.fromstring(xml).find("update")
    assert update.get("displayVersion") == "159.0-1"
    assert update.get("appVersion") == "159.0"
    assert update.find("patch").get("URL") == url


def test_empty_manifest():
    root = ET.fromstring(render_empty())
    assert root.tag == "updates" and len(root) == 0


def test_cli_writes_file_with_hash_and_size(tmp_path):
    mar = tmp_path / "kyberfox.complete.mar"
    mar.write_bytes(b"MAR1" + bytes(range(256)) * 10)
    out = tmp_path / "update" / "release" / "WINNT_x86_64-msvc" / "update.xml"
    code = main([
        "--version", "159.0.1", "--display-version", "159.0.1-1",
        "--build-id", "20261110000000", "--mar", str(mar), "--url", URL, "--out", str(out),
    ])
    assert code == 0
    update = ET.fromstring(out.read_text()).find("update")
    patch = update.find("patch")
    assert patch.get("hashValue") == hashlib.sha512(mar.read_bytes()).hexdigest()
    assert patch.get("size") == str(mar.stat().st_size)
    assert update.get("displayVersion") == "159.0.1-1"


def test_cli_empty(tmp_path):
    out = tmp_path / "update.xml"
    assert main(["--empty", "--out", str(out)]) == 0
    assert ET.fromstring(out.read_text()).tag == "updates"
