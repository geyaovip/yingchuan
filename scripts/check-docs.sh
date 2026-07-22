#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

python3 - "$repo_root" <<'PY'
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

root = Path(sys.argv[1]).resolve()
excluded_directories = {".git", ".turbo", "coverage", "dist", "node_modules"}
markdown_files = sorted(
    path
    for path in root.rglob("*.md")
    if not excluded_directories.intersection(path.parts)
)
link_pattern = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
failures: list[str] = []

for document in markdown_files:
    text = document.read_text(encoding="utf-8")
    for raw_target in link_pattern.findall(text):
        target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        path_part = unquote(target.split("#", 1)[0])
        resolved = (document.parent / path_part).resolve()
        try:
            resolved.relative_to(root)
        except ValueError:
            failures.append(f"{document.relative_to(root)}: link leaves repository: {target}")
            continue
        if not resolved.exists():
            failures.append(f"{document.relative_to(root)}: missing target: {target}")

    expected_columns: int | None = None
    in_table = False
    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|"):
            column_count = len(stripped[1:-1].split("|"))
            if not in_table:
                expected_columns = column_count
                in_table = True
            elif column_count != expected_columns:
                failures.append(
                    f"{document.relative_to(root)}:{line_number}: "
                    f"Markdown table has {column_count} columns; expected {expected_columns}"
                )
        else:
            expected_columns = None
            in_table = False

if failures:
    print("Documentation link check failed:")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print(f"Documentation check passed: {len(markdown_files)} Markdown files")
PY
