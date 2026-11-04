import json
import re
from pathlib import Path

import pytest
import yaml

from tools import set_disabled_skins as S

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github/workflows"
TEXT = (WORKFLOWS / "release.yml").read_text(encoding="utf-8")
WORKFLOW = yaml.safe_load(TEXT)
JOBS = WORKFLOW["jobs"]


def triggers():
    # PyYAML reads the bare key `on` as the boolean True.
    return WORKFLOW.get("on", WORKFLOW.get(True))


def as_list(value):
    return [value] if isinstance(value, str) else list(value or [])


def needs_closure(job):
    seen, todo = set(), as_list(JOBS[job].get("needs"))
    while todo:
        name = todo.pop()
        if name not in seen:
            seen.add(name)
            todo += as_list(JOBS[name].get("needs"))
    return seen


def steps(job):
    return JOBS[job]["steps"]


def step_named(job, fragment):
    found = [s for s in steps(job) if fragment in s.get("name", "")]
    assert len(found) == 1, f"{fragment}: {len(found)} steps"
    return found[0]


def test_release_is_manual_only():
    t = triggers()
    assert list(t) == ["workflow_dispatch"]
    inputs = t["workflow_dispatch"]["inputs"]
    assert inputs["version"]["required"] is True
    assert inputs["channel"]["default"] == "release"
    assert inputs["channel"]["options"] == ["release", "test"]
    assert inputs["set-disabled-skin"]["default"] == ""
    assert inputs["dry-run"]["default"] is False
    # Dry runs and test-channel runs both publish the -test tag, so they share one group.
    assert WORKFLOW["concurrency"] == {
        "group": "release-${{ inputs.dry-run || inputs.channel == 'test' }}",
        "cancel-in-progress": False}


def test_publish_job_requires_environment():
    publish = JOBS["publish"]
    assert publish["environment"] == "release"
    assert "verify" in as_list(publish["needs"])
    for name, job in JOBS.items():
        if name in ("build-linux", "build-windows"):
            # The builds get only the Safe Browsing key, which the binary embeds.
            assert job["secrets"] == {"KYBERFOX_SAFEBROWSING_KEY": SB_SECRET}, name
            job = {k: v for k, v in job.items() if k != "secrets"}
        text = yaml.safe_dump(job)
        assert ("MAR_SIGNING_KEY" in text) == (name == "publish"), name
        for secret in ("PACMAN_GPG_KEY", "PACMAN_GPG_KEY_ID"):
            assert (secret in text) == (name == "publish"), (name, secret)
        if name == "prepare":
            # prepare only tests whether the Safe Browsing key exists; the value never reaches a step.
            text = text.replace(SB_PRESENT, "")
        assert ("secrets." in text) == (name == "publish"), name
    assert "secrets.MAR_SIGNING_KEY" in yaml.safe_dump(publish)


SB_PRESENT = "${{ secrets.KYBERFOX_SAFEBROWSING_KEY != '' }}"


def test_prepare_refuses_a_release_without_the_safe_browsing_key():
    steps = JOBS["prepare"]["steps"]
    [step] = [s for s in steps if "Safe Browsing" in s.get("name", "")]
    assert step["if"] == "inputs.channel == 'release' && !inputs.dry-run"
    assert step["env"] == {"HAVE_KEY": SB_PRESENT}
    assert 'if [ "$HAVE_KEY" != "true" ]' in step["run"]
    assert "exit 1" in step["run"]
    # The tag check runs first so a missing key is reported against a valid run.
    names = [s.get("name") for s in steps]
    assert names.index("Check the version and the tag") < names.index(step["name"])


SB_SECRET = "${{ secrets.KYBERFOX_SAFEBROWSING_KEY }}"


@pytest.mark.parametrize("wf", ["build-linux", "build-windows"])
def test_build_workflows_take_the_safe_browsing_key(wf):
    text = (WORKFLOWS / f"{wf}.yml").read_text(encoding="utf-8")
    flow = yaml.safe_load(text)
    call = (flow.get("on") or flow.get(True))["workflow_call"]
    assert call["secrets"]["KYBERFOX_SAFEBROWSING_KEY"]["required"] is False
    build = flow["jobs"]["build"]["steps"]
    [step] = [s for s in build if s.get("name") == "Safe Browsing key"]
    assert step["env"] == {"SAFEBROWSING_KEY": SB_SECRET}
    run = step["run"]
    assert '"$RUNNER_TEMP/safebrowsing.key"' in run
    assert "KYBERFOX_SAFEBROWSING_KEYFILE=$keyfile" in run and "$GITHUB_ENV" in run
    assert "::warning::" in run and "without Safe Browsing lists" in run
    # The key itself only ever goes to the file, never to the log.
    assert run.count("$SAFEBROWSING_KEY") == 2
    assert 'printf \'%s\' "$SAFEBROWSING_KEY" > "$keyfile"' in run
    names = [s.get("name") for s in build]
    assert names.index("Safe Browsing key") < names.index("Write CI mozconfig")
    assert "safebrowsing.key" not in yaml.safe_dump(
        [s for s in build if "upload-artifact" in s.get("uses", "")])
    mozconfig = "linux" if wf == "build-linux" else "windows-cross"
    assert "--with-google-safebrowsing-api-keyfile=$KYBERFOX_SAFEBROWSING_KEYFILE" in (
        ROOT / "mozconfigs" / mozconfig).read_text(encoding="utf-8")


