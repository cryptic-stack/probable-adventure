import json
import os
from typing import Any, Dict, Optional

import requests
from flask import Blueprint, jsonify, redirect, render_template, request, send_from_directory

from CTFd.models import Challenges
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

PLUGIN_NAMESPACE = "runtime_bridge"
CONFIG_KEY = "runtime_profiles_v1"

DEFAULT_IMAGE_CATALOG: Dict[str, Any] = {
    "version": 1,
    "images": [
        {
            "id": "ubuntu-terminal",
            "name": "Ubuntu Terminal Base",
            "description": "General purpose terminal lab with bash, curl, nano, tshark, ttyd.",
            "image": "{runtime_image_namespace}/probable-adventure-lab-base:latest",
            "default_profile": {
                "type": "terminal",
                "internal_port": 7681,
                "startup_command": "",
                "environment": {},
            },
        },
        {
            "id": "windows-rdp",
            "name": "Windows RDP (Dockur)",
            "description": "Windows desktop in containerized QEMU, requires KVM-capable host.",
            "image": "{runtime_image_namespace}/probable-adventure-windows-rdp:latest",
            "default_profile": {
                "type": "rdp",
                "internal_port": 8006,
                "environment": {
                    "VERSION": "11",
                    "RAM_SIZE": "6G",
                    "CPU_CORES": "4",
                    "DISK_SIZE": "64G",
                },
                "privileged": True,
                "devices": ["/dev/kvm:/dev/kvm"],
            },
        },
        {
            "id": "kali-terminal",
            "name": "Kali Terminal",
            "description": "Kali-based terminal lab with bash, curl, nano, tshark, ttyd.",
            "image": "{runtime_image_namespace}/probable-adventure-kali-terminal:latest",
            "default_profile": {
                "type": "terminal",
                "internal_port": 7681,
                "startup_command": "",
                "environment": {},
            },
        },
        {
            "id": "forensics-terminal",
            "name": "Forensics Terminal",
            "description": "Forensics terminal lab with sleuthkit, yara, tshark, and volatility3.",
            "image": "{runtime_image_namespace}/probable-adventure-forensics-terminal:latest",
            "default_profile": {
                "type": "terminal",
                "internal_port": 7681,
                "startup_command": "",
                "environment": {},
            },
        },
    ],
}


def _runtime_image_namespace() -> str:
    return os.getenv("RUNTIME_IMAGE_NAMESPACE", "ghcr.io/your-org").strip().rstrip("/")


def _default_runtime_image() -> str:
    return os.getenv(
        "CHALLENGE_DEFAULT_IMAGE",
        f"{_runtime_image_namespace()}/probable-adventure-lab-base:latest",
    ).strip()


def _resolve_catalog_value(value: Any, namespace: str) -> Any:
    if isinstance(value, str):
        return value.replace("{runtime_image_namespace}", namespace)
    if isinstance(value, list):
        return [_resolve_catalog_value(v, namespace) for v in value]
    if isinstance(value, dict):
        return {k: _resolve_catalog_value(v, namespace) for k, v in value.items()}
    return value


