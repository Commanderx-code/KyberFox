from tools.check_strict import check, main

FIREFOX = 'pref("browser.contentblocking.features.strict", "tp,cookieBehavior5,cookieBehaviorPBM5,fp,lna");\n'


def _files(tmp_path, firefox, cfg):
    tree = tmp_path / "tree"
    (tree / "browser/app/profile").mkdir(parents=True)
    (tree / "browser/app/profile/firefox.js").write_text(firefox, encoding="utf-8")
    cfg_file = tmp_path / "kyberfox.cfg"
    cfg_file.write_text(cfg, encoding="utf-8")
    return tree, cfg_file


def test_match_ignores_cookie_behavior(tmp_path):
    tree, cfg = _files(tmp_path, FIREFOX, (
        'defaultPref(\n  "browser.contentblocking.features.strict",\n'
        '  "tp,cookieBehavior1,cookieBehaviorPBM1,fp,lna"\n);\n'))
    assert check(tree, cfg) == []
    assert main([str(tree), str(cfg)]) == 0


def test_mismatch_prints_both_values(tmp_path, capsys):
    tree, cfg = _files(tmp_path, FIREFOX,
                       'defaultPref("browser.contentblocking.features.strict", "tp,cookieBehavior1,cookieBehaviorPBM1,fp");')
    problems = check(tree, cfg)
    assert len(problems) == 1 and "tp,cookieBehavior5" in problems[0] and "tp,cookieBehavior1" in problems[0]
    assert main([str(tree), str(cfg)]) == 1
    assert "Kyber:" in capsys.readouterr().err


def test_missing_pref_is_reported(tmp_path):
    tree, cfg = _files(tmp_path, "// nothing\n", 'defaultPref("other", "x");')
    assert len(check(tree, cfg)) == 2
    assert main([str(tree), str(cfg)]) == 1
