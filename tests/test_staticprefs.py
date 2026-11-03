from tools.staticprefs import move_section_into_order, reorder_sections

RULE = "#" + "-" * 75 + "\n"


def section(prefix: str, body: str = "") -> str:
    return f'{RULE}# Prefs starting with "{prefix}."\n{RULE}\n- name: {prefix}.x\n  type: bool\n{body}\n'


HEAD = "# preamble\n\n"


def test_out_of_order_section_moves_before_next_prefix():
    text = HEAD + section("apz") + section("layout") + section("kyberfox") + section("logging")
    expected = HEAD + section("apz") + section("kyberfox") + section("layout") + section("logging")
    assert reorder_sections(text) == expected


def test_ordered_file_unchanged():
    text = HEAD + section("apz") + section("layout") + section("logging")
    assert reorder_sections(text) == text


def test_other_text_byte_identical():
    odd = "  value: true # trailing  \r\n\t\n"
    text = HEAD + section("layout", odd) + section("kyberfox")
    out = reorder_sections(text)
    assert out == HEAD + section("kyberfox") + section("layout", odd)
    assert sorted(out.splitlines(True)) == sorted(text.splitlines(True))


def test_move_section_into_order_reports_change(tmp_path):
    path = tmp_path / "StaticPrefList.yaml"
    path.write_text(HEAD + section("layout") + section("kyberfox"))
    assert move_section_into_order(path) is True
    assert move_section_into_order(path) is False
