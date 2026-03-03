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

PLUGIN_NAMESPACE = "session_recorder"


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
        return jsonify({"success": True, "data": []})

    @bp.post("/events")
    @authed_only
    def ingest_event():
        return jsonify({"success": False, "error": "Scaffold only: recording ingestion/storage not implemented yet"}), 501

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("session_recorder/admin.html")

    app.register_blueprint(bp)
