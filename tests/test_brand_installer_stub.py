import struct

import pytest

from tools import brand_installer_stub as B

FILE_ALIGN = 0x200
SECTION_ALIGN = 0x1000
RSRC_VA = 0x1000


def _dir(entries):
    return struct.pack("<IIHHHH", 0, 0, 0, 0, 0, len(entries)) + b"".join(
        struct.pack("<II", name, target) for name, target in entries)


def make_rsrc(icons, group):
    """A .rsrc section: RT_ICON ids 1..n with `icons`, RT_GROUP_ICON id 1."""
    n = len(icons)
    # Layout: root, type dirs, name dirs, data entries, then the data.
    root = 16 + 8 * 2
    type_dir = [16 + 8 * n, 16 + 8]
    name_dir = 16 + 8
    off_types = root
    off_icon_names = off_types + type_dir[0] + type_dir[1]
    off_group_name = off_icon_names + n * name_dir
    off_entries = off_group_name + name_dir
    off_data = off_entries + 16 * (n + 1)
    blobs = icons + [group]
    data_offsets = []
    pos = off_data
    for blob in blobs:
        data_offsets.append(pos)
        pos += (len(blob) + 7) // 8 * 8
    out = bytearray()
    out += _dir([(B.RT_ICON, 0x80000000 | off_types),
                 (B.RT_GROUP_ICON, 0x80000000 | (off_types + type_dir[0]))])
    out += _dir([(i + 1, 0x80000000 | (off_icon_names + i * name_dir)) for i in range(n)])
    out += _dir([(1, 0x80000000 | off_group_name)])
    for i in range(n):
        out += _dir([(1033, off_entries + 16 * i)])
    out += _dir([(1033, off_entries + 16 * n)])
    for blob, offset in zip(blobs, data_offsets):
        out += struct.pack("<IIII", RSRC_VA + offset, len(blob), 0, 0)
    for blob, offset in zip(blobs, data_offsets):
        out += b"\0" * (offset - len(out)) + blob
    return bytes(out)


def make_pe(rsrc, trailing=b""):
    """A minimal PE32 file whose only section is .rsrc."""
    headers = bytearray(FILE_ALIGN)
    headers[:2] = b"MZ"
    struct.pack_into("<I", headers, 0x3C, 0x40)
    pe = 0x40
    headers[pe:pe + 4] = b"PE\0\0"
    optional_size = 224
    struct.pack_into("<HHIIIHH", headers, pe + 4, 0x14C, 1, 0, 0, 0, optional_size, 0x102)
    opt = pe + 24
    struct.pack_into("<H", headers, opt, 0x10B)
    struct.pack_into("<II", headers, opt + 32, SECTION_ALIGN, FILE_ALIGN)
    struct.pack_into("<I", headers, opt + 56, RSRC_VA + (len(rsrc) + SECTION_ALIGN - 1) // SECTION_ALIGN * SECTION_ALIGN)
    struct.pack_into("<I", headers, opt + 92, 16)
    struct.pack_into("<II", headers, opt + 96 + 8 * 2, RSRC_VA, len(rsrc))
    raw = (len(rsrc) + FILE_ALIGN - 1) // FILE_ALIGN * FILE_ALIGN
    section = opt + optional_size
    headers[section:section + 8] = b".rsrc\0\0\0"
    struct.pack_into("<IIII", headers, section + 8, len(rsrc), RSRC_VA, raw, FILE_ALIGN)
    return bytes(headers) + rsrc + b"\0" * (raw - len(rsrc)) + trailing


def make_ico(images):
    """An .ico file from [(size, image bytes)]."""
    out = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    offset = 6 + 16 * len(images)
    for size, blob in images:
        out += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    for _, blob in images:
        out += blob
    return bytes(out)


OLD_GROUP = struct.pack("<HHH", 0, 1, 2) + b"\0" * 28
STUB = make_pe(make_rsrc([b"old-16" * 10, b"old-32" * 10], OLD_GROUP))


def group_of(stub):
    pe = B._Pe(stub)
    rva, _, _, va, _, raw_ptr = pe.rsrc()
    entry = B._leaves(stub, raw_ptr + rva - va, B.RT_GROUP_ICON)[1]
    data_rva, size = struct.unpack_from("<II", stub, entry)
    start = raw_ptr + data_rva - va
    blob = stub[start:start + size]
    _, kind, count = struct.unpack_from("<HHH", blob, 0)
    return kind, [struct.unpack_from("<BBBBHHIH", blob, 6 + 14 * i) for i in range(count)]


def test_icons_are_replaced_and_the_group_points_at_them():
    big = b"\x89PNG" + b"k" * 3000  # larger than the old slot, so the section grows
    ico = make_ico([(16, b"new-16" * 20), (256, big)])
    out = B.brand(STUB, ico)
    assert B.read_icon_images(out) == {1: b"new-16" * 20, 2: big}
    kind, entries = group_of(out)
    assert kind == 1
    assert [(e[0], e[6], e[7]) for e in entries] == [(16, 120, 1), (0, len(big), 2)]


def test_headers_follow_the_grown_section():
    out = B.brand(STUB, make_ico([(16, b"a" * 64), (32, b"b" * 5000)]))
    pe = B._Pe(out)
    rva, _, vsize, va, raw_size, raw_ptr = pe.rsrc()
    assert raw_ptr + raw_size == len(out)
    assert raw_size % FILE_ALIGN == 0 and raw_size >= vsize
    assert struct.unpack_from("<I", out, pe.opt + 56)[0] == B._align(va + vsize, SECTION_ALIGN)
    assert struct.unpack_from("<II", out, pe.data_dirs + 16) == (rva, vsize)


def test_fewer_images_leave_the_extra_slot_out_of_the_group():
    out = B.brand(STUB, make_ico([(48, b"only" * 30)]))
    _, entries = group_of(out)
    assert [(e[0], e[7]) for e in entries] == [(48, 1)]


def test_refuses_more_images_than_slots():
    with pytest.raises(ValueError, match="2 icon slots"):
        B.brand(STUB, make_ico([(16, b"1"), (32, b"2"), (48, b"3")]))


def test_refuses_a_stub_with_data_after_the_resources():
    stub = make_pe(make_rsrc([b"x" * 8], OLD_GROUP), trailing=b"7z archive")
    with pytest.raises(ValueError, match="data follows"):
        B.brand(stub, make_ico([(16, b"y")]))


def test_refuses_files_that_are_not_icons():
    with pytest.raises(ValueError, match="not an icon file"):
        B.brand(STUB, b"PK\x03\x04 not an icon")


def _tree_with_stub(tmp_path):
    from tools.assemble import INSTALLER_ICON, INSTALLER_STUB
    (tmp_path / INSTALLER_STUB).parent.mkdir(parents=True)
    (tmp_path / INSTALLER_STUB).write_bytes(STUB)
    (tmp_path / INSTALLER_ICON).parent.mkdir(parents=True)
    (tmp_path / INSTALLER_ICON).write_bytes(make_ico([(16, b"kyber" * 9)]))
    return tmp_path / INSTALLER_STUB


def test_assembly_puts_the_kyber_icon_on_the_installer(tmp_path):
    from tools.assemble import brand_installer
    stub = _tree_with_stub(tmp_path)
    brand_installer(tmp_path)
    assert B.read_icon_images(stub.read_bytes())[1] == b"kyber" * 9


def test_assembly_without_the_stub_leaves_the_tree_alone(tmp_path):
    from tools.assemble import brand_installer
    brand_installer(tmp_path)
    assert list(tmp_path.iterdir()) == []
