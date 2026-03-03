import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

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

PLUGIN_NAMESPACE = "shared_terminal"
CONFIG_KEY = "shared_terminal_locks_v1"


def _actor() -> Dict[str, Any]:
    team = get_current_team()
    user = get_current_user()
    team_id = getattr(team, "id", None)
    user_id = getattr(user, "id", None)
    actor_id = f"team-{team_id}" if team_id else (f"user-{user_id}" if user_id else None)
    return {"team_id": team_id, "user_id": user_id, "actor_id": actor_id, "username": getattr(user, "name", None)}


def _load_locks() -> Dict[str, Any]:
    raw = get_config(CONFIG_KEY)
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _save_locks(rows: Dict[str, Any]) -> None:
    set_config(CONFIG_KEY, json.dumps(rows))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_active(lock: Dict[str, Any]) -> bool:
    expires_at = str(lock.get("expires_at") or "")
    if not expires_at:
        return False
    try:
        dt = datetime.fromisoformat(expires_at)
    except ValueError:
        return False
    return dt > _now()


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
        challenge_id = str(request.args.get("challenge_id") or "").strip()
        session_id = str(request.args.get("session_id") or "").strip()
        if not challenge_id or not session_id:
            return jsonify({"success": False, "error": "challenge_id and session_id are required"}), 400

        key = f"{challenge_id}:{session_id}"
        lock = _load_locks().get(key)
        if isinstance(lock, dict) and _is_active(lock):
            return jsonify({"success": True, "data": lock})
        return jsonify({"success": True, "data": None})

    @bp.post("/locks")
    @authed_only
    def acquire_lock():
        body = request.get_json(silent=True) or {}
        challenge_id = str(body.get("challenge_id") or "").strip()
        session_id = str(body.get("session_id") or "").strip()
        action = str(body.get("action") or "acquire").strip().lower()
        if not challenge_id or not session_id:
            return jsonify({"success": False, "error": "challenge_id and session_id are required"}), 400
        if action not in {"acquire", "release"}:
            return jsonify({"success": False, "error": "action must be acquire or release"}), 400

        actor = _actor()
        actor_id = actor.get("actor_id")
        if not actor_id:
            return jsonify({"success": False, "error": "No team/user context"}), 400

        key = f"{challenge_id}:{session_id}"
        locks = _load_locks()
        existing = locks.get(key) if isinstance(locks.get(key), dict) else None

        if action == "release":
            if existing and existing.get("actor_id") == actor_id:
                locks.pop(key, None)
                _save_locks(locks)
                return jsonify({"success": True, "data": {"released": True}})
            return jsonify({"success": False, "error": "No lock owned by current actor"}), 409

        if existing and _is_active(existing) and existing.get("actor_id") != actor_id:
            return jsonify({"success": False, "error": "Lock is currently held by another actor", "data": existing}), 409

        try:
            ttl_seconds = int(body.get("ttl_seconds") or 300)
        except ValueError:
            ttl_seconds = 300
        ttl_seconds = max(30, min(ttl_seconds, 3600))

        lock = {
            "challenge_id": challenge_id,
            "session_id": session_id,
            "actor_id": actor_id,
            "team_id": actor.get("team_id"),
            "user_id": actor.get("user_id"),
            "username": actor.get("username"),
            "acquired_at": _now().isoformat(),
            "expires_at": (_now() + timedelta(seconds=ttl_seconds)).isoformat(),
        }
        locks[key] = lock
        _save_locks(locks)
        return jsonify({"success": True, "data": lock})

    @bp.get("/admin")
    @admins_only
    def admin():
        return render_template("shared_terminal/admin.html")

    app.register_blueprint(bp)
