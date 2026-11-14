"""Digital Company Virtual Office.

Dashboard-only plugin: the UI lives in ``dashboard/`` (manifest.json,
dist/index.js, plugin_api.py). Hermes requires an enabled user plugin to
have ``plugin.yaml`` and an importable ``__init__.py``; this module
intentionally registers nothing (no tools, hooks or commands).
"""


def register(ctx):  # noqa: D401 - Hermes plugin entry point
    """No-op: the plugin only extends the Dashboard."""
    return None
