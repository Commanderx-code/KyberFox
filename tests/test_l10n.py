from tools.assemble import apply_librewolf_l10n


def _write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def test_librewolf_l10n_is_applied(tmp_path):
    tree, lw = tmp_path / "tree", tmp_path / "lw"
    l10n = lw / "l10n"
    _write(tree / "browser/locales/en-US/browser/browser.ftl", "existing = One\n")
    _write(l10n / "en-US/browser/browser/browser.inc.ftl", "added = LibreWolf string\n")
    _write(l10n / "en-US/browser/chrome/browser/extra.properties", "whole=LibreWolf\n")
    _write(l10n / "en-US/browser/browser/README.md", "ignored\n")
    _write(l10n / "en-US/toolkit/toolkit/branding/brandings.ftl", "-x = y\n")
    _write(l10n / "de/browser/browser/browser.inc.ftl", "german = Nein\n")

    written = apply_librewolf_l10n(tree, lw)

    ftl = (tree / "browser/locales/en-US/browser/browser.ftl").read_text()
    assert ftl.startswith("existing = One\n")  # appended, not replaced
    assert "added = Kyber Fox string" in ftl  # rebranded
    assert (tree / "browser/locales/en-US/chrome/browser/extra.properties").read_text() == "whole=Kyber Fox\n"
    assert not list((tree / "browser/locales/en-US").rglob("README*"))
    assert not (tree / "toolkit").exists()  # brandings.ftl is skipped
    assert "german" not in ftl and not (tree / "de").exists()
    assert len(written) == 2
