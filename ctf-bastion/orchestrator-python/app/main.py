from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Optional

import docker
from docker.errors import DockerException, NotFound
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import AliasChoices, BaseModel, Field

app = FastAPI(title="CTF Lab Orchestrator", version="0.2.0")
client = docker.from_env()

sessions_lock = Lock()
active_sessions: dict[str, datetime] = {}


class SpawnRequest(BaseModel):
    user_id: int = Field(validation_alias=AliasChoices("user_id", "userId"))
    challenge_image: str = Field(validation_alias=AliasChoices("challenge_image", "challengeImage"))
    challenge_command: str = Field(
        default="sh -c 'sleep infinity'",
        validation_alias=AliasChoices("challenge_command", "challengeCommand"),
    )
    ttl_minutes: int = Field(
        default=30,
        ge=5,
        le=180,
        validation_alias=AliasChoices("ttl_minutes", "ttlMinutes"),
    )
    memory_limit: str = Field(default="512m", validation_alias=AliasChoices("memory_limit", "memoryLimit"))
    cpu_quota: int = Field(default=50000, validation_alias=AliasChoices("cpu_quota", "cpuQuota"))
    read_only: bool = Field(default=False, validation_alias=AliasChoices("read_only", "readOnly"))


class SpawnResponse(BaseModel):
    status: str
    container_id: str
    expires_at: datetime


@app.on_event("startup")
async def startup_task() -> None:
    asyncio.create_task(expiry_reaper())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "orchestrator-python"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.post("/labs/spawn", response_model=SpawnResponse)
def spawn_lab(req: SpawnRequest) -> SpawnResponse:
    expires = datetime.now(timezone.utc) + timedelta(minutes=req.ttl_minutes)

    try:
        container = client.containers.run(
            image=req.challenge_image,
            command=req.challenge_command,
            detach=True,
            stdin_open=True,
            tty=True,
            mem_limit=req.memory_limit,
            cpu_quota=req.cpu_quota,
            read_only=req.read_only,
            cap_drop=["ALL"],
            cap_add=["SYS_CHROOT"],
            security_opt=["no-new-privileges"],
            pids_limit=100,
            labels={
                "ctf.user_id": str(req.user_id),
                "ctf.expires_at": expires.isoformat(),
            },
        )
    except DockerException as ex:
        raise HTTPException(status_code=500, detail=f"failed to spawn container: {ex}") from ex

    with sessions_lock:
        active_sessions[container.id] = expires

    return SpawnResponse(status="running", container_id=container.id, expires_at=expires)


@app.delete("/labs/{container_id}")
def stop_lab(container_id: str) -> dict[str, Optional[str]]:
    try:
        container = client.containers.get(container_id)
        container.remove(force=True)
    except NotFound:
        pass
    except DockerException as ex:
        raise HTTPException(status_code=500, detail=f"failed to stop container: {ex}") from ex

    with sessions_lock:
        active_sessions.pop(container_id, None)

    return {"status": "terminated", "container_id": container_id}


async def expiry_reaper() -> None:
    while True:
        now = datetime.now(timezone.utc)

        with sessions_lock:
            expired = [cid for cid, exp in active_sessions.items() if exp <= now]

        for container_id in expired:
            try:
                container = client.containers.get(container_id)
                container.remove(force=True)
            except Exception:
                pass
            finally:
                with sessions_lock:
                    active_sessions.pop(container_id, None)

        await asyncio.sleep(5)
