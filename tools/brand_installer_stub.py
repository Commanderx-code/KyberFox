"""Put the Kyber Fox icon on the Windows installer.

The downloaded installer is Firefox's 7-Zip self-extracting stub
(other-licenses/7zstub/firefox/7zSD.Win32.sfx) with the NSIS setup appended,
so Explorer shows the stub's own icon: Firefox's setup icon. This replaces
the stub's icon images and its icon group with the images of an .ico file.

The new images are appended to the stub's .rsrc section, which must be the
last section and end at the end of the file (true for the Firefox stubs).
Run it on the stub in the source tree before `mach package`:

    python -m tools.brand_installer_stub STUB.sfx ICON.ico
"""
import argparse
import struct
import sys
from pathlib import Path

RT_ICON = 3
RT_GROUP_ICON = 14
RESOURCE_DIRECTORY = 2


def _align(value, alignment):
    return (value + alignment - 1) // alignment * alignment


def read_ico(data):
    """[(width, height, colors, planes, bit_count, image_bytes)] of an .ico file."""
    reserved, kind, count = struct.unpack_from("<HHH", data, 0)
    if reserved != 0 or kind != 1 or count == 0:
        raise ValueError("not an icon file")
    images = []
    for i in range(count):
        w, h, colors, _, planes, bits, size, offset = struct.unpack_from("<BBBBHHII", data, 6 + 16 * i)
        if offset + size > len(data):
            raise ValueError("icon image runs past the end of the file")
        images.append((w, h, colors, planes, bits, data[offset:offset + size]))
    return images


class _Pe:
    def __init__(self, data):
        self.data = data
        if data[:2] != b"MZ":
            raise ValueError("not a PE file")
        self.pe = struct.unpack_from("<I", data, 0x3C)[0]
        if data[self.pe:self.pe + 4] != b"PE\0\0":
            raise ValueError("not a PE file")
        self.sections_count = struct.unpack_from("<H", data, self.pe + 6)[0]
        optional_size = struct.unpack_from("<H", data, self.pe + 20)[0]
        self.opt = self.pe + 24
        magic = struct.unpack_from("<H", data, self.opt)[0]
        if magic not in (0x10B, 0x20B):
            raise ValueError("unknown optional header")
        self.data_dirs = self.opt + (96 if magic == 0x10B else 112)
        self.section_table = self.opt + optional_size
        self.section_alignment, self.file_alignment = struct.unpack_from("<II", data, self.opt + 32)

    def section(self, index):
        o = self.section_table + 40 * index
        vsize, va, raw_size, raw_ptr = struct.unpack_from("<IIII", self.data, o + 8)
        return o, vsize, va, raw_size, raw_ptr

    def rsrc(self):
        rva, size = struct.unpack_from("<II", self.data, self.data_dirs + 8 * RESOURCE_DIRECTORY)
        last = self.sections_count - 1
        o, vsize, va, raw_size, raw_ptr = self.section(last)
        if not va <= rva < va + max(vsize, raw_size):
            raise ValueError("the resources are not in the last section")
        if raw_ptr + raw_size != len(self.data):
            raise ValueError("data follows the last section; refusing to move it")
        return rva, o, vsize, va, raw_size, raw_ptr


def _entries(data, base, offset):
    named, ids = struct.unpack_from("<HH", data, base + offset + 12)
    for i in range(named + ids):
        name, target = struct.unpack_from("<II", data, base + offset + 16 + 8 * i)
        yield name, target


def _leaves(data, base, type_id):
    """{resource id: offset of its IMAGE_RESOURCE_DATA_ENTRY} for one type."""
    found = {}
    for tid, t in _entries(data, base, 0):
        if tid != type_id or not t & 0x80000000:
            continue
        for rid, r in _entries(data, base, t & 0x7FFFFFFF):
            if rid & 0x80000000 or not r & 0x80000000:
                continue
            for _, leaf in _entries(data, base, r & 0x7FFFFFFF):
                if not leaf & 0x80000000:
                    found.setdefault(rid, base + leaf)
    return found


def icon_resources(stub):
    """(icon ids, group ids) in the stub, for checks."""
    pe = _Pe(stub)
    rva, _, _, va, _, raw_ptr = pe.rsrc()
    base = raw_ptr + rva - va
    return sorted(_leaves(stub, base, RT_ICON)), sorted(_leaves(stub, base, RT_GROUP_ICON))


def read_icon_images(stub):
    """{icon id: image bytes} of the stub's RT_ICON resources."""
    pe = _Pe(stub)
    rva, _, _, va, _, raw_ptr = pe.rsrc()
    base = raw_ptr + rva - va
    images = {}
    for rid, entry in _leaves(stub, base, RT_ICON).items():
        data_rva, size = struct.unpack_from("<II", stub, entry)
        start = raw_ptr + data_rva - va
        images[rid] = stub[start:start + size]
    return images


def brand(stub, ico):
    """The stub with its icons replaced by the images of `ico`."""
    images = read_ico(ico)
    pe = _Pe(stub)
    rva, section, vsize, va, raw_size, raw_ptr = pe.rsrc()
    base = raw_ptr + rva - va
    icons = _leaves(stub, base, RT_ICON)
    groups = _leaves(stub, base, RT_GROUP_ICON)
    if not groups:
        raise ValueError("the stub has no icon group")
    if len(icons) < len(images):
        raise ValueError(f"the stub has {len(icons)} icon slots, the icon file has {len(images)} images")

    out = bytearray(stub[:raw_ptr + vsize])
    ids = sorted(icons)[:len(images)]

    def append(blob):
        start = _align(len(out), 8)
        out.extend(b"\0" * (start - len(out)))
        out.extend(blob)
        return va + start - raw_ptr

    group = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    for rid, (w, h, colors, planes, bits, blob) in zip(ids, images):
        struct.pack_into("<II", out, icons[rid], append(blob), len(blob))
        group += struct.pack("<BBBBHHIH", w, h, colors, 0, planes, bits, len(blob), rid)
    # Unused slots keep their old images; the group no longer points at them.
    for gid in groups:
        struct.pack_into("<II", out, groups[gid], append(bytes(group)), len(group))

    new_vsize = len(out) - raw_ptr
    new_raw = _align(new_vsize, pe.file_alignment)
    out.extend(b"\0" * (raw_ptr + new_raw - len(out)))
    struct.pack_into("<II", out, section + 8, new_vsize, va)
    struct.pack_into("<I", out, section + 16, new_raw)
    struct.pack_into("<I", out, pe.opt + 56, _align(va + new_vsize, pe.section_alignment))  # SizeOfImage
    struct.pack_into("<I", out, pe.data_dirs + 8 * RESOURCE_DIRECTORY + 4, new_vsize - (rva - va))
    struct.pack_into("<I", out, pe.opt + 64, 0)  # CheckSum; not checked for programs
    return bytes(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("stub", type=Path, help="7zSD stub, changed in place")
    parser.add_argument("icon", type=Path, help=".ico file with the new images")
    args = parser.parse_args(argv)
    args.stub.write_bytes(brand(args.stub.read_bytes(), args.icon.read_bytes()))
    print(f"{args.stub}: icon replaced with {args.icon}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
