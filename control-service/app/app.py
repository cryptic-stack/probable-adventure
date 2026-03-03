import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import docker
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Container Control Service")


@app.exception_handler(HTTPException)
def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=int(exc.status_code), content={"success": False, "error": str(exc.detail)})


@app.exception_handler(Exception)
def unhandled_exception_handler(request: Request, exc: Exception):
    message = getattr(exc, "detail", None) or str(exc) or exc.__class__.__name__
    status = 500
    if isinstance(exc, HTTPException):
        status = int(exc.status_code)
    return JSONResponse(status_code=status, content={"success": False, "error": message})


class RuntimePayload(BaseModel):
    image: Optional[str] = None
    flag: Optional[str] = None
    internal_port: Optional[int] = None
    startup_command: Optional[str] = None
    access_type: Optional[str] = None
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    session_id: Optional[str] = None
    environment: Optional[Dict[str, str]] = None
    privileged: Optional[bool] = None
    devices: Optional[List[str]] = None
    cap_add: Optional[List[str]] = None
    volume_mounts: Optional[List[str]] = None


class ActionPayload(RuntimePayload):
    action: str


def _required_token() -> str:
    return os.getenv("CONTROL_SERVICE_TOKEN", "").strip()


def _auth(authorization: Optional[str]) -> None:
    expected = _required_token()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    actual = authorization.split(" ", 1)[1].strip()
    if actual != expected:
        raise HTTPException(status_code=403, detail="Invalid token")


def _docker():
    try:
        client = docker.from_env()
        client.ping()
        return client
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Docker unavailable: {exc}")


def _sanitize_session_id(session_id: Optional[str]) -> str:
    raw = (session_id or "").strip().lower()
    raw = re.sub(r"[^a-z0-9_-]", "-", raw)
    return raw.strip("-")


def _container_name(challenge_id: int, session_id: str) -> str:
    return f"ctfd-challenge-{challenge_id}-session-{session_id}-lab"


def _find_container(client, challenge_id: int, session_id: str):
    name = _container_name(challenge_id, session_id)
    for container in client.containers.list(all=True):
        if container.name == name:
            return container
    return None


def _runtime_network() -> Optional[str]:
    return os.getenv("CHALLENGE_RUNTIME_NETWORK", "").strip() or None


def _default_runtime_image() -> Optional[str]:
    image = os.getenv("CHALLENGE_DEFAULT_IMAGE", "").strip()
    return image or None


def _default_fileshare_url() -> Optional[str]:
    url = os.getenv("CHALLENGE_FILESHARE_URL", "").strip()
    return url or None


