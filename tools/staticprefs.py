"""Keep StaticPrefList.yaml sections in the order Firefox's generator requires.

Rebranding renames LibreWolf's "librewolf." section to "kyberfox.", which then
sorts before the "layout." section it was written after.
"""
import re
from pathlib import Path

_HEADER = re.compile(r'^# Prefs starting with "([^"]+)\."\s*$')


def _split(text: str) -> tuple[str, list[tuple[str, str]]]:
    """Return the text before the first section and the (prefix, text) sections."""
    lines = text.splitlines(keepends=True)
    starts = [i - 1 for i, line in enumerate(lines) if _HEADER.match(line.rstrip("\r\n"))]
    if not starts:
        return text, []
    sections = []
    for n, start in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        prefix = _HEADER.match(lines[start + 1].rstrip("\r\n")).group(1)
        sections.append((prefix, "".join(lines[start:end])))
    return "".join(lines[:starts[0]]), sections


def reorder_sections(text: str) -> str:
    """Move each section that sorts before its predecessor to its sorted place."""
    head, sections = _split(text)
    ordered: list[tuple[str, str]] = []
    displaced = []
    for item in sections:
        if ordered and item[0] < ordered[-1][0]:
            displaced.append(item)
        else:
            ordered.append(item)
    for item in displaced:
        pos = next((i for i, s in enumerate(ordered) if s[0] > item[0]), len(ordered))
        ordered.insert(pos, item)
    return head + "".join(body for _, body in ordered)


def move_section_into_order(path: Path) -> bool:
    """Reorder the file in place; return whether it changed."""
    text = path.read_text()
    new = reorder_sections(text)
    if new == text:
        return False
    path.write_text(new)
    return True
