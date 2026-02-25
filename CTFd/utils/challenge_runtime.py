import json
import os
from typing import Any, Dict, List, Optional, Tuple

import requests

from CTFd.models import Flags

ACCESS_SCHEMA = "ctfd-access-v1"


def parse_connection_info(connection_info: Optional[str]) -> Dict[str, Any]:
    raw = (connection_info or "").strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    if payload.get("schema") != ACCESS_SCHEMA:
        return {}
    return payload


def _control_url() -> str:
    return os.getenv("CHALLENGE_CONTROL_URL", "http://control-service:9001").rstrip("/")


def _control_token() -> str:
    return os.getenv("CHALLENGE_CONTROL_TOKEN", "").strip()


def _control_timeout() -> float:
    try:
        return float(os.getenv("CHALLENGE_CONTROL_TIMEOUT", "8"))
    except ValueError:
        return 8.0


def _control_request(
    method: str, path: str, payload: Optional[Dict[str, Any]] = None
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    headers = {}
    token = _control_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.request(
            method=method,
            url=f"{_control_url()}{path}",
            json=payload,
            headers=headers,
            timeout=_control_timeout(),
        )
    except requests.RequestException as e:
        return None, f"control-service unavailable: {e}"

    try:
        body = response.json()
    except ValueError:
        return None, f"control-service non-json response ({response.status_code})"

    if not response.ok or not body.get("success", False):
        return None, body.get("error") or f"control-service error ({response.status_code})"
    return body.get("data"), None


def _provision_payload(challenge, flag_value: Optional[str] = None) -> Optional[Dict[str, Any]]:
    connection = parse_connection_info(challenge.connection_info)
    provision = connection.get("provision") if isinstance(connection, dict) else None
    if not isinstance(provision, dict):
        return None
    if not provision.get("enabled"):
        return None

    image = (provision.get("image") or "").strip()
    if not image:
        return None

    access_type = (connection.get("type") or "terminal").strip().lower()

    internal_port = provision.get("internal_port")
    try:
        internal_port = int(internal_port) if internal_port not in (None, "") else None
    except (TypeError, ValueError):
        internal_port = None
    if internal_port is None and access_type == "terminal":
        # Default web terminal port used by the lab base image (ttyd).
        internal_port = 7681

    return {
        "image": image,
        "flag": flag_value if flag_value is not None else (provision.get("flag") or ""),
        "internal_port": internal_port,
        "startup_command": (provision.get("startup_command") or "").strip() or None,
        "access_type": access_type,
    }


def _challenge_flag(challenge_id: int) -> Optional[str]:
    # Prefer static flags when available.
    static_flag = (
        Flags.query.filter_by(challenge_id=challenge_id, type="static")
        .order_by(Flags.id.asc())
        .first()
    )
    if static_flag is not None:
        return static_flag.content

    any_flag = (
        Flags.query.filter_by(challenge_id=challenge_id)
        .order_by(Flags.id.asc())
        .first()
    )
    if any_flag is not None:
        return any_flag.content
    return None


def ensure_challenge_container_provisioned(challenge) -> Tuple[bool, Optional[str]]:
    payload = _provision_payload(challenge, flag_value=_challenge_flag(challenge.id))
    if not payload:
        return False, None
    _, error = _control_request("PUT", f"/challenges/{challenge.id}/provision", payload=payload)
    if error:
        return False, error
    return True, None


def activate_challenge_container(challenge) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    connection = parse_connection_info(challenge.connection_info)
    payload = _provision_payload(challenge, flag_value=_challenge_flag(challenge.id))
    if not payload:
        # Fallback for non-provisioned remote endpoints
        if connection:
            return {
                "url": connection.get("url"),
                "host": connection.get("host"),
                "port": connection.get("port"),
                "access_type": connection.get("type"),
            }, None
        return None, "challenge does not define connection settings"
    data, error = _control_request(
        "POST", f"/challenges/{challenge.id}/activate", payload=payload
    )
    if error:
        return None, error
    return data, None


def _autograde_payload(challenge) -> Optional[Dict[str, Any]]:
    connection = parse_connection_info(challenge.connection_info)
    autograde = connection.get("autograde") if isinstance(connection, dict) else None
    if not isinstance(autograde, dict):
        return None
    if not autograde.get("enabled"):
        return None

    commands = autograde.get("commands")
    if not isinstance(commands, list):
        commands = []
    expected: List[str] = [str(cmd).strip() for cmd in commands if str(cmd).strip()]
    if not expected:
        expected = _infer_autograde_commands(challenge)
    if not expected:
        return None
    return {"commands": expected}


def _infer_autograde_commands(challenge) -> List[str]:
    text = " ".join(
        [
            getattr(challenge, "name", "") or "",
            getattr(challenge, "description", "") or "",
        ]
    ).lower()

    if "current working directory" in text or " with pwd" in text:
        return ["pwd"]
    if "logged in as" in text or "whoami" in text:
        return ["whoami"]
    if "long directory listing" in text:
        return ["ls -l"]
    if "include hidden files" in text:
        return ["ls -la"]
    if "list the current directory contents" in text:
        return ["ls"]
    if "create a new file with touch" in text:
        return ["touch"]
    return []


def attempt_runtime_autograde(
    challenge,
) -> Tuple[bool, Optional[str], Optional[str]]:
    payload = _autograde_payload(challenge)
    if not payload:
        return False, None, None

    data, error = _control_request(
        "POST", f"/challenges/{challenge.id}/autograde", payload=payload
    )
    if error:
        return False, None, error
    if not data:
        return False, None, None
    if not data.get("matched"):
        return False, None, None
    return True, data.get("message"), None
