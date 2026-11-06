"""The Windows updater skips an update only when its build ID equals the one
compiled into the running browser (Services.appinfo.appBuildID). The release
writes the update manifest from application.ini, so the two must be the same
value. Without a pinned MOZ_BUILD_DATE, `make build` and `make package` each
made their own ID, every update looked new again after it was installed, and
Windows installs reinstalled the same release in a loop."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github/workflows"


def steps(workflow, job):
    data = yaml.safe_load((WORKFLOWS / workflow).read_text(encoding="utf-8"))
    return data["jobs"][job]["steps"]


def index_of(all_steps, run):
    return next(i for i, step in enumerate(all_steps) if step.get("run", "").strip() == run)


def test_build_jobs_pin_the_build_id_before_building():
    for workflow in ("build-windows.yml", "build-linux.yml"):
        all_steps = steps(workflow, "build")
        pin = next(i for i, step in enumerate(all_steps)
                   if "MOZ_BUILD_DATE=" in step.get("run", "") and "$GITHUB_ENV" in step.get("run", ""))
        build = next(i for i, step in enumerate(all_steps) if "make build" in step.get("run", ""))
        assert pin < build < index_of(all_steps, "make package"), workflow


def test_release_checks_the_build_id_is_compiled_in():
    run = next(step["run"] for step in steps("release.yml", "publish")
               if step.get("name") == "Read the build id from the MAR")
    assert "for bin in kyberfox.exe xul.dll" in run
    assert 'grep -c -a -F "$build_id" "$bin"' in run
