"""Digital Company Virtual Office — Hermes Dashboard plugin backend.

Thin, read-only data API mounted by the Dashboard at
``/api/plugins/digital-company/`` behind the Dashboard's own auth gate.

Design rules:
- Only exposes data. All interpretation (status mapping, approvals, overview,
  compliance, FinOps, timeline) runs in the plugin frontend (TypeScript,
  shared with the standalone dev server and covered by its tests).
- Reuses the same Hermes code paths as the bundled Kanban plugin and the
  Dashboard analytics route. No subprocesses, no LLM calls, no writes.
- Every Hermes import is done lazily inside ``_hermes_*`` helpers so the
  module imports (and its tests run) without Hermes installed.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

PROFILE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
TASK_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
MAX_BLOCKED_LOOKUPS = 20
MAX_PROJECTS = 200
MAX_PROJECT_BYTES = 256 * 1024
EVENTS_PAGE_MAX = 500
PLUGIN_DIR = Path(__file__).resolve().parent


# --------------------------------------------------------------------------
# Hermes access (lazy imports; monkeypatched in tests)

def _hermes_list_tasks() -> list[dict[str, Any]]:
    """Same objects and shape as ``hermes kanban list --json``."""
    from hermes_cli import kanban_db
    from hermes_cli.kanban_db_connect import connect_closing
    from hermes_cli.kanban_output import _task_to_dict

    with connect_closing() as conn:
        return [_task_to_dict(t) for t in kanban_db.list_tasks(conn)]


def _hermes_task_events(task_id: str) -> list[dict[str, Any]]:
    from hermes_cli import kanban_db
    from hermes_cli.kanban_db_connect import connect_closing

    with connect_closing() as conn:
        return [
            {"kind": e.kind, "payload": _json_or_none(e.payload), "created_at": e.created_at}
            for e in kanban_db.list_events(conn, task_id)
        ]


def _hermes_events_since(since: int, limit: int) -> list[dict[str, Any]]:
    """Board-wide ``task_events`` tail (same query as the Kanban plugin's /events WS)."""
    from hermes_cli.kanban_db_connect import connect_closing

    with connect_closing() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, task_id, run_id, kind, payload, created_at FROM task_events "
            "WHERE id > ? ORDER BY id ASC LIMIT ?",
            (since, limit),
        ).fetchall()
    return [{**dict(r), "payload": _json_or_none(r["payload"])} for r in rows]


async def _hermes_usage(days: int, profile: Optional[str]) -> dict[str, Any]:
    """The Dashboard's own analytics handler (Models page numbers)."""
    from hermes_cli.web_routers.analytics import get_usage_analytics

    return await get_usage_analytics(days=days, profile=profile)


def _company_root() -> Optional[Path]:
    """digital-company repo root: env var, else config.json written by the installer."""
    raw = os.environ.get("DC_COMPANY_ROOT")
    if not raw:
        cfg = PLUGIN_DIR / "config.json"
        try:
            raw = json.loads(cfg.read_text(encoding="utf-8")).get("company_root")
        except (OSError, ValueError, AttributeError):
            raw = None
    return Path(raw) if raw else None


def _json_or_none(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Routes

@router.get("/health")
async def health() -> dict[str, Any]:
    root = _company_root()
    return {
        "status": "ok",
        "component": "digital-company-office-plugin",
        "companyRoot": str(root) if root else None,
        "companyRootFound": bool(root and (root / "company" / "roster.yaml").is_file()),
    }


@router.get("/tasks")
async def tasks() -> dict[str, Any]:
    try:
        items = _hermes_list_tasks()
    except Exception as exc:  # surfaced as OFFLINE in the UI, never a crash
        raise HTTPException(status_code=503, detail=f"Hermes Kanban unavailable: {exc}") from exc
    return {"tasks": items}


@router.get("/blocked-events")
async def blocked_events() -> dict[str, Any]:
    """Events of blocked tasks, so the UI can detect HUMAN_APPROVAL blocks."""
    try:
        blocked = [t for t in _hermes_list_tasks() if t.get("status") == "blocked"][:MAX_BLOCKED_LOOKUPS]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Hermes Kanban unavailable: {exc}") from exc
    out: dict[str, Any] = {}
    for t in blocked:
        tid = str(t.get("id"))
        try:
            out[tid] = _hermes_task_events(tid)
        except Exception:
            out[tid] = None  # degrades to plain BLOCKED
    return {"byTask": out}


@router.get("/tasks/{task_id}/events")
async def task_events(task_id: str) -> dict[str, Any]:
    if not TASK_ID_RE.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    try:
        return {"events": _hermes_task_events(task_id)}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Hermes Kanban unavailable: {exc}") from exc


@router.get("/events")
async def events(since: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=EVENTS_PAGE_MAX)) -> dict[str, Any]:
    try:
        rows = _hermes_events_since(since, limit)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Hermes Kanban unavailable: {exc}") from exc
    return {"events": rows, "cursor": rows[-1]["id"] if rows else since}


@router.get("/usage")
async def usage(
    days: int = Query(7, ge=1, le=365),
    profiles: str = Query("", description="Comma-separated profile names; the default profile is always included"),
) -> dict[str, Any]:
    names = [p for p in (x.strip() for x in profiles.split(",")) if p]
    bad = [p for p in names if not PROFILE_RE.match(p)]
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid profile name(s): {', '.join(bad)}")
    result: dict[str, Any] = {}
    for name in [None, *dict.fromkeys(names)]:
        key = name or "default"
        try:
            result[key] = await _hermes_usage(days, name)
        except Exception as exc:
            result[key] = {"error": str(exc) or exc.__class__.__name__}
    return {"periodDays": days, "byProfile": result}


@router.get("/projects")
async def projects() -> dict[str, Any]:
    """Raw Project Memory files (parsed in the frontend)."""
    root = _company_root()
    if not root:
        return {"projects": [], "error": "digital-company repo not configured (DC_COMPANY_ROOT or config.json)"}
    base = root / "projects"
    if not base.is_dir():
        return {"projects": [], "error": f"Project Memory not found at {base}"}
    items: list[dict[str, Any]] = []
    for d in sorted(p for p in base.iterdir() if p.is_dir() and not p.name.startswith(("_", ".")))[:MAX_PROJECTS]:
        f = d / "PROJECT.md"
        try:
            if f.is_file() and f.stat().st_size <= MAX_PROJECT_BYTES:
                items.append({"dir": d.name, "file": f"projects/{d.name}/PROJECT.md", "text": f.read_text(encoding="utf-8")})
        except OSError:
            continue
    return {"projects": items, "error": None}