def _default_volume_mounts() -> List[str]:
    raw = os.getenv("CHALLENGE_DEFAULT_VOLUME_MOUNTS", "").strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _expose_ports() -> bool:
    return os.getenv("CHALLENGE_EXPOSE_HOST_PORTS", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _build_command(access_type: str, startup_command: Optional[str], internal_port: int) -> Optional[List[str]]:
    startup = (startup_command or "").strip()
    if access_type == "terminal":
        # Requires ttyd in the session image.
        script = (
            "mkdir -p /opt/ctf; "
            "printf '%s' \"$FLAG\" > /opt/ctf/flag.txt; chmod 400 /opt/ctf/flag.txt; "
            f"{'(' + startup + ') & ' if startup else ''}"
            f"exec ttyd -W -p {internal_port} -i 0.0.0.0 bash -lc 'exec bash -li'"
        )
        return ["sh", "-lc", script]
    # For desktop/webapp images, keep image entrypoint/cmd by default.
    if startup:
        return ["sh", "-lc", startup]
    return None


def _create_or_replace(client, challenge_id: int, payload: RuntimePayload):
    session_id = _sanitize_session_id(payload.session_id)
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    image = (payload.image or _default_runtime_image() or "").strip()
    if not image:
        raise HTTPException(status_code=400, detail="image is required")

    access_type = (payload.access_type or "terminal").strip().lower()
    if access_type not in {"terminal", "rdp", "url"}:
        raise HTTPException(status_code=400, detail="invalid access_type")

    if access_type == "terminal":
        default_port = 7681
    elif access_type == "rdp":
        default_port = 8006
    else:
        default_port = 6080
    internal_port = payload.internal_port or default_port
    if internal_port <= 0:
        raise HTTPException(status_code=400, detail="internal_port must be > 0")

    needs_kvm = any("/dev/kvm" in str(item) for item in (payload.devices or []))
    if needs_kvm and not os.path.exists("/dev/kvm"):
        raise HTTPException(
            status_code=400,
            detail="Requested /dev/kvm device but host does not expose KVM. Use a KVM-capable Docker host.",
        )

    existing = _find_container(client, challenge_id, session_id)
    if existing is not None:
        existing.remove(force=True)

    labels = {
        "ctfd.managed": "true",
        "ctfd.challenge_id": str(challenge_id),
        "ctfd.session_id": session_id,
        "ctfd.access_type": access_type,
        "ctfd.internal_port": str(internal_port),
    }
    if payload.user_id:
        labels["ctfd.user_id"] = str(payload.user_id)
    if payload.team_id:
        labels["ctfd.team_id"] = str(payload.team_id)

    ports = None
    if _expose_ports():
        ports = {f"{internal_port}/tcp": None}

    kwargs: Dict[str, Any] = {}
    network = _runtime_network()
    if network:
        kwargs["network"] = network

    if payload.privileged is True:
        kwargs["privileged"] = True
    if payload.cap_add:
        kwargs["cap_add"] = [str(x) for x in payload.cap_add if str(x).strip()]
    if payload.devices:
        kwargs["devices"] = [str(x) for x in payload.devices if str(x).strip()]
    mounts = _default_volume_mounts() + [str(x) for x in (payload.volume_mounts or []) if str(x).strip()]
    if mounts:
        # Preserve order while deduplicating.
        kwargs["volumes"] = list(dict.fromkeys(mounts))

    env = {"FLAG": payload.flag or ""}
    fileshare_url = _default_fileshare_url()
    if fileshare_url:
        env["FILE_SHARE_URL"] = fileshare_url
    for key, value in (payload.environment or {}).items():
        if key:
            env[str(key)] = str(value)

    container = client.containers.run(
        image=image,
        name=_container_name(challenge_id, session_id),
        detach=True,
        labels=labels,
        environment=env,
        command=_build_command(access_type, payload.startup_command, internal_port),
        ports=ports,
        **kwargs,
    )
    return container


def _connection(container) -> Dict[str, Any]:
    attrs = container.attrs
    labels = (attrs.get("Config") or {}).get("Labels") or {}
    port = int(labels.get("ctfd.internal_port", "0") or "0")

    mapped_port = None
    if port > 0:
        binding = ((attrs.get("NetworkSettings") or {}).get("Ports") or {}).get(f"{port}/tcp")
        if binding and len(binding):
            mapped_port = int(binding[0].get("HostPort"))

    return {
        "container_id": container.id,
        "container_name": container.name,
        "status": container.status,
        "access_type": labels.get("ctfd.access_type", "terminal"),
        "session_id": labels.get("ctfd.session_id"),
        "challenge_id": int(labels.get("ctfd.challenge_id", "0") or "0"),
        "user_id": int(labels.get("ctfd.user_id", "0") or "0") or None,
        "team_id": int(labels.get("ctfd.team_id", "0") or "0") or None,
        "internal_port": port or None,
        "host_port": mapped_port,
        "created_at": attrs.get("Created"),
    }


def _start_or_resume(container) -> None:
    container.reload()
    state = container.attrs.get("State") or {}
    if state.get("Paused"):
        container.unpause()
    if container.status != "running":
        container.start()
    container.reload()


@app.get("/health")
def health(authorization: Optional[str] = Header(default=None)):
    # Keep health unauthenticated so docker healthchecks can work without token injection.
    return {"success": True, "data": {"ok": True}}


@app.get("/capabilities")
def capabilities(authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    has_kvm = os.path.exists("/dev/kvm")
    has_tun = os.path.exists("/dev/net/tun")
    return {
        "success": True,
        "data": {
            "has_kvm": has_kvm,
            "has_tun": has_tun,
            "arch": os.uname().machine if hasattr(os, "uname") else "unknown",
            "runtime": "docker",
        },
    }


@app.put("/challenges/{challenge_id}/provision")
def provision(challenge_id: int, payload: RuntimePayload, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    client = _docker()
    container = _create_or_replace(client, challenge_id, payload)
    return {"success": True, "data": _connection(container)}


@app.post("/challenges/{challenge_id}/activate")
def activate(challenge_id: int, payload: RuntimePayload, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    client = _docker()
    session_id = _sanitize_session_id(payload.session_id)
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    container = _find_container(client, challenge_id, session_id)
    if container is None:
        container = _create_or_replace(client, challenge_id, payload)
    _start_or_resume(container)
    return {"success": True, "data": _connection(container)}


@app.post("/challenges/{challenge_id}/sessions/{session_id}/action")
def action(challenge_id: int, session_id: str, payload: ActionPayload, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    action_name = (payload.action or "").strip().lower()
    if action_name not in {"start", "stop", "reset", "remove"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    client = _docker()
    safe_session = _sanitize_session_id(session_id)
    if not safe_session:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    container = _find_container(client, challenge_id, safe_session)
    payload.session_id = safe_session

    if action_name in {"start", "reset"} and container is None:
        container = _create_or_replace(client, challenge_id, payload)

    if container is None:
        raise HTTPException(status_code=404, detail="Session container not found")

    if action_name == "start":
        _start_or_resume(container)
        return {"success": True, "data": {"action": action_name, "connection": _connection(container)}}
    if action_name == "stop":
        container.stop(timeout=5)
        container.reload()
        return {"success": True, "data": {"action": action_name, "connection": _connection(container)}}
    if action_name == "remove":
        data = _connection(container)
        container.remove(force=True)
        return {"success": True, "data": {"action": action_name, "connection": data}}

    # reset
    payload.image = payload.image or container.image.tags[0] if container.image.tags else None
    payload.access_type = payload.access_type or (((container.attrs.get("Config") or {}).get("Labels") or {}).get("ctfd.access_type"))
    payload.internal_port = payload.internal_port or int((((container.attrs.get("Config") or {}).get("Labels") or {}).get("ctfd.internal_port", "0") or "0"))
    container.remove(force=True)
    new_container = _create_or_replace(client, challenge_id, payload)
    _start_or_resume(new_container)
    return {"success": True, "data": {"action": action_name, "connection": _connection(new_container)}}


@app.get("/challenges/{challenge_id}/sessions")
def sessions(challenge_id: int, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    client = _docker()
    rows = []
    for container in client.containers.list(all=True):
        row = _connection(container)
        if row.get("challenge_id") == challenge_id and row.get("session_id"):
            rows.append(row)
    return {"success": True, "data": rows}


@app.post("/maintenance/prune-expired")
def prune(
    ttl_seconds: int = Query(default=7200, ge=60),
    dry_run: bool = Query(default=True),
    authorization: Optional[str] = Header(default=None),
):
    _auth(authorization)
    client = _docker()
    now = datetime.now(timezone.utc)
    removed: List[Dict[str, Any]] = []
    for container in client.containers.list(all=True):
        data = _connection(container)
        if not data.get("session_id"):
            continue
        created = container.attrs.get("Created")
        if not created:
            continue
        try:
            created_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            continue
        age = int((now - created_at).total_seconds())
        if age < ttl_seconds:
            continue
        removed.append({"container_name": data.get("container_name"), "session_id": data.get("session_id"), "challenge_id": data.get("challenge_id"), "age_seconds": age})
        if not dry_run:
            container.remove(force=True)
    return {"success": True, "data": {"dry_run": dry_run, "ttl_seconds": ttl_seconds, "removed": removed}}
