from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def test_pull_requests_run_the_python_tests():
    workflow = yaml.safe_load((ROOT / ".github/workflows/checks.yml").read_text(encoding="utf-8"))
    triggers = workflow[True]  # PyYAML reads the key "on" as True.
    assert "pull_request" in triggers
    assert triggers["push"]["branches"] == ["main"]
    steps = workflow["jobs"]["pytest"]["steps"]
    runs = [step.get("run", "") for step in steps]
    assert "pip install --require-hashes -r requirements-dev.txt" in runs
    assert "python -m pytest tests -q" in runs
