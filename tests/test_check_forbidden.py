from pathlib import Path

from tools.check_forbidden import Finding, load_rules, load_scope, main, scan

RULES_FILE = Path(__file__).resolve().parent.parent / "rules" / "forbidden.toml"
RULES = load_rules(RULES_FILE)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def test_flags_forbidden_pref_set_true(tmp_path):
    write(tmp_path / "firefox.js", 'pref("toolkit.telemetry.enabled", true);')
    assert [f.rule for f in scan(tmp_path, RULES)] == ["telemetry-enabled"]


def test_flags_ai_chat_provider(tmp_path):
    write(tmp_path / "x.js", 'pref("browser.ml.chat.enabled", true);')
    assert [f.rule for f in scan(tmp_path, RULES)] == ["ai-chat"]


def test_translations_not_flagged(tmp_path):
    write(tmp_path / "x.js", 'pref("browser.translations.enable", true);')
    assert scan(tmp_path, RULES) == []


def test_finding_has_path_and_line(tmp_path):
    write(tmp_path / "a" / "b.js", '// x\n\nlockPref("app.normandy.enabled", true);\n')
    assert scan(tmp_path, RULES) == [Finding("studies-normandy", "a/b.js", 3)]


def test_pref_set_false_or_synced_is_not_flagged(tmp_path):
    write(tmp_path / "x.js", (
        'pref("browser.ml.enable", false);\n'
        'pref("services.sync.prefs.sync.app.shield.optoutstudies.enabled", true);\n'
        'Services.prefs.setBoolPref("browser.ml.enable", true);\n'
    ))
    assert scan(tmp_path, RULES) == []


def test_every_pref_call_form_is_flagged(tmp_path):
    write(tmp_path / "x.cfg", (
        'defaultPref("browser.ml.enable", true);\n'
        'lockPref("browser.ml.linkPreview.enabled", true);\n'
        "sticky_pref('browser.tabs.groups.smart.enabled',\n  true);\n"
    ))
    assert [f.rule for f in scan(tmp_path, RULES)] == [
        "ai-ml", "ai-link-preview", "ai-smart-tab-groups",
    ]


def test_sponsored_wildcard(tmp_path):
    write(tmp_path / "x.js", (
        'pref("browser.newtabpage.activity-stream.showSponsoredTopSites", true);\n'
        'pref("browser.newtabpage.activity-stream.showSponsored", false);\n'
    ))
    assert [(f.rule, f.line) for f in scan(tmp_path, RULES)] == [("sponsored", 1)]


def test_static_pref_yaml_is_flagged(tmp_path):
    write(tmp_path / "StaticPrefList.yaml", (
        "- name: dom.private-attribution.submission.enabled\n"
        "  type: bool\n"
        "  value: true\n"
        "  mirror: always\n"
        "\n"
        "- name: pdfjs.enableAltText\n"
        "  type: bool\n"
        "  value: false\n"
    ))
    assert [(f.rule, f.line) for f in scan(tmp_path, RULES)] == [("ad-attribution", 1)]


def test_crash_report_url_must_be_empty(tmp_path):
    write(tmp_path / "x.js", (
        'pref("breakpad.reportURL", "https://crash-stats.example/");\n'
        'lockPref("breakpad.reportURL", "");\n'
    ))
    assert [(f.rule, f.line) for f in scan(tmp_path, RULES)] == [("crash-report-url", 1)]


def test_crashreporter_build_option(tmp_path):
    write(tmp_path / "mozconfigs" / "linux", (
        "ac_add_options --disable-crashreporter\n"
        "mk_add_options MOZ_CRASHREPORTER=0\n"
        "ac_add_options --enable-crashreporter\n"
    ))
    assert [(f.rule, f.line) for f in scan(tmp_path, RULES)] == [("crash-reporter-build", 3)]


def test_librewolf_hosts_flagged_outside_attribution(tmp_path):
    write(tmp_path / "build" / "moz.build", 'HOST = "update.librewolf.net"\n')
    write(tmp_path / "x.json", '{"url": "https://codeberg.org/librewolf/source"}\n')
    write(tmp_path / "toolkit" / "content" / "license.html",
          '<a href="https://librewolf.net">LibreWolf</a>\n')
    assert sorted((f.rule, f.path) for f in scan(tmp_path, RULES)) == [
        ("librewolf-host", "build/moz.build"),
        ("librewolf-host", "x.json"),
    ]


def test_scope_limits_roots_files_and_skipped_dirs(tmp_path):
    scope = load_scope(RULES_FILE)
    bad = 'pref("browser.ml.enable", true);\n'
    write(tmp_path / "browser" / "app" / "firefox.js", bad)
    write(tmp_path / "browser" / "notes.txt", bad)
    write(tmp_path / "browser" / "third_party" / "x.js", bad)
    write(tmp_path / "toolkit" / "tests" / "x.js", bad)
    write(tmp_path / "obj-x86_64-pc-linux-gnu" / "browser" / "x.js", bad)
    write(tmp_path / "dom" / "x.js", bad)
    assert [f.path for f in scan(tmp_path, RULES, scope)] == ["browser/app/firefox.js"]


def test_cli_exits_1_and_prints_findings(tmp_path, capsys):
    write(tmp_path / "browser" / "x.js", 'pref("browser.smartwindow.enabled", true);\n')
    assert main([str(tmp_path)]) == 1
    assert "browser/x.js:1: ai-smart-window" in capsys.readouterr().out


def test_cli_exits_0_on_clean_tree(tmp_path):
    write(tmp_path / "browser" / "x.js", 'pref("browser.smartwindow.enabled", false);\n')
    assert main([str(tmp_path)]) == 0