def _load_image_catalog() -> Dict[str, Any]:
    catalog_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "images", "catalog.json")
    )
    try:
        with open(catalog_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        payload = dict(DEFAULT_IMAGE_CATALOG)
    if not isinstance(payload, dict):
        payload = {}
    images = payload.get("images")
    if not isinstance(images, list):
        images = []
    namespace = _runtime_image_namespace()
    payload["images"] = [
        _resolve_catalog_value(row, namespace) for row in images if isinstance(row, dict) and row.get("id")
    ]
    return payload


def _control_base() -> str:
    return os.getenv("CHALLENGE_CONTROL_URL", "http://control-service:9001").rstrip("/")


def _control_token() -> str:
    return os.getenv("CHALLENGE_CONTROL_TOKEN", "").strip()


def _control_headers() -> Dict[str, str]:
    token = _control_token()
    return {"Authorization": f"Bearer {token}"} if token else {}


def _control_request(method: str, path: str, payload: Optional[Dict[str, Any]] = None):
    try:
        response = requests.request(
            method=method,
            url=f"{_control_base()}{path}",
            json=payload,
            headers=_control_headers(),
            timeout=8,
        )
    except requests.RequestException as exc:
        return None, f"control-service unavailable: {exc}", 503

    try:
        body = response.json()
    except ValueError:
        return None, "control-service non-json response", 502
    if not response.ok or not body.get("success", False):
        return None, body.get("error") or "control-service error", response.status_code
    return body.get("data"), None, 200


def _session_context() -> Dict[str, Optional[Any]]:
    user = get_current_user()
    team = get_current_team()
    user_id = getattr(user, "id", None)
    team_id = getattr(team, "id", None)
    if team_id:
        session_id = f"team-{int(team_id)}"
    elif user_id:
        session_id = f"user-{int(user_id)}"
    else:
        session_id = None
    return {"user_id": user_id, "team_id": team_id, "session_id": session_id}


def _load_profiles() -> Dict[str, Any]:
    raw = get_config(CONFIG_KEY)
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            return payload
    except ValueError:
        pass
    return {}


def _save_profiles(profiles: Dict[str, Any]) -> None:
    set_config(CONFIG_KEY, json.dumps(profiles))


def _challenge_profile(challenge_id: int) -> Optional[Dict[str, Any]]:
    profiles = _load_profiles()
    profile = profiles.get(str(challenge_id))
    return profile if isinstance(profile, dict) else None


def _render_templates(value: Any, fields: Dict[str, Any]) -> Any:
    if isinstance(value, str):
        rendered = value
        for key, raw in fields.items():
            rendered = rendered.replace(f"{{{key}}}", str(raw))
        return rendered
    if isinstance(value, list):
        return [_render_templates(v, fields) for v in value]
    if isinstance(value, dict):
        return {k: _render_templates(v, fields) for k, v in value.items()}
    return value


def _normalize_access(challenge_id: int, session_id: str, connection: Dict[str, Any], access_type: str):
    data = dict(connection or {})
    internal_port = data.get("internal_port")
    host_port = data.get("host_port")
    access = (access_type or data.get("access_type") or "terminal").strip().lower()
    if access == "terminal":
        proxy = f"/terminal/{challenge_id}/{session_id}/"
        data["url"] = proxy
        data["embed_url"] = proxy
        data["external_url"] = proxy
    elif access == "rdp":
        embed = f"/desktop/{challenge_id}/{session_id}/{internal_port}/" if internal_port else None
        data["embed_url"] = embed
        data["url"] = embed
        if host_port:
            data["external_url"] = f"rdp://localhost:{host_port}"
        else:
            data["external_url"] = embed
    else:
        embed = f"/desktop/{challenge_id}/{session_id}/{internal_port}/" if internal_port else None
        data["embed_url"] = embed
        data["url"] = embed
        data["external_url"] = embed
    return data


def _render_profile_for_session(profile: Dict[str, Any], challenge_id: int, session_id: str) -> Dict[str, Any]:
    return _render_templates(
        profile,
        {
            "challenge_id": challenge_id,
            "session_id": session_id,
            "team_id": "",
            "user_id": "",
        },
    )


def load(app):
    register_plugin_script("/plugins/runtime/assets/runtime_bridge.js")
    register_plugin_stylesheet("/plugins/runtime/assets/runtime_bridge.css")
    register_admin_plugin_script("/plugins/runtime/assets/runtime_admin.js")
    register_admin_plugin_stylesheet("/plugins/runtime/assets/runtime_admin.css")
    register_admin_plugin_menu_bar("Runtime", "/plugins/runtime/admin")

    asset_dir = os.path.join(os.path.dirname(__file__), "assets")

    def _serve_asset(filename: str):
        return send_from_directory(asset_dir, filename)

    # Backward-compatible asset URL support if old paths are still cached/registered.
    if "runtime_bridge_legacy_assets" not in app.view_functions:
        app.add_url_rule(
            "/CTFd/plugins/runtime_bridge/assets/<path:filename>",
            endpoint="runtime_bridge_legacy_assets",
            view_func=_serve_asset,
        )
    if "runtime_bridge_legacy_admin_link" not in app.view_functions:
        app.add_url_rule(
            "/admin/plugins/runtime/admin",
            endpoint="runtime_bridge_legacy_admin_link",
            view_func=lambda: redirect("/plugins/runtime/admin"),
        )

    bp = Blueprint(
        "runtime_bridge",
        __name__,
        url_prefix="/plugins/runtime",
        template_folder="templates",
    )

    @bp.get("/assets/<path:filename>")
    def assets(filename: str):
        return _serve_asset(filename)

    @bp.get("/admin")
    @admins_only
    def admin_panel():
        profiles = _load_profiles()
        default_image = _default_runtime_image()
        image_catalog = _load_image_catalog()
        rows = []
        for challenge in Challenges.query.order_by(Challenges.id.asc()).all():
            profile = profiles.get(str(challenge.id))
            rows.append(
                {
                    "id": challenge.id,
                    "name": challenge.name,
                    "profile": profile,
                    "runtime_enabled": bool(profile),
                }
            )
        return render_template(
            "runtime_bridge/admin.html",
            rows=rows,
            profiles=profiles,
            default_image=default_image,
            image_catalog=image_catalog,
        )

    @bp.get("/health")
    def health():
        return jsonify({"success": True, "data": {"ok": True, "plugin": PLUGIN_NAMESPACE}})

    @bp.get("/catalog")
    @authed_only
    def image_catalog():
        return jsonify({"success": True, "data": _load_image_catalog()})

    @bp.get("/capabilities")
    @authed_only
    def capabilities():
        data, error, status = _control_request("GET", "/capabilities")
        if error:
            return jsonify({"success": False, "error": error}), status
        return jsonify({"success": True, "data": data})

    @bp.get("/challenges")
    @authed_only
    def challenge_profiles():
        profiles = _load_profiles()
        rows = []
        for challenge in Challenges.query.all():
            profile = profiles.get(str(challenge.id))
            rows.append(
                {
                    "id": challenge.id,
                    "name": challenge.name,
                    "runtime_enabled": bool(profile),
                    "profile": profile,
                }
            )
        return jsonify({"success": True, "data": rows})

    @bp.post("/challenges/<int:challenge_id>/connect")
    @authed_only
    def challenge_connect(challenge_id: int):
        profile = _challenge_profile(challenge_id)
        if not profile:
            return jsonify({"success": False, "error": "No runtime profile configured"}), 400

        session = _session_context()
        session_id = session.get("session_id")
        if not session_id:
            return jsonify({"success": False, "error": "No user/team session context"}), 400

        rendered = _render_templates(
            profile,
            {
                "challenge_id": challenge_id,
                "session_id": session_id,
                "team_id": session.get("team_id") or "",
                "user_id": session.get("user_id") or "",
            },
        )
        payload = {
            "session_id": session_id,
            "user_id": session.get("user_id"),
            "team_id": session.get("team_id"),
            "image": rendered.get("image"),
            "internal_port": rendered.get("internal_port"),
            "access_type": rendered.get("type", "terminal"),
            "startup_command": rendered.get("startup_command"),
            "environment": rendered.get("environment", {}),
            "privileged": bool(rendered.get("privileged", False)),
            "cap_add": rendered.get("cap_add", []),
            "devices": rendered.get("devices", []),
            "volume_mounts": rendered.get("volume_mounts", []),
        }
        data, error, status = _control_request("POST", f"/challenges/{challenge_id}/activate", payload)
        if error:
            return jsonify({"success": False, "error": error}), status
        normalized = _normalize_access(challenge_id, session_id, data or {}, payload["access_type"])
        return jsonify({"success": True, "data": normalized})

    @bp.post("/challenges/<int:challenge_id>/session")
    @authed_only
    def challenge_session_action(challenge_id: int):
        body = request.get_json(silent=True) or {}
        action = (body.get("action") or "").strip().lower()
        if action not in {"start", "stop", "reset", "remove"}:
            return jsonify({"success": False, "error": "Invalid action"}), 400

        profile = _challenge_profile(challenge_id)
        if not profile:
            return jsonify({"success": False, "error": "No runtime profile configured"}), 400

        session = _session_context()
        session_id = session.get("session_id")
        if not session_id:
            return jsonify({"success": False, "error": "No user/team session context"}), 400

        rendered = _render_templates(
            profile,
            {
                "challenge_id": challenge_id,
                "session_id": session_id,
                "team_id": session.get("team_id") or "",
                "user_id": session.get("user_id") or "",
            },
        )
        payload = {
            "action": action,
            "session_id": session_id,
            "user_id": session.get("user_id"),
            "team_id": session.get("team_id"),
            "image": rendered.get("image"),
            "internal_port": rendered.get("internal_port"),
            "access_type": rendered.get("type", "terminal"),
            "startup_command": rendered.get("startup_command"),
            "environment": rendered.get("environment", {}),
            "privileged": bool(rendered.get("privileged", False)),
            "cap_add": rendered.get("cap_add", []),
            "devices": rendered.get("devices", []),
            "volume_mounts": rendered.get("volume_mounts", []),
        }
        data, error, status = _control_request(
            "POST",
            f"/challenges/{challenge_id}/sessions/{session_id}/action",
            payload,
        )
        if error:
            return jsonify({"success": False, "error": error}), status
        connection = (data or {}).get("connection", {})
        normalized = _normalize_access(challenge_id, session_id, connection or {}, payload["access_type"])
        return jsonify({"success": True, "data": normalized})

    @bp.get("/profiles")
    @admins_only
    def list_profiles():
        return jsonify({"success": True, "data": _load_profiles()})

    @bp.get("/challenges/<int:challenge_id>/sessions")
    @admins_only
    def list_sessions(challenge_id: int):
        data, error, status = _control_request("GET", f"/challenges/{challenge_id}/sessions")
        if error:
            return jsonify({"success": False, "error": error}), status
        rows = []
        for row in (data or []):
            session_id = row.get("session_id")
            if not session_id:
                continue
            rows.append(_normalize_access(challenge_id, session_id, row, row.get("access_type", "terminal")))
        return jsonify({"success": True, "data": rows})

    @bp.post("/profiles/<int:challenge_id>")
    @admins_only
    def upsert_profile(challenge_id: int):
        body = request.get_json(silent=True) or {}
        required = ("internal_port", "type")
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({"success": False, "error": f"Missing fields: {', '.join(missing)}"}), 400
        if not body.get("image"):
            body["image"] = _default_runtime_image()

        profiles = _load_profiles()
        profiles[str(challenge_id)] = body
        _save_profiles(profiles)
        return jsonify({"success": True, "data": profiles[str(challenge_id)]})

    @bp.post("/admin/challenges/<int:challenge_id>/sessions/<session_id>/action")
    @admins_only
    def admin_session_action(challenge_id: int, session_id: str):
        body = request.get_json(silent=True) or {}
        action = (body.get("action") or "").strip().lower()
        if action not in {"start", "stop", "reset", "remove"}:
            return jsonify({"success": False, "error": "Invalid action"}), 400

        profile = _challenge_profile(challenge_id)
        if not profile:
            return jsonify({"success": False, "error": "No runtime profile configured"}), 400

        rendered = _render_profile_for_session(profile, challenge_id, session_id)
        payload = {
            "action": action,
            "session_id": session_id,
            "image": rendered.get("image"),
            "internal_port": rendered.get("internal_port"),
            "access_type": rendered.get("type", "terminal"),
            "startup_command": rendered.get("startup_command"),
            "environment": rendered.get("environment", {}),
            "privileged": bool(rendered.get("privileged", False)),
            "cap_add": rendered.get("cap_add", []),
            "devices": rendered.get("devices", []),
            "volume_mounts": rendered.get("volume_mounts", []),
        }
        data, error, status = _control_request(
            "POST",
            f"/challenges/{challenge_id}/sessions/{session_id}/action",
            payload,
        )
        if error:
            return jsonify({"success": False, "error": error}), status
        connection = (data or {}).get("connection", {})
        normalized = _normalize_access(challenge_id, session_id, connection or {}, payload["access_type"])
        return jsonify({"success": True, "data": normalized})

    app.register_blueprint(bp)
