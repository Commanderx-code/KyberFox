import pytest

from tools.patchset import UnclassifiedPatch, classify, rebrand


def test_new_upstream_patch_must_be_classified():
    with pytest.raises(UnclassifiedPatch, match="patches/new.patch"):
        classify(["patches/a.patch", "patches/new.patch"], {"patches/a.patch"}, set())


def test_drop_list_removes_patch():
    assert classify(["a", "b"], {"a"}, {"b"}) == ["a"]


def test_classify_names_every_new_patch():
    with pytest.raises(UnclassifiedPatch) as err:
        classify(["x", "y"], set(), set())
    assert "x" in str(err.value) and "y" in str(err.value)


def test_rebrand_replaces_all_forms():
    assert rebrand("LibreWolf librewolf LIBREWOLF") == "Kyber Fox kyberfox KYBERFOX"


def test_rebrand_keeps_upstream_urls():
    assert rebrand("codeberg.org/librewolf/source") == "codeberg.org/librewolf/source"


def test_rebrand_keeps_full_urls_but_not_surrounding_text():
    text = "see https://librewolf.net/docs for LibreWolf"
    assert rebrand(text) == "see https://librewolf.net/docs for Kyber Fox"
