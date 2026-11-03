from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization

UPDATER_DIR = Path(__file__).resolve().parent.parent / "overlay/toolkit/mozapps/update/updater"


def test_committed_update_certificates_are_distinct_rsa4096_sha384():
    certs = [x509.load_der_x509_certificate((UPDATER_DIR / f"release_{n}.der").read_bytes())
             for n in ("primary", "secondary")]
    der = [c.public_bytes(serialization.Encoding.DER) for c in certs]
    assert der[0] != der[1]
    for cert in certs:
        assert cert.public_key().key_size == 4096
        assert isinstance(cert.signature_hash_algorithm, hashes.SHA384)


def test_mar_channel_id_is_the_same_in_mozconfig_and_workflow():
    root = UPDATER_DIR.parents[4]
    mozconfig = (root / "mozconfigs/windows-cross").read_text()
    workflow = (root / ".github/workflows/build-windows.yml").read_text()
    ids = {line.split("=", 1)[1] for line in mozconfig.splitlines()
           if line.startswith(("export MAR_CHANNEL_ID=", "export ACCEPTED_MAR_CHANNEL_IDS="))}
    assert len(ids) == 1
    (channel,) = ids
    assert f'"$RUNNER_TEMP/mar/kyberfox-$version.complete.mar" {channel}' in workflow
