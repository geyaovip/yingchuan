#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_DIRECTORIES = {
    ".git",
    ".turbo",
    "coverage",
    "dist",
    "node_modules",
    "generated",
}
EXCLUDED_FILES = {Path("scripts/check-secrets.py"), Path(".env.example")}
ALLOWED_MARKERS = {
    "fixture-",
    "replace_me",
    "test-only",
    "yingchuan_local_only",
    "yingchuan_test_local_only",
}
PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Resend API key": re.compile(r"\bre_[A-Za-z0-9]{20,}\b"),
    "Telegram bot token": re.compile(r"\b\d{8,12}:[A-Za-z0-9_-]{30,}\b"),
    "generic credential": re.compile(
        r"(?i)\b(?:api[_-]?key|client[_-]?secret|password|secret|token)\b"
        r"\s*[:=]\s*[\"']?([A-Za-z0-9+/_.-]{16,})"
    ),
}


def is_excluded(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    if relative in EXCLUDED_FILES:
        return True
    parts = relative.parts
    return any(
        excluded in parts or "/".join(parts).startswith(f"{excluded}/")
        for excluded in EXCLUDED_DIRECTORIES
    )


def scan() -> list[str]:
    failures: list[str] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or is_excluded(path) or path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            if any(marker in line for marker in ALLOWED_MARKERS):
                continue
            for label, pattern in PATTERNS.items():
                if pattern.search(line):
                    failures.append(
                        f"{path.relative_to(ROOT)}:{line_number}: possible {label}"
                    )
    return failures


def main() -> int:
    failures = scan()
    if failures:
        print("Secret scan failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Secret scan passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
