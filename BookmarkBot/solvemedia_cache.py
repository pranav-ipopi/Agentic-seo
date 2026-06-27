"""
solvemedia_cache.py — Thread-safe helper to persist correctly-solved SolveMedia answers.

Usage:
    from solvemedia_cache import save_captcha_answer

After a 2captcha answer is accepted by the site (not reported as bad):
    save_captcha_answer("abelian grape")

The file (solvemedia.txt) is a JS-style phrase list:
    var PHRASES = [
        "abelian grape",
        ...
    ]
Only unique, non-empty answers are appended (case-insensitive dedup).
"""

from __future__ import annotations

import re
import threading
from pathlib import Path

_LOCK = threading.Lock()
_FILE = Path(__file__).parent / "solvemedia.txt"


def _load_existing() -> set[str]:
    """Return a lower-cased set of all phrases already in the file."""
    if not _FILE.exists():
        return set()
    text = _FILE.read_text(encoding="utf-8")
    # Extract all quoted strings from the JS array
    return {m.lower() for m in re.findall(r'"([^"]+)"', text)}


def save_captcha_answer(answer: str) -> bool:
    """
    Append a correctly-solved SolveMedia captcha answer to solvemedia.txt.

    - Only adds if the answer is not already present (case-insensitive).
    - Thread-safe: file is locked during read-check-write.
    - Returns True if the answer was newly added, False if it was already present.

    Call this ONLY after the site accepted the answer (i.e. no "invalid captcha"
    in the response body — meaning 2captcha got it right).
    """
    answer = answer.strip()
    if not answer:
        return False

    with _LOCK:
        existing = _load_existing()
        if answer.lower() in existing:
            return False  # already in the list

        if not _FILE.exists():
            # Create the file with a minimal JS array structure
            _FILE.write_text('var PHRASES = [\n    "' + answer + '"\n]\n', encoding="utf-8")
            return True

        text = _FILE.read_text(encoding="utf-8")

        # Insert before the closing "]"
        # The file ends with:    "last phrase"\n]
        # We change it to:       "last phrase",\n    "new phrase"\n]
        if text.rstrip().endswith("]"):
            # Find the last phrase line and add a comma + new entry before ]
            new_text = re.sub(
                r'(\s*"[^"]*")\s*\n\]',
                lambda m: m.group(1) + ',\n    "' + answer + '"\n]',
                text,
                count=1,
                flags=re.DOTALL,
            )
            _FILE.write_text(new_text, encoding="utf-8")
        else:
            # Fallback: just append a line
            with _FILE.open("a", encoding="utf-8") as fh:
                fh.write(f'    "{answer}"\n')

        return True
