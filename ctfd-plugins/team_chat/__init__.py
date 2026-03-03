import os
from typing import Any, Dict

from flask import Blueprint, jsonify, render_template, send_from_directory

from CTFd.plugins import (
    register_admin_plugin_menu_bar,
    register_admin_plugin_script,
    register_admin_plugin_stylesheet,
    register_plugin_script,
    register_plugin_stylesheet,
)
from CTFd.utils.decorators import admins_only, authed_only
from CTFd.utils.user import get_current_team, get_current_user

PLUGIN_NAMESPACE = "team_chat"


def _session_identity() -> Dict[str, Any]:
    team = get_current_team()
    user = get_current_user()
    team_id = getattr(team, "id", None)
    user_id = getattr(user, "id", None)
    room = f"team-{team_id}" if team_id else (f"user-{user_id}" if user_id else None)
    return {"team_id": team_id, "user_id": user_id, "room": room}


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
        return jsonify({"success": True, "data": []})

    @bp.post("/messages")
    @authed_only
    def post_message():
        return jsonify({"success": False, "error": "Scaffold only: persistence/realtime broadcast not implemented yet"}), 501

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("team_chat/admin.html")

    app.register_blueprint(bp)
