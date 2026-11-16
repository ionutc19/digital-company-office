"""Contract test: the Hermes functions plugin_api.py relies on still exist with
the expected parameters. Static (AST) so Hermes does not need to be installed.

Run with HERMES_SRC pointing at a checkout of the pinned Hermes tag; skipped
otherwise. CI fetches tag v2026.9.24 (see .github/workflows/ci.yml).
"""
import ast
import os
from pathlib import Path

import pytest

SRC = os.environ.get("HERMES_SRC")
pytestmark = pytest.mark.skipif(not SRC, reason="HERMES_SRC not set")

# module path -> {function name: required parameter names}
CONTRACT = {
    "hermes_cli/kanban_db.py": {"list_tasks": ["conn"], "list_events": ["conn", "task_id"]},
    "hermes_cli/kanban_db_connect.py": {"connect_closing": ["db_path"]},
    "hermes_cli/kanban_output.py": {"_task_to_dict": ["t"]},
    "hermes_cli/web_routers/analytics.py": {"get_usage_analytics": ["days", "profile"]},
}


def _functions(path: Path) -> dict:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            a = node.args
            out[node.name] = [x.arg for x in a.posonlyargs + a.args + a.kwonlyargs]
    return out


@pytest.mark.parametrize("module", sorted(CONTRACT))
def test_functions_exist_with_parameters(module):
    funcs = _functions(Path(SRC) / module)
    for name, params in CONTRACT[module].items():
        assert name in funcs, f"{module}: {name} missing"
        for p in params:
            assert p in funcs[name], f"{module}: {name} lost parameter {p!r}"


def test_task_dict_fields_cover_what_the_office_reads():
    text = (Path(SRC) / "hermes_cli/kanban_output.py").read_text(encoding="utf-8")
    for field in ["id", "title", "assignee", "status", "project_id", "created_at", "started_at",
                  "completed_at", "last_failure_error", "skills"]:
        assert f'"{field}"' in text, f"_TASK_DICT_FIELDS no longer includes {field}"


def test_task_events_table_columns():
    text = (Path(SRC) / "hermes_cli/kanban_db.py").read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS task_events" in text
    block = text.split("CREATE TABLE IF NOT EXISTS task_events", 1)[1].split(")", 1)[0]
    for col in ["id", "task_id", "run_id", "kind", "payload", "created_at"]:
        assert col in block, f"task_events lost column {col}"
