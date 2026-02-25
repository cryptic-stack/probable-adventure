import os
import re
import shlex
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import docker
from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(title="CTFd Challenge Control Service")

INFRA_SERVICES = {"ctfd", "db", "cache", "nginx", "control-service"}
CHALLENGE_KEYS = ("ctfd.challenge_id", "challenge_id", "ctf.challenge_id")
USER_KEYS = ("ctfd.user_id", "user_id", "ctf.user_id")
TEAM_KEYS = ("ctfd.team_id", "team_id", "ctf.team_id")
SESSION_KEYS = ("ctfd.session_id", "session_id", "ctf.session_id")


class ActionBody(BaseModel):
    action: str


class ProvisionBody(BaseModel):
    image: Optional[str] = None
    flag: Optional[str] = None
    internal_port: Optional[int] = None
    startup_command: Optional[str] = None
    access_type: Optional[str] = None


class ActivateBody(BaseModel):
    image: Optional[str] = None
    flag: Optional[str] = None
    internal_port: Optional[int] = None
    startup_command: Optional[str] = None
    access_type: Optional[str] = None


class AutoGradeBody(BaseModel):
    commands: Optional[List[str]] = None


def _required_token() -> str:
    return os.getenv("CHALLENGE_CONTROL_TOKEN", "").strip()


def _authz(authorization: Optional[str]) -> None:
    expected = _required_token()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    provided = authorization.split(" ", 1)[1].strip()
    if provided != expected:
        raise HTTPException(status_code=403, detail="Invalid token")


def _client():
    try:
        c = docker.from_env()
        c.ping()
        return c
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Docker unavailable: {e}")


def _format_ts(raw: str) -> str:
    if not raw:
        return ""
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime(
            "%Y-%m-%d %H:%M:%S UTC"
        )
    except Exception:
        return raw


def _to_int_label(labels: Dict[str, str], keys: Tuple[str, ...]) -> Optional[int]:
    for key in keys:
        value = labels.get(key)
        if value is None:
            continue
        s = str(value).strip()
        if s.isdigit():
            return int(s)
    return None


def _to_text_label(labels: Dict[str, str], keys: Tuple[str, ...]) -> str:
    for key in keys:
        value = labels.get(key)
        if value:
            return str(value).strip()
    return ""


