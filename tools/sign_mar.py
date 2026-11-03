"""Sign and verify Kyber Fox update archives (MAR files) with mardor.

Signing runs only in the release publish job; the private key never lives in
this repository (see docs/update-signing.md). Keys are RSA-4096 and signatures
use SHA-384, which is what the updater verifies against the committed
release_primary.der / release_secondary.der certificates.

    python -m tools.sign_mar sign   --key key.pem --in a.mar --out signed.mar
    python -m tools.sign_mar verify --cert release_primary.der signed.mar
    python -m tools.sign_mar info   signed.mar     # sha512, size, product info
"""
import argparse
import sys
import tempfile
from pathlib import Path

from tools.update_manifest import file_sha512_and_size

HASH = "sha384"


class SignError(Exception):
    pass


def _import_mardor():
    try:
        import mardor.reader
        import mardor.signing
        import mardor.writer
    except ImportError as e:  # pragma: no cover
        raise SignError("mardor is not installed: pip install -r requirements-release.txt") from e
    return mardor


def public_pem(path: Path) -> bytes:
    """Public key (PEM) from a certificate (DER or PEM), a public key or a private key."""
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization

    data = Path(path).read_bytes()
    for loader in (x509.load_der_x509_certificate, x509.load_pem_x509_certificate):
        try:
            key = loader(data).public_key()
            break
        except ValueError:
            continue
    else:
        return data  # already a PEM public or private key; mardor accepts both
    return key.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )


def sign_mar(src: Path, dst: Path, key_pem: bytes) -> None:
    """Write a copy of src to dst carrying one SHA-384 signature; product info is kept."""
    _import_mardor()
    from mardor.reader import MarReader
    from mardor.signing import get_keysize, sign_hash
    from mardor.writer import add_signature_block

    if get_keysize(key_pem) != 4096:
        raise SignError("the MAR signing key must be RSA-4096")
    with tempfile.TemporaryFile() as dummy:
        # A dummy signature fixes the layout; the real signature covers that layout.
        with open(src, "rb") as f:
            add_signature_block(f, dummy, HASH)
        dummy.seek(0)
        with MarReader(dummy) as m:
            digest = m.calculate_hashes()[0][1]
    signature = sign_hash(key_pem, digest, HASH)
    with open(src, "rb") as f, open(dst, "w+b") as out:
        add_signature_block(f, out, HASH, signature)


def verify_mar(path: Path, public_key_pem: bytes) -> bool:
    _import_mardor()
    from mardor.reader import MarReader

    with open(path, "rb") as f, MarReader(f) as m:
        if m.get_errors():
            raise SignError(f"{path} is not a well formed MAR: {m.get_errors()}")
        return m.verify(public_key_pem)


def product_info(path: Path):
    _import_mardor()
    from mardor.reader import MarReader

    with open(path, "rb") as f, MarReader(f) as m:
        return m.productinfo


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sign", help="sign a MAR")
    s.add_argument("--key", required=True, type=Path, help="private key (PEM)")
    s.add_argument("--in", dest="src", required=True, type=Path)
    s.add_argument("--out", dest="dst", required=True, type=Path)
    s.add_argument("--cert", type=Path, help="also verify the result against this certificate")
    v = sub.add_parser("verify", help="check a MAR signature")
    v.add_argument("--cert", required=True, type=Path, help="release_primary.der or a PEM key")
    v.add_argument("mar", type=Path)
    i = sub.add_parser("info", help="print sha512, size and product info")
    i.add_argument("mar", type=Path)
    args = p.parse_args(argv)

    try:
        if args.cmd == "sign":
            sign_mar(args.src, args.dst, args.key.read_bytes())
            if args.cert and not verify_mar(args.dst, public_pem(args.cert)):
                raise SignError(f"{args.dst} does not verify against {args.cert}")
            print(f"signed {args.dst}")
            args.mar = args.dst
        elif args.cmd == "verify":
            if not verify_mar(args.mar, public_pem(args.cert)):
                print(f"signature of {args.mar} does NOT verify", file=sys.stderr)
                return 1
            print(f"signature of {args.mar} verifies")
        if args.cmd in ("sign", "info"):
            sha512, size = file_sha512_and_size(args.mar)
            print(f"sha512 {sha512}")
            print(f"size {size}")
            print(f"productinfo {product_info(args.mar)}")
    except SignError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
