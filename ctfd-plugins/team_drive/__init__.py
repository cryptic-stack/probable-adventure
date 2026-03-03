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

PLUGIN_NAMESPACE = "team_drive"


def _scope() -> Dict[str, Any]:
    team = get_current_team()
    user = get_current_user()
    return {"team_id": getattr(team, "id", None), "user_id": getattr(user, "id", None)}


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
        return jsonify({"success": True, "data": {"scope": _scope(), "items": []}})

    @bp.post("/files")
    @authed_only
    def upload():
        return jsonify({"success": False, "error": "Scaffold only: upload pipeline not implemented yet"}), 501

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("team_drive/admin.html")

    app.register_blueprint(bp)
