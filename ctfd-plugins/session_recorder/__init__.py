import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request, render_template, send_from_directory

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

PLUGIN_NAMESPACE = "session_recorder"
CONFIG_KEY = "session_recorder_events_v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scope() -> Dict[str, Any]:
    team = get_current_team()
    user = get_current_user()
    return {
        "team_id": getattr(team, "id", None),
        "user_id": getattr(user, "id", None),
        "is_admin": getattr(user, "type", "") == "admin",
    }


def _load_events() -> List[Dict[str, Any]]:
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


def _save_events(rows: List[Dict[str, Any]]) -> None:
    set_config(CONFIG_KEY, json.dumps(rows[-5000:]))


def load(app):
    register_plugin_script("/plugins/session-recorder/assets/session_recorder.js")
    register_plugin_stylesheet("/plugins/session-recorder/assets/session_recorder.css")
    register_admin_plugin_script("/plugins/session-recorder/assets/session_recorder_admin.js")
    register_admin_plugin_stylesheet("/plugins/session-recorder/assets/session_recorder_admin.css")
    register_admin_plugin_menu_bar("Session Recorder", "/plugins/session-recorder/admin")

    asset_dir = os.path.join(os.path.dirname(__file__), "assets")

    bp = Blueprint(
        "session_recorder",
        __name__,
        url_prefix="/plugins/session-recorder",
        template_folder="templates",
    )

    @bp.get("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(asset_dir, filename)

    @bp.get("/health")
    def health():
        return jsonify({"success": True, "data": {"ok": True, "plugin": PLUGIN_NAMESPACE}})

    @bp.get("/events")
    @authed_only
    def events():
        scope = _scope()
        rows = _load_events()

        challenge_id = str(request.args.get("challenge_id") or "").strip()
        session_id = str(request.args.get("session_id") or "").strip()
        try:
            limit = int((request.args.get("limit") or "200").strip())
        except ValueError:
            limit = 200
        limit = max(1, min(limit, 1000))

        filtered: List[Dict[str, Any]] = []
        for row in rows:
            if challenge_id and str(row.get("challenge_id")) != challenge_id:
                continue
            if session_id and str(row.get("session_id")) != session_id:
                continue
            if not scope.get("is_admin"):
                team_match = scope.get("team_id") and row.get("team_id") == scope.get("team_id")
                user_match = scope.get("user_id") and row.get("user_id") == scope.get("user_id")
                if not (team_match or user_match):
                    continue
            filtered.append(row)

        return jsonify({"success": True, "data": filtered[-limit:]})

    @bp.post("/events")
    @authed_only
    def ingest_event():
        body = request.get_json(silent=True) or {}
        challenge_id = body.get("challenge_id")
        session_id = str(body.get("session_id") or "").strip()
        event_type = str(body.get("event_type") or "").strip()
        payload = body.get("payload", {})

        if not challenge_id or not session_id or not event_type:
            return jsonify({"success": False, "error": "challenge_id, session_id, and event_type are required"}), 400

        scope = _scope()
        rows = _load_events()
        next_id = (rows[-1].get("id", 0) if rows else 0) + 1
        event = {
            "id": next_id,
            "challenge_id": challenge_id,
            "session_id": session_id,
            "event_type": event_type,
            "payload": payload if isinstance(payload, (dict, list, str, int, float, bool)) or payload is None else str(payload),
            "team_id": scope.get("team_id"),
            "user_id": scope.get("user_id"),
            "created_at": _now_iso(),
        }
        rows.append(event)
        _save_events(rows)
        return jsonify({"success": True, "data": event})

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("session_recorder/admin.html")

    app.register_blueprint(bp)