def test_release_passes_the_safe_browsing_key():
    for name in ("build-linux", "build-windows"):
        assert JOBS[name]["secrets"]["KYBERFOX_SAFEBROWSING_KEY"] == SB_SECRET


def test_only_publish_writes_and_nothing_else_has_environment():
    assert [n for n, j in JOBS.items() if "environment" in j] == ["publish"]
    assert WORKFLOW["permissions"] == {"contents": "read"}
    for name, job in JOBS.items():
        perms = job.get("permissions", {})
        assert (perms.get("contents") == "write") == (name == "publish"), name
        assert "id-token" not in perms


def test_verify_runs_every_gate():
    verify = needs_closure("verify")
    uses = {JOBS[n]["uses"] for n in verify if "uses" in JOBS[n]}
    for wf in ("build-linux", "build-windows", "front-end-tests", "smoke-windows", "smoke-arch"):
        assert f"./.github/workflows/{wf}.yml" in uses
    commands = "\n".join(s.get("run", "") for s in steps("verify"))
    assert "make check-forbidden" in commands
    assert "pytest tests" in commands
    assert commands.index("make assemble") < commands.index("make check-forbidden")
    # The build workflow already calls the refuse smoke; release.yml must not call it again.
    assert "./.github/workflows/smoke-update.yml" not in {
        j["uses"] for n, j in JOBS.items() if "uses" in j and n != "apply-update"}
    assert "smoke-update.yml" in (WORKFLOWS / "build-windows.yml").read_text(encoding="utf-8")
    # Publish waits for all of it.
    assert set(JOBS) - {"publish", "apply-update"} >= needs_closure("publish") | {"verify"}
    assert verify <= needs_closure("publish")


def test_apply_update_runs_after_publish_with_the_signed_mar():
    job = JOBS["apply-update"]
    assert as_list(job["needs"]) == ["publish"]
    assert job["uses"] == "./.github/workflows/smoke-update.yml"
    assert job["with"]["signed-mar-run-id"] == "${{ github.run_id }}"
    assert job["with"]["run-id"] == "${{ inputs.update-from-run-id }}"
    assert job["with"]["skip-refuse"] is True
    smoke = yaml.safe_load((WORKFLOWS / "smoke-update.yml").read_text(encoding="utf-8"))
    call = (smoke.get("on") or smoke.get(True))["workflow_call"]["inputs"]["skip-refuse"]
    assert call["type"] == "boolean" and call["default"] is False
    assert smoke["jobs"]["refuse"]["if"] == "${{ !inputs.skip-refuse }}"
    upload = step_named("publish", "Upload the signed MAR")
    assert upload["with"]["name"] == "kyberfox-windows-signed-mar"


def test_dry_run_never_touches_release_channel():
    publish_text = yaml.safe_dump(JOBS["publish"])
    assert "update/release" not in publish_text
    manifests = step_named("publish", "Publish the update manifests")
    assert manifests["env"]["MANIFEST_CHANNEL"] == "${{ inputs.dry-run && 'test' || inputs.channel }}"
    assert "update/$MANIFEST_CHANNEL/WINNT_x86_64-msvc-$cpu/update.xml" in manifests["run"]
    assert "for cpu in x64 aarch64" in manifests["run"]
    # The real pacman repo is written only for a non-dry release-channel run.
    repo_steps = [s for s in steps("publish") if "publish-to-release.sh" in s.get("run", "")]
    assert len(repo_steps) == 1
    assert repo_steps[0]["if"] == "${{ !inputs.dry-run && inputs.channel == 'release' }}"
    scratch = step_named("publish", "scratch repo")
    assert scratch["if"] == "${{ inputs.dry-run }}"
    assert "publish-to-release.sh" not in scratch["run"]
    # Only the manifests go to gh-pages; the pacman repo is a Release (git refuses files over 100 MB).
    pushers = [s["name"] for s in steps("publish") if "push origin HEAD:gh-pages" in s.get("run", "")]
    assert pushers == ["Publish the update manifests"]
    assert "arch/" not in "".join(s.get("run", "") for s in steps("publish") if "gh-pages" in s.get("run", ""))
    # Dry runs and test channels make pre-releases with a -test tag.
    release = step_named("publish", "Create the GitHub Release")
    assert "--prerelease" in release["run"]
    prepare = step_named("prepare", "Check the version")
    assert 'tag="$tag-test"' in prepare["run"]
    assert prepare["env"]["DRY_RUN"] == "${{ inputs.dry-run }}"


