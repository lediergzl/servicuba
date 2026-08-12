"""Low-cost smoke tests that do not require a live database."""

from pathlib import Path
import ast


ROOT = Path(__file__).resolve().parents[1]


def test_core_python_files_parse():
    """Catch syntax errors without importing the app or opening a DB connection."""
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
