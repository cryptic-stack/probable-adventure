import os

import requests
from flask import jsonify, render_template, request

from CTFd.admin import admin
from CTFd.models import Challenges, Teams, Users
from CTFd.utils.decorators import admins_only


def _control_url():
    return os.getenv("CHALLENGE_CONTROL_URL", "http://control-service:9001").rstrip("/")


def _control_token():
    return os.getenv("CHALLENGE_CONTROL_TOKEN", "").strip()


def _control_timeout():
    try:
        return float(os.getenv("CHALLENGE_CONTROL_TIMEOUT", "8"))
    except ValueError:
        return 8.0


def _control_headers():
    headers = {}
    token = _control_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _control_request(method, path, payload=None, params=None):
    url = f"{_control_url()}{path}"
    try:
        response = requests.request(
            method=method,
            url=url,
            json=payload,
            params=params,
            headers=_control_headers(),
            timeout=_control_timeout(),
        )
    except requests.RequestException as e:
        return None, 503, f"Control service unavailable: {e}"

    try:
        body = response.json()
    except ValueError:
        return None, 502, f"Control service returned non-JSON response ({response.status_code})"

    if not response.ok or not body.get("success", False):
        error = body.get("error") or f"Control service error ({response.status_code})"
        return None, response.status_code, error
    return body.get("data"), response.status_code, None


@admin.route("/admin/challenge-containers", methods=["GET"])
@admins_only
def challenge_containers():
    return render_template("admin/challenge_containers.html")


@admin.route("/admin/challenge-containers/data", methods=["GET"])
@admins_only
def challenge_containers_data():
    params = {
        "running": request.args.get("running", "true"),
        "managed": request.args.get("managed", "false"),
        "logons": request.args.get("logons", "true"),
    }
    rows, status, error = _control_request("GET", "/containers", params=params)
    if error:
        return jsonify({"success": False, "error": error}), status

    challenge_ids = {r.get("challenge_id") for r in rows if r.get("challenge_id")}
    user_ids = {r.get("user_id") for r in rows if r.get("user_id")}
    team_ids = {r.get("team_id") for r in rows if r.get("team_id")}

    challenge_map = {}
    if challenge_ids:
        challenge_map = {
            c.id: c.name
            for c in Challenges.query.with_entities(Challenges.id, Challenges.name)
            .filter(Challenges.id.in_(challenge_ids))
            .all()
        }

    user_map = {}
    if user_ids:
        user_map = {
            u.id: u.name
            for u in Users.query.with_entities(Users.id, Users.name)
            .filter(Users.id.in_(user_ids))
            .all()
        }

    team_map = {}
    if team_ids:
        team_map = {
            t.id: t.name
            for t in Teams.query.with_entities(Teams.id, Teams.name)
            .filter(Teams.id.in_(team_ids))
            .all()
        }

    for row in rows:
        row["challenge_name"] = challenge_map.get(row.get("challenge_id"))
        row["user_name"] = user_map.get(row.get("user_id"))
        row["team_name"] = team_map.get(row.get("team_id"))

    return jsonify({"success": True, "data": rows})


@admin.route("/admin/challenge-containers/<container_id>/logs", methods=["GET"])
@admins_only
def challenge_container_logs(container_id):
    tail = request.args.get("tail", 300, type=int)
    tail = max(10, min(tail, 2000))
    data, status, error = _control_request(
        "GET", f"/containers/{container_id}/logs", params={"tail": tail}
    )
    if error:
        return jsonify({"success": False, "error": error}), status
    return jsonify({"success": True, "data": data})


@admin.route("/admin/challenge-containers/<container_id>/action", methods=["POST"])
@admins_only
def challenge_container_action(container_id):
    action = (request.get_json(silent=True) or {}).get("action", "").strip().lower()
    if action not in {"restart", "reset", "stop", "remove"}:
        return jsonify({"success": False, "error": "Invalid action"}), 400

    data, status, error = _control_request(
        "POST", f"/containers/{container_id}/action", payload={"action": action}
    )
    if error:
        return jsonify({"success": False, "error": error}), status
    return jsonify({"success": True, "data": data})
