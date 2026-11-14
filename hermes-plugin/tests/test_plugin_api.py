"""Unit tests for the Digital Company dashboard plugin backend (no Hermes needed)."""
import importlib.util
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

PLUGIN = Path(__file__).resolve().parents[1] / "digital-company" / "dashboard" / "plugin_api.py"


@pytest.fixture()
def api(monkeypatch, tmp_path):
    spec = importlib.util.spec_from_file_location("dc_plugin_api", PLUGIN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    tasks = [
        {"id": "t1", "title": "Run", "assignee": "iac-engineer", "status": "running"},
        {"id": "b1", "title": "Pick SKU", "assignee": "finops-lead", "status": "blocked"},
        {"id": "b2", "title": "Broken", "assignee": "network-engineer", "status": "blocked"},
    ]
    monkeypatch.setattr(mod, "_hermes_list_tasks", lambda: tasks)

    def events(task_id):
        if task_id == "b2":
            raise RuntimeError("db locked")
        return [{"kind": "blocked", "payload": {"reason": "HUMAN_APPROVAL [budget]: x", "kind": "needs_input"}, "created_at": 1}]

    monkeypatch.setattr(mod, "_hermes_task_events", events)
    monkeypatch.setattr(
        mod, "_hermes_events_since",
        lambda since, limit: [{"id": i, "task_id": "t1", "run_id": None, "kind": "created", "payload": None, "created_at": i}
                              for i in range(since + 1, min(since + limit, 5) + 1)],
    )

    async def usage(days, profile):
        if profile == "qa-validator":
            raise RuntimeError("profile db missing")
        return {"totals": {"total_api_calls": 3}, "daily": [], "by_model": [], "period_days": days}

    monkeypatch.setattr(mod, "_hermes_usage", usage)

    root = tmp_path / "digital-company"
    (root / "company").mkdir(parents=True)
    (root / "company" / "roster.yaml").write_text("version: 1\n")
    (root / "projects" / "_template").mkdir(parents=True)
    (root / "projects" / "_template" / "PROJECT.md").write_text("template")
    (root / "projects" / "DC-0001").mkdir()
    (root / "projects" / "DC-0001" / "PROJECT.md").write_text("Project ID: DC-0001\n")
    monkeypatch.setenv("DC_COMPANY_ROOT", str(root))

    app = FastAPI()
    app.include_router(mod.router, prefix="/api/plugins/digital-company")
    return mod, TestClient(app)


def test_health_reports_company_root(api):
    _, c = api
    body = c.get("/api/plugins/digital-company/health").json()
    assert body["status"] == "ok" and body["companyRootFound"] is True


def test_tasks_pass_through(api):
    _, c = api
    assert [t["id"] for t in c.get("/api/plugins/digital-company/tasks").json()["tasks"]] == ["t1", "b1", "b2"]


def test_tasks_unavailable_is_503(api, monkeypatch):
    mod, c = api
    monkeypatch.setattr(mod, "_hermes_list_tasks", lambda: (_ for _ in ()).throw(RuntimeError("no db")))
    r = c.get("/api/plugins/digital-company/tasks")
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]


def test_blocked_events_only_for_blocked_tasks_and_degrades(api):
    _, c = api
    by = c.get("/api/plugins/digital-company/blocked-events").json()["byTask"]
    assert set(by) == {"b1", "b2"}
    assert by["b1"][0]["payload"]["reason"].startswith("HUMAN_APPROVAL")
    assert by["b2"] is None


def test_task_events_validates_id(api):
    _, c = api
    assert c.get("/api/plugins/digital-company/tasks/b1/events").status_code == 200
    assert c.get("/api/plugins/digital-company/tasks/bad%20id%3B/events").status_code == 400


def test_events_pagination_and_cursor(api):
    _, c = api
    first = c.get("/api/plugins/digital-company/events?since=0&limit=2").json()
    assert [e["id"] for e in first["events"]] == [1, 2] and first["cursor"] == 2
    empty = c.get("/api/plugins/digital-company/events?since=5").json()
    assert empty == {"events": [], "cursor": 5}
    assert c.get("/api/plugins/digital-company/events?limit=100000").status_code == 422


def test_usage_includes_default_validates_and_isolates_errors(api):
    _, c = api
    body = c.get("/api/plugins/digital-company/usage?days=7&profiles=john-tdm,qa-validator,john-tdm").json()
    assert list(body["byProfile"]) == ["default", "john-tdm", "qa-validator"]
    assert body["byProfile"]["john-tdm"]["totals"]["total_api_calls"] == 3
    assert "error" in body["byProfile"]["qa-validator"]
    assert c.get("/api/plugins/digital-company/usage?profiles=../etc").status_code == 400


def test_projects_reads_files_and_skips_template(api):
    _, c = api
    body = c.get("/api/plugins/digital-company/projects").json()
    assert body["error"] is None
    assert [p["dir"] for p in body["projects"]] == ["DC-0001"]


def test_projects_without_root(api, monkeypatch):
    mod, c = api
    monkeypatch.delenv("DC_COMPANY_ROOT")
    assert "not configured" in c.get("/api/plugins/digital-company/projects").json()["error"]


def test_company_root_from_config_json(api, monkeypatch, tmp_path):
    mod, _ = api
    monkeypatch.delenv("DC_COMPANY_ROOT")
    cfg_dir = tmp_path / "plugin"
    cfg_dir.mkdir()
    (cfg_dir / "config.json").write_text(json.dumps({"company_root": "D:/github/digital-company"}))
    monkeypatch.setattr(mod, "PLUGIN_DIR", cfg_dir)
    assert str(mod._company_root()).replace("\\", "/") == "D:/github/digital-company"
