import pytest

from tools.assemble import apply_librewolf_l10n


def _write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")




def _setup(tmp_path):
    tree, lw = tmp_path / "tree", tmp_path / "lw"
    return tree, lw, lw / "l10n"


def test_librewolf_l10n_is_applied(tmp_path):
    tree, lw, l10n = _setup(tmp_path)
    _write(tree / "browser/locales/en-US/browser/browser.ftl", "existing = One\n")
    _write(l10n / "en-US/browser/browser/browser.inc.ftl", "added = LibreWolf string\n")
    _write(l10n / "en-US/browser/chrome/browser/extra.properties", "whole=LibreWolf\n")
    _write(l10n / "en-US/browser/browser/README.md", "ignored\n")
    _write(l10n / "de/browser/browser/browser.inc.ftl", "german = Nein\n")

    written = apply_librewolf_l10n(tree, lw)

    ftl = (tree / "browser/locales/en-US/browser/browser.ftl").read_text(encoding="utf-8")
    assert ftl == "existing = One\n\n\nadded = Kyber Fox string\n"  # appended after "\n\n", rebranded
    assert (tree / "browser/locales/en-US/chrome/browser/extra.properties").read_text() == "whole=Kyber Fox\n"
    assert not list((tree / "browser/locales/en-US").rglob("README*"))
    assert "german" not in ftl and not (tree / "de").exists()
    assert len(written) == 2


def test_append_to_missing_target_raises(tmp_path):
    tree, lw, l10n = _setup(tmp_path)
    _write(l10n / "en-US/browser/browser/browser.inc.ftl", "added = x\n")
    with pytest.raises(RuntimeError, match=r"browser\.inc\.ftl.*browser\.ftl.*does not exist"):
        apply_librewolf_l10n(tree, lw)
    assert not (tree / "browser").exists()


def test_brandings_terms_are_replaced_in_place(tmp_path):
    tree, lw, l10n = _setup(tmp_path)
    target = tree / "toolkit/locales/en-US/toolkit/branding/brandings.ftl"
    _write(target, "# header\n-a-brand-name = Old A\n# note\n-other = Other\n-b-brand-name = Old B\n")
    _write(l10n / "en-US/toolkit/toolkit/branding/brandings.ftl",
           "-a-brand-name = LibreWolf A\n-b-brand-name = B\n")
    apply_librewolf_l10n(tree, lw)
    assert target.read_text(encoding="utf-8") == (
        "# header\n-a-brand-name = Kyber Fox A\n# note\n-other = Other\n-b-brand-name = B\n"
    )


def test_brandings_unknown_term_raises(tmp_path):
    tree, lw, l10n = _setup(tmp_path)
    _write(tree / "toolkit/locales/en-US/toolkit/branding/brandings.ftl", "-a = A\n")
    _write(l10n / "en-US/toolkit/toolkit/branding/brandings.ftl", "-zzz = Z\n")
    with pytest.raises(RuntimeError, match="-zzz"):
        apply_librewolf_l10n(tree, lw)
