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

PLUGIN_NAMESPACE = "team_chat"
CONFIG_KEY = "team_chat_messages_v1"


def _session_identity() -> Dict[str, Any]:
    team = get_current_team()
    user = get_current_user()
    team_id = getattr(team, "id", None)
    user_id = getattr(user, "id", None)
    room = f"team-{team_id}" if team_id else (f"user-{user_id}" if user_id else None)
    return {"team_id": team_id, "user_id": user_id, "room": room}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_messages() -> List[Dict[str, Any]]:
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


def _save_messages(rows: List[Dict[str, Any]]) -> None:
    # Keep storage bounded while still preserving recent history.
    set_config(CONFIG_KEY, json.dumps(rows[-1000:]))


def load(app):
    register_plugin_script("/plugins/team-chat/assets/team_chat.js")
    register_plugin_stylesheet("/plugins/team-chat/assets/team_chat.css")
    register_admin_plugin_script("/plugins/team-chat/assets/team_chat_admin.js")
    register_admin_plugin_stylesheet("/plugins/team-chat/assets/team_chat_admin.css")
    register_admin_plugin_menu_bar("Team Chat", "/plugins/team-chat/admin")

    asset_dir = os.path.join(os.path.dirname(__file__), "assets")

    bp = Blueprint(
        "team_chat",
        __name__,
        url_prefix="/plugins/team-chat",
        template_folder="templates",
    )

    @bp.get("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(asset_dir, filename)

    @bp.get("/health")
    def health():
        return jsonify({"success": True, "data": {"ok": True, "plugin": PLUGIN_NAMESPACE}})

    @bp.get("/room")
    @authed_only
    def room():
        return jsonify({"success": True, "data": _session_identity()})

    @bp.get("/messages")
    @authed_only
    def messages():
        identity = _session_identity()
        room = identity.get("room")
        if not room:
            return jsonify({"success": False, "error": "No team/user context"}), 400

        try:
            limit = int((request.args.get("limit") or "100").strip())
        except ValueError:
            limit = 100
        limit = max(1, min(limit, 500))

        rows = [row for row in _load_messages() if row.get("room") == room]
        return jsonify({"success": True, "data": rows[-limit:]})

    @bp.post("/messages")
    @authed_only
    def post_message():
        identity = _session_identity()
        room = identity.get("room")
        if not room:
            return jsonify({"success": False, "error": "No team/user context"}), 400

        body = request.get_json(silent=True) or {}
        text = str(body.get("text") or "").strip()
        if not text:
            return jsonify({"success": False, "error": "Message text is required"}), 400
        if len(text) > 2000:
            return jsonify({"success": False, "error": "Message too long (max 2000 chars)"}), 400

        user = get_current_user()
        rows = _load_messages()
        next_id = (rows[-1].get("id", 0) if rows else 0) + 1
        message = {
            "id": next_id,
            "room": room,
            "text": text,
            "user_id": identity.get("user_id"),
            "team_id": identity.get("team_id"),
            "username": getattr(user, "name", None),
            "created_at": _now_iso(),
        }
        rows.append(message)
        _save_messages(rows)
        return jsonify({"success": True, "data": message})

    @bp.get("/admin/rooms")
    @admins_only
    def admin_rooms():
        counts: Dict[str, int] = {}
        for row in _load_messages():
            room = str(row.get("room") or "")
            if room:
                counts[room] = counts.get(room, 0) + 1
        return jsonify({"success": True, "data": counts})

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("team_chat/admin.html")

    app.register_blueprint(bp)