def _extract_from_name(name: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    challenge = re.search(r"challenge[-_](\d+)", name)
    user = re.search(r"user[-_](\d+)", name)
    team = re.search(r"team[-_](\d+)", name)
    return (
        int(challenge.group(1)) if challenge else None,
        int(user.group(1)) if user else None,
        int(team.group(1)) if team else None,
    )


def _active_logons(container) -> Optional[int]:
    cmds = [
        "sh -lc \"who | wc -l\"",
        "sh -lc \"ps -eo tty= | grep -E 'pts|tty' | wc -l\"",
    ]
    for cmd in cmds:
        try:
            result = container.exec_run(cmd)
        except Exception:
            continue
        if result.exit_code != 0:
            continue
        text = result.output.decode(errors="ignore").strip()
        if text.isdigit():
            return int(text)
    return None


def _container_row(container) -> Dict[str, Any]:
    attrs = container.attrs
    config = attrs.get("Config") or {}
    labels = config.get("Labels") or {}
    state = attrs.get("State") or {}

    image = config.get("Image") or ""
    if not image:
        tags = container.image.tags or []
        image = tags[0] if tags else container.image.short_id

    compose_service = labels.get("com.docker.compose.service", "")
    challenge_id = _to_int_label(labels, CHALLENGE_KEYS)
    user_id = _to_int_label(labels, USER_KEYS)
    team_id = _to_int_label(labels, TEAM_KEYS)
    session_id = _to_text_label(labels, SESSION_KEYS)

    if challenge_id is None or user_id is None or team_id is None:
        from_name = _extract_from_name(container.name)
        if challenge_id is None:
            challenge_id = from_name[0]
        if user_id is None:
            user_id = from_name[1]
        if team_id is None:
            team_id = from_name[2]

    managed = bool(challenge_id or labels.get("ctfd.managed") == "true")
    protected = compose_service in INFRA_SERVICES

    return {
        "id": container.id,
        "short_id": container.short_id,
        "name": container.name,
        "image": image,
        "status": container.status,
        "paused": bool(state.get("Paused", False)),
        "created": _format_ts(attrs.get("Created")),
        "started_at": _format_ts(state.get("StartedAt")),
        "finished_at": _format_ts(state.get("FinishedAt")),
        "challenge_id": challenge_id,
        "user_id": user_id,
        "team_id": team_id,
        "session_id": session_id,
        "compose_service": compose_service,
        "managed": managed,
        "protected": protected,
    }


def _challenge_container_name(challenge_id: int) -> str:
    return f"ctfd-challenge-{challenge_id}-lab"


def _find_challenge_container(client, challenge_id: int):
    name = _challenge_container_name(challenge_id)
    for container in client.containers.list(all=True):
        if container.name == name:
            return container
    return None


def _build_lab_command(
    startup_command: Optional[str], access_type: str, internal_port: Optional[int]
) -> List[str]:
    setup = "mkdir -p /opt/ctf && printf '%s' \"$FLAG\" > /opt/ctf/flag.txt && chmod 400 /opt/ctf/flag.txt;"
    startup = (startup_command or "").strip()

    if access_type == "terminal":
        port = internal_port or 7681
        startup_bg = f"({startup}) & " if startup else ""
        # Keep runtime setup as root, but always drop player terminal to unprivileged ctf.
        script = (
            f"{setup} "
            f"{startup_bg}"
            f"exec ttyd -W -p {port} -i 0.0.0.0 bash -lc 'exec sudo -u ctf -H bash -lc \"cd /home/ctf && exec bash -li\"'"
        )
        return ["sh", "-lc", script]

    startup = startup or "while true; do sleep 3600; done"
    script = f"{setup} {startup}"
    return ["sh", "-lc", script]


def _provision_challenge_container(
    client,
    challenge_id: int,
    image: str,
    flag: str,
    internal_port: Optional[int],
    startup_command: Optional[str],
    access_type: str,
):
    if not image:
        raise HTTPException(status_code=400, detail="Missing image for challenge container")

    if access_type == "terminal" and not internal_port:
        internal_port = 7681

    existing = _find_challenge_container(client, challenge_id)
    if existing is not None:
        existing.remove(force=True)

    labels = {
        "ctfd.managed": "true",
        "ctfd.challenge_id": str(challenge_id),
        "ctfd.access_type": (access_type or "terminal"),
    }
    if access_type == "terminal":
        labels["ctfd.shell_user"] = "ctf"
    ports = None
    if internal_port and internal_port > 0:
        labels["ctfd.internal_port"] = str(internal_port)
        ports = {f"{internal_port}/tcp": None}

    container = client.containers.run(
        image=image,
        name=_challenge_container_name(challenge_id),
        detach=True,
        command=_build_lab_command(startup_command, access_type, internal_port),
        environment={"FLAG": flag or ""},
        labels=labels,
        ports=ports,
    )
    container.pause()
    container.reload()
    return container


def _container_connection(container):
    attrs = container.attrs
    labels = (attrs.get("Config") or {}).get("Labels") or {}
    access_type = labels.get("ctfd.access_type", "terminal")
    port_key = labels.get("ctfd.internal_port")

    public_host = os.getenv("CONTROL_PUBLIC_HOST", "localhost")
    default_scheme = os.getenv("CONTROL_PUBLIC_SCHEME", "http")
    mapped_port = None
    if port_key:
        binding = ((attrs.get("NetworkSettings") or {}).get("Ports") or {}).get(
            f"{port_key}/tcp"
        )
        if binding and len(binding):
            mapped_port = binding[0].get("HostPort")

    url = None
    if mapped_port:
        if access_type == "rdp":
            url = f"rdp://{public_host}:{mapped_port}"
        else:
            url = f"{default_scheme}://{public_host}:{mapped_port}"

    return {
        "container_id": container.id,
        "container_name": container.name,
        "status": container.status,
        "paused": bool((attrs.get("State") or {}).get("Paused", False)),
        "access_type": access_type,
        "host": public_host,
        "port": int(mapped_port) if mapped_port else None,
        "url": url,
    }


def _build_reset_spec(container) -> Dict[str, Any]:
    attrs = container.attrs
    config = attrs.get("Config") or {}
    host = attrs.get("HostConfig") or {}
    networks = (attrs.get("NetworkSettings") or {}).get("Networks") or {}

    network_mode = host.get("NetworkMode") or "default"
    primary_network = next(iter(networks.keys()), None)
    spec = {
        "image": config.get("Image"),
        "name": container.name,
        "detach": True,
        "command": config.get("Cmd"),
        "entrypoint": config.get("Entrypoint"),
        "environment": config.get("Env"),
        "working_dir": config.get("WorkingDir") or None,
        "hostname": config.get("Hostname") or None,
        "user": config.get("User") or None,
        "labels": config.get("Labels") or {},
        "tty": bool(config.get("Tty")),
        "stdin_open": bool(config.get("OpenStdin")),
        "read_only": bool(host.get("ReadonlyRootfs")),
        "privileged": bool(host.get("Privileged")),
        "security_opt": host.get("SecurityOpt") or None,
        "cap_add": host.get("CapAdd") or None,
        "cap_drop": host.get("CapDrop") or None,
        "pids_limit": host.get("PidsLimit") if (host.get("PidsLimit") or 0) > 0 else None,
        "restart_policy": host.get("RestartPolicy") or None,
        "mem_limit": host.get("Memory") if (host.get("Memory") or 0) > 0 else None,
        "nano_cpus": host.get("NanoCpus") if (host.get("NanoCpus") or 0) > 0 else None,
        "cpu_quota": host.get("CpuQuota") if (host.get("CpuQuota") or 0) > 0 else None,
        "cpu_period": host.get("CpuPeriod") if (host.get("CpuPeriod") or 0) > 0 else None,
        "dns": host.get("Dns") or None,
        "extra_hosts": host.get("ExtraHosts") or None,
        "network_mode": None,
        "network": None,
        "volumes": host.get("Binds") or None,
    }
    if network_mode not in {"default", "bridge"}:
        spec["network_mode"] = network_mode
    elif primary_network:
        spec["network"] = primary_network

    port_bindings = {}
    for container_port, bindings in (host.get("PortBindings") or {}).items():
        if not bindings:
            continue
        host_values = []
        for bind in bindings:
            host_port = bind.get("HostPort")
            host_ip = bind.get("HostIp")
            if not host_port:
                continue
            if host_ip and host_ip not in {"0.0.0.0", ""}:
                host_values.append((host_ip, int(host_port)))
            else:
                host_values.append(int(host_port))
        if host_values:
            port_bindings[container_port] = host_values[0] if len(host_values) == 1 else host_values

    spec["ports"] = port_bindings or None

    secondary = []
    if primary_network:
        for network_name, network_cfg in networks.items():
            if network_name == primary_network:
                continue
            secondary.append({"name": network_name, "aliases": network_cfg.get("Aliases") or None})
    spec["secondary_networks"] = secondary
    return spec


def _cleanup_spec(spec: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for key, value in spec.items():
        if key == "secondary_networks":
            continue
        if value is None:
            continue
        out[key] = value
    return out


def _reset_container(client, container):
    spec = _build_reset_spec(container)
    run_spec = _cleanup_spec(spec)
    container.remove(force=True)
    new_container = client.containers.run(**run_spec)
    for network in spec["secondary_networks"]:
        try:
            client.networks.get(network["name"]).connect(
                new_container, aliases=network["aliases"]
            )
        except Exception:
            continue
    return new_container


def _tokenize_command(value: str) -> List[str]:
    try:
        return shlex.split(value)
    except ValueError:
        return value.split()


def _line_matches_expected(line: str, expected: str) -> bool:
    actual = _tokenize_command(line.strip())
    target = _tokenize_command(expected.strip())
    if not actual or not target:
        return False
    if actual[0] != target[0]:
        return False

    actual_args = actual[1:]
    for token in target[1:]:
        if token.startswith("--"):
            if token not in actual_args:
                return False
            continue
        if token.startswith("-") and len(token) > 1:
            required = {c for c in token[1:] if c.isalnum()}
            if not required:
                continue
            present: set[str] = set()
            for arg in actual_args:
                if arg.startswith("-") and not arg.startswith("--") and len(arg) > 1:
                    present.update({c for c in arg[1:] if c.isalnum()})
            if not required.issubset(present):
                return False
            continue
        if token not in actual_args:
            return False
    return True


def _read_command_history(container) -> List[str]:
    result = container.exec_run(
        ["sh", "-lc", "tail -n 4000 /home/ctf/.bash_history 2>/dev/null || true"]
    )
    if result.exit_code != 0:
        return []
    return [
        line.strip()
        for line in result.output.decode(errors="ignore").splitlines()
        if line.strip()
    ]


@app.get("/health")
def health(authorization: Optional[str] = Header(default=None)):
    _authz(authorization)
    c = _client()
    return {"success": True, "data": {"ok": bool(c.ping())}}


@app.get("/containers")
def list_containers(
    running: bool = Query(default=True),
    managed: bool = Query(default=False),
    logons: bool = Query(default=True),
    authorization: Optional[str] = Header(default=None),
):
    _authz(authorization)
    client = _client()
    rows: List[Dict[str, Any]] = []
    containers = client.containers.list(all=(not running))
    for container in containers:
        row = _container_row(container)
        if managed and not row["managed"]:
            continue
        row["active_logons"] = _active_logons(container) if (logons and row["status"] == "running") else None
        rows.append(row)
    rows.sort(key=lambda r: (r["status"] != "running", r["name"]))
    return {"success": True, "data": rows}


@app.get("/containers/{container_id}/logs")
def container_logs(
    container_id: str,
    tail: int = Query(default=300, ge=10, le=2000),
    authorization: Optional[str] = Header(default=None),
):
    _authz(authorization)
    client = _client()
    try:
        container = client.containers.get(container_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        data = container.logs(tail=tail).decode(errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "data": {"logs": data}}


@app.post("/containers/{container_id}/action")
def container_action(
    container_id: str,
    body: ActionBody,
    authorization: Optional[str] = Header(default=None),
):
    _authz(authorization)
    action = (body.action or "").strip().lower()
    if action not in {"restart", "reset", "stop", "remove"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    client = _client()
    try:
        container = client.containers.get(container_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    details = _container_row(container)
    if details["protected"]:
        raise HTTPException(
            status_code=403, detail="Refusing to mutate protected infrastructure container"
        )

    try:
        if action == "restart":
            container.restart(timeout=5)
            message = "Container restarted"
        elif action == "stop":
            container.stop(timeout=5)
            message = "Container stopped"
        elif action == "remove":
            container.remove(force=True)
            message = "Container removed"
        else:
            new_container = _reset_container(client, container)
            message = f"Container reset to {new_container.short_id}"
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": {"message": message}}


@app.put("/challenges/{challenge_id}/provision")
def provision_challenge(
    challenge_id: int,
    body: ProvisionBody,
    authorization: Optional[str] = Header(default=None),
):
    _authz(authorization)
    client = _client()
    container = _provision_challenge_container(
        client=client,
        challenge_id=challenge_id,
        image=(body.image or "").strip(),
        flag=body.flag or "",
        internal_port=body.internal_port,
        startup_command=body.startup_command,
        access_type=(body.access_type or "terminal").strip().lower(),
    )
    return {"success": True, "data": _container_connection(container)}


@app.post("/challenges/{challenge_id}/activate")
def activate_challenge(
    challenge_id: int,
    body: ActivateBody,
    authorization: Optional[str] = Header(default=None),
):
    _authz(authorization)
    client = _client()
    container = _find_challenge_container(client, challenge_id)

    requested_access_type = (body.access_type or "terminal").strip().lower()
    requested_internal_port = body.internal_port
    if requested_access_type == "terminal" and not requested_internal_port:
        requested_internal_port = 7681

    # Re-provision stale terminal containers that were created before port mapping logic.
    if container is not None:
        labels = (container.attrs.get("Config") or {}).get("Labels") or {}
        if requested_access_type == "terminal" and (
            not labels.get("ctfd.internal_port")
            or labels.get("ctfd.shell_user") != "ctf"
        ):
            container.remove(force=True)
            container = None

    # If challenge wasn't pre-provisioned, create it now from provided config.
    if container is None:
        container = _provision_challenge_container(
            client=client,
            challenge_id=challenge_id,
            image=(body.image or "").strip(),
            flag=body.flag or "",
            internal_port=requested_internal_port,
            startup_command=body.startup_command,
            access_type=requested_access_type,
        )

    # Optional flag refresh on activate.
    if body.flag is not None:
        try:
            container.exec_run(
                ["sh", "-lc", "printf '%s' \"$FLAG\" > /opt/ctf/flag.txt && chmod 400 /opt/ctf/flag.txt"],
                environment={"FLAG": body.flag},
            )
        except Exception:
            pass

    try:
        container.reload()
        state = container.attrs.get("State") or {}
        if state.get("Paused", False):
            container.unpause()
            container.reload()
        if container.status != "running":
            container.start()
            container.reload()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": _container_connection(container)}


@app.post("/challenges/{challenge_id}/autograde")
def autograde_challenge(
    challenge_id: int,
    body: AutoGradeBody,
    authorization: Optional[str] = Header(default=None),
):
    _authz(authorization)
    expected = [c.strip() for c in (body.commands or []) if c and c.strip()]
    if not expected:
        raise HTTPException(status_code=400, detail="Missing expected command list")

    client = _client()
    container = _find_challenge_container(client, challenge_id)
    if container is None:
        return {
            "success": True,
            "data": {"matched": False, "reason": "container_not_found"},
        }

    history = _read_command_history(container)
    for line in reversed(history):
        for command in expected:
            if _line_matches_expected(line, command):
                return {
                    "success": True,
                    "data": {
                        "matched": True,
                        "matched_command": line,
                        "expected_command": command,
                        "message": f"Auto-validated from terminal activity: `{command}`",
                    },
                }
    return {"success": True, "data": {"matched": False, "reason": "no_match"}}


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    return fastapi_json(exc.status_code, exc.detail)


def fastapi_json(status_code: int, message: str):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=status_code, content={"success": False, "error": message})
