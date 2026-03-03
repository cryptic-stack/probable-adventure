import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from flask import Blueprint, jsonify, render_template, request, send_from_directory

from CTFd.plugins import (
    register_admin_plugin_menu_bar,
    register_admin_plugin_script,
    register_admin_plugin_stylesheet,
    register_plugin_script,
    register_plugin_stylesheet,
)
from CTFd.utils import get_config, set_config
from CTFd.utils.decorators import admins_only, authed_only
from CTFd.utils.user import get_current_team, get_current_user

PLUGIN_NAMESPACE = "team_drive"
CONFIG_KEY = "team_drive_items_v1"


def _scope() -> Dict[str, Any]:
    team = get_current_team()
    user = get_current_user()
    team_id = getattr(team, "id", None)
    user_id = getattr(user, "id", None)
    scope_id = f"team-{team_id}" if team_id else (f"user-{user_id}" if user_id else None)
    return {"team_id": team_id, "user_id": user_id, "scope_id": scope_id}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fileshare_url() -> str:
    return os.getenv("CHALLENGE_FILESHARE_URL", "http://fileshare:8080").rstrip("/")


def _load_items() -> List[Dict[str, Any]]:
    raw = get_config(CONFIG_KEY)
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except ValueError:
        return []
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    return []


def _save_items(rows: List[Dict[str, Any]]) -> None:
    set_config(CONFIG_KEY, json.dumps(rows[-2000:]))


def load(app):
    register_plugin_script("/plugins/team-drive/assets/team_drive.js")
    register_plugin_stylesheet("/plugins/team-drive/assets/team_drive.css")
    register_admin_plugin_script("/plugins/team-drive/assets/team_drive_admin.js")
    register_admin_plugin_stylesheet("/plugins/team-drive/assets/team_drive_admin.css")
    register_admin_plugin_menu_bar("Team Drive", "/plugins/team-drive/admin")

    asset_dir = os.path.join(os.path.dirname(__file__), "assets")

    bp = Blueprint(
        "team_drive",
        __name__,
        url_prefix="/plugins/team-drive",
        template_folder="templates",
    )

    @bp.get("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(asset_dir, filename)

    @bp.get("/health")
    def health():
        return jsonify({"success": True, "data": {"ok": True, "plugin": PLUGIN_NAMESPACE}})

    @bp.get("/files")
    @authed_only
    def files():
        scope = _scope()
        scope_id = scope.get("scope_id")
        if not scope_id:
            return jsonify({"success": False, "error": "No team/user context"}), 400

        rows = [row for row in _load_items() if row.get("scope_id") == scope_id]
        base = _fileshare_url()
        for row in rows:
            rel = str(row.get("path") or "").lstrip("/")
            row["download_url"] = f"{base}/{rel}" if rel else None
        return jsonify({"success": True, "data": {"scope": scope, "items": rows}})

    @bp.post("/files")
    @authed_only
    def upload():
        scope = _scope()
        scope_id = scope.get("scope_id")
        if not scope_id:
            return jsonify({"success": False, "error": "No team/user context"}), 400

        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        path = str(body.get("path") or "").strip()
        notes = str(body.get("notes") or "").strip()
        if not name or not path:
            return jsonify({"success": False, "error": "name and path are required"}), 400

        rows = _load_items()
        next_id = (rows[-1].get("id", 0) if rows else 0) + 1
        item = {
            "id": next_id,
            "scope_id": scope_id,
            "team_id": scope.get("team_id"),
            "user_id": scope.get("user_id"),
            "name": name,
            "path": path,
            "notes": notes,
            "created_at": _now_iso(),
        }
        rows.append(item)
        _save_items(rows)
        return jsonify({"success": True, "data": item})

    @bp.post("/files/<int:item_id>/delete")
    @authed_only
    def delete(item_id: int):
        scope = _scope()
        scope_id = scope.get("scope_id")
        if not scope_id:
            return jsonify({"success": False, "error": "No team/user context"}), 400

        rows = _load_items()
        kept: List[Dict[str, Any]] = []
        deleted = None
        for row in rows:
            if row.get("id") == item_id and row.get("scope_id") == scope_id:
                deleted = row
                continue
            kept.append(row)
        if deleted is None:
            return jsonify({"success": False, "error": "File entry not found"}), 404
        _save_items(kept)
        return jsonify({"success": True, "data": {"deleted": item_id}})

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("team_drive/admin.html")

    @bp.get("/admin/all")
    @admins_only
    def admin_all():
        return jsonify({"success": True, "data": _load_items()})

    app.register_blueprint(bp)
