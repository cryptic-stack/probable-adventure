import os
from flask import Blueprint, jsonify, render_template, send_from_directory

from CTFd.plugins import (
    register_admin_plugin_menu_bar,
    register_admin_plugin_script,
    register_admin_plugin_stylesheet,
    register_plugin_script,
    register_plugin_stylesheet,
)
from CTFd.utils.decorators import admins_only, authed_only

PLUGIN_NAMESPACE = "shared_terminal"


def load(app):
    register_plugin_script("/plugins/shared-terminal/assets/shared_terminal.js")
    register_plugin_stylesheet("/plugins/shared-terminal/assets/shared_terminal.css")
    register_admin_plugin_script("/plugins/shared-terminal/assets/shared_terminal_admin.js")
    register_admin_plugin_stylesheet("/plugins/shared-terminal/assets/shared_terminal_admin.css")
    register_admin_plugin_menu_bar("Shared Terminal", "/plugins/shared-terminal/admin")

    asset_dir = os.path.join(os.path.dirname(__file__), "assets")

    bp = Blueprint(
        "shared_terminal",
        __name__,
        url_prefix="/plugins/shared-terminal",
        template_folder="templates",
    )

    @bp.get("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(asset_dir, filename)

    @bp.get("/health")
    def health():
        return jsonify({"success": True, "data": {"ok": True, "plugin": PLUGIN_NAMESPACE}})

    @bp.get("/locks")
    @authed_only
    def locks():
        return jsonify({"success": True, "data": []})

    @bp.post("/locks")
    @authed_only
    def acquire_lock():
        return jsonify({"success": False, "error": "Scaffold only: collaborative control lock manager not implemented yet"}), 501

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("shared_terminal/admin.html")

    app.register_blueprint(bp)