def test_publish_orders_release_then_manifest_then_pacman():
    names = [s["name"] for s in steps("publish")]
    order = ["Refuse placeholder update certificates", "Sign the MAR",
             "Build the Arch package", "Tag the release", "Create the GitHub Release",
             "Publish the update manifests", "Publish the pacman repo"]
    positions = [names.index(n) for n in order]
    assert positions == sorted(positions)


def test_signing_key_file_is_removed_on_any_exit():
    run = step_named("publish", "Sign the MAR")["run"]
    assert "trap 'shred -u \"$key\"" in run
    assert run.index("trap ") < run.index("printf '%s\\n' \"$MAR_SIGNING_KEY\"")


def test_arch_image_is_pinned_by_digest():
    image = JOBS["publish"]["env"]["ARCH_IMAGE"]
    assert re.fullmatch(r"archlinux:base-devel@sha256:[0-9a-f]{64}", image)
    assert "archlinux:base-devel" not in re.sub(r"ARCH_IMAGE: \S+", "", TEXT.replace("# archlinux:base-devel as of", ""))


def test_publish_arch_workflow_matches_the_release_publish():
    wf = yaml.safe_load((WORKFLOWS / "publish-arch.yml").read_text(encoding="utf-8"))
    on = wf.get("on") or wf.get(True)
    assert set(on) == {"workflow_dispatch"}
    assert on["workflow_dispatch"]["inputs"]["tag"]["required"] is True
    job = wf["jobs"]["publish-arch"]
    # The signing key is an environment secret, so this waits for the owner's approval too.
    assert job["environment"] == "release"
    assert job["env"]["ARCH_IMAGE"] == JOBS["publish"]["env"]["ARCH_IMAGE"]
    assert wf["concurrency"]["group"] == "release-false"
    assert WORKFLOW["concurrency"]["group"] == "release-${{ inputs.dry-run || inputs.channel == 'test' }}"
    runs = [s.get("run", "") for s in job["steps"]]
    check = next(r for r in runs if "SHA256SUMS" in r)
    assert "sha256sum --check" in check and "^v[0-9][0-9.]*-[0-9]+$" in check
    assert sum("publish-to-release.sh" in r for r in runs) == 1
    assert runs.index(check) < next(i for i, r in enumerate(runs) if "publish-to-release.sh" in r)
    # The tag reaches the shell through the environment, never by expression interpolation.
    assert all("inputs.tag" not in r for r in runs)


def test_every_commit_is_guarded_against_an_empty_commit():
    commits = [line.strip() for line in TEXT.splitlines() if "git commit" in line and "run:" not in line]
    assert len(commits) == 2
    for line in commits:
        if line.startswith("git diff --cached --quiet ||"):
            continue
        # The tag commit sits inside an explicit "files differ" check.
        assert "Ship release" in line
    gh_pages = [line for line in commits if "Ship release" not in line]
    assert len(gh_pages) == 1 and all(l.startswith("git diff --cached --quiet || git commit") for l in gh_pages)


def test_existing_tag_must_hold_the_same_tree():
    tag = step_named("publish", "Tag the release")["run"]
    assert "^{tree}" in tag and "HEAD^{tree}" in tag and "exit 1" in tag
    assert step_named("publish", "Upload the signed MAR")["with"]["overwrite"] is True


def test_publish_steps_can_be_rerun():
    tag = step_named("publish", "Tag the release")["run"]
    assert "ls-remote --exit-code --tags" in tag
    release = step_named("publish", "Create the GitHub Release")["run"]
    assert 'gh release view "$TAG"' in release and "--clobber" in release
    prepare = step_named("prepare", "Check the version")
    assert "GH_TOKEN" not in prepare.get("env", {})
    assert "2) ;;" in prepare["run"]


def test_dev_requirements_are_hash_pinned():
    text = (ROOT / "requirements-dev.txt").read_text(encoding="utf-8")
    names = re.findall(r"^([\w.-]+)==", text, re.M)
    assert {"pytest", "pyyaml"} <= set(names)
    assert text.count("--hash=sha256:") >= len(names)
    verify = "\n".join(s.get("run", "") for s in steps("verify"))
    assert "--require-hashes -r requirements-dev.txt" in verify


