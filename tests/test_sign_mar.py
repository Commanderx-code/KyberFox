import datetime

import pytest

pytest.importorskip("mardor")
from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402
from mardor.reader import MarReader  # noqa: E402
from mardor.writer import MarWriter  # noqa: E402

from tools.sign_mar import main, product_info, public_pem, sign_mar, verify_mar  # noqa: E402


def _keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "throwaway")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(1)
        .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=1))
        .sign(key, hashes.SHA384())
    )
    return pem, cert.public_bytes(serialization.Encoding.DER)


@pytest.fixture(scope="module")
def keys():
    return _keypair(), _keypair()


@pytest.fixture
def unsigned_mar(tmp_path):
    payload = tmp_path / "payload.txt"
    payload.write_text("hello update\n")
    mar = tmp_path / "unsigned.mar"
    with open(mar, "w+b") as f, MarWriter(f, productversion="159.0", channel="kyberfox-release") as w:
        w.add(str(payload))
    return mar


def test_sign_then_verify_with_matching_certificate(tmp_path, keys, unsigned_mar):
    (key_pem, cert_der), _ = keys
    cert = tmp_path / "release.der"
    cert.write_bytes(cert_der)
    out = tmp_path / "signed.mar"
    sign_mar(unsigned_mar, out, key_pem)
    assert verify_mar(out, public_pem(cert))
    assert product_info(out) == ("159.0", "kyberfox-release")
    with open(out, "rb") as f, MarReader(f) as m:
        assert m.signature_type == "sha384"
        assert not m.get_errors()


def test_wrong_key_and_unsigned_do_not_verify(tmp_path, keys, unsigned_mar):
    (key_pem, _), (_, other_cert_der) = keys
    other = tmp_path / "other.der"
    other.write_bytes(other_cert_der)
    out = tmp_path / "signed.mar"
    sign_mar(unsigned_mar, out, key_pem)
    assert not verify_mar(out, public_pem(other))
    assert not verify_mar(unsigned_mar, public_pem(other))


def test_cli_sign_and_verify(tmp_path, keys, unsigned_mar, capsys):
    (key_pem, cert_der), (_, other_der) = keys
    key = tmp_path / "k.pem"
    key.write_bytes(key_pem)
    cert = tmp_path / "good.der"
    cert.write_bytes(cert_der)
    other = tmp_path / "bad.der"
    other.write_bytes(other_der)
    out = tmp_path / "signed.mar"
    assert main(["sign", "--key", str(key), "--cert", str(cert),
                 "--in", str(unsigned_mar), "--out", str(out)]) == 0
    printed = capsys.readouterr().out
    assert "sha512 " in printed and f"size {out.stat().st_size}" in printed
    assert main(["verify", "--cert", str(cert), str(out)]) == 0
    assert main(["verify", "--cert", str(other), str(out)]) == 1


def test_rejects_small_keys(tmp_path, unsigned_mar):
    from tools.sign_mar import SignError

    small = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = small.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    with pytest.raises(SignError):
        sign_mar(unsigned_mar, tmp_path / "x.mar", pem)



def test_cli_missing_key_is_an_error_not_a_traceback(tmp_path, unsigned_mar, capsys):
    out = tmp_path / "signed.mar"
    assert main(["sign", "--key", str(tmp_path / "nope.pem"), "--in", str(unsigned_mar),
                 "--out", str(out)]) == 1
    assert "error:" in capsys.readouterr().err
    assert not out.exists()


def test_failed_verification_leaves_no_output(tmp_path, keys, unsigned_mar):
    (key_pem, _), (_, other_der) = keys
    key = tmp_path / "k.pem"
    key.write_bytes(key_pem)
    other = tmp_path / "other.der"
    other.write_bytes(other_der)
    out = tmp_path / "signed.mar"
    assert main(["sign", "--key", str(key), "--cert", str(other),
                 "--in", str(unsigned_mar), "--out", str(out)]) == 1
    assert not out.exists() and not out.with_suffix(".tmp").exists()