def test_placeholder_certificates_are_refused_before_signing():
    gate = step_named("publish", "Refuse placeholder")["run"]
    assert "openssl x509 -inform DER -noout -subject" in gate
    assert "PLACEHOLDER" in gate and "release_primary" in gate and "release_secondary" in gate
    assert "docs/update-signing.md" in gate
    names = [s["name"] for s in steps("publish")]
    assert names.index("Refuse placeholder update certificates") < names.index("Sign the MAR")


def test_signing_uses_the_tool_and_verifies_against_the_committed_cert():
    run = step_named("publish", "Sign the MAR")["run"]
    assert "tools.sign_mar sign" in run
    assert "--cert overlay/toolkit/mozapps/update/updater/release_primary.der" in run
    assert "shred -u" in run
    setup = step_named("publish", "Set up Python")
    assert setup["with"]["python-version"] == "3.12"


def test_set_disabled_skin_writes_status():
    for wf in ("build-linux", "build-windows"):
        doc = yaml.safe_load((WORKFLOWS / f"{wf}.yml").read_text(encoding="utf-8"))
        call = (doc.get("on") or doc.get(True))["workflow_call"]["inputs"]["disabled-skins"]
        assert call["default"] == "" and call["type"] == "string"
        names = [s.get("name") for s in doc["jobs"]["build"]["steps"]]
        write = doc["jobs"]["build"]["steps"][names.index("Disable skins")]
        assert "tools.set_disabled_skins" in write["run"]
        assert write["if"] == "${{ inputs.disabled-skins != '' }}"
        assert names.index("Disable skins") < names.index("Assemble source tree")
    for job in ("build-linux", "build-windows"):
        assert JOBS[job]["with"]["disabled-skins"] == "${{ inputs.set-disabled-skin }}"
    assert "kyberfox-theme-status" in TEXT
    # verify assembles with the same file.
    assemble = step_named("verify", "Assemble the release tree")["run"]
    assert assemble.index("themes/status.json") < assemble.index("make assemble")


def test_windows_build_compares_update_certificates():
    doc = yaml.safe_load((WORKFLOWS / "build-windows.yml").read_text(encoding="utf-8"))
    names = [s.get("name") for s in doc["jobs"]["build"]["steps"]]
    step = doc["jobs"]["build"]["steps"][names.index("Check update certificates")]
    assert "cmp " in step["run"]
    assert "release_primary release_secondary" in step["run"]
    assert "work/tree/toolkit/mozapps/update/updater/$name.der" in step["run"]
    assert names.index("Assemble source tree") < names.index("Check update certificates")


def test_every_action_is_pinned_by_sha():
    for path in WORKFLOWS.glob("*.yml"):
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.search(r"uses:\s*(\S+)", line)
            if m and not m.group(1).startswith("./"):
                assert re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", m.group(1)), (path.name, line)
                assert re.search(r"# v\d", line), (path.name, line)


def test_pins_version_check_matches_pins_toml():
    prepare = step_named("prepare", "Check the version")["run"]
    assert "pins['firefox']['version']" in prepare and "pins['kyber']['build']" in prepare


# --- tools/set_disabled_skins.py ------------------------------------------------

def test_parse_ids_accepts_known_ids_and_drops_blanks():
    assert S.parse_ids("") == []
    assert S.parse_ids(" gx , one,gx,") == ["gx", "one"]


def test_parse_ids_rejects_the_fallback_theme_and_non_skins():
    with pytest.raises(ValueError, match="fallback"):
        S.parse_ids("gx,ember")
    # A palette that is not a skin is not a valid id either.
    with pytest.raises(ValueError, match="frost"):
        S.parse_ids("frost")


def test_parse_ids_rejects_unknown_ids():
    with pytest.raises(ValueError, match="nope"):
        S.parse_ids("gx,nope")


def test_cli_writes_status_json(tmp_path):
    out = tmp_path / "status.json"
    assert S.main(["gx,one", "--out", str(out)]) == 0
    assert json.loads(out.read_text()) == {"disabled": ["gx", "one"]}
    assert S.main(["", "--out", str(out)]) == 0
    assert json.loads(out.read_text()) == {"disabled": []}
    assert S.main(["bogus", "--out", str(out)]) == 1
    assert json.loads(out.read_text()) == {"disabled": []}


def test_cli_default_target_is_the_committed_status_file():
    committed = json.loads((ROOT / "themes/status.json").read_text())
    assert set(committed["disabled"]) <= S.skin_ids()
    assert S.THEMES == ROOT / "themes"
