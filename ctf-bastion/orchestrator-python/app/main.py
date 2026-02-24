from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="CTF Lab Orchestrator", version="0.1.0")


class SpawnRequest(BaseModel):
    user_id: int
    challenge_image: str
    ttl_minutes: int = Field(default=30, ge=5, le=180)
    memory_limit: str = "512m"
    cpu_quota: int = 50000
    read_only: bool = True


class SpawnResponse(BaseModel):
    status: str
    container_id: str
    expires_at: datetime


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "orchestrator-python"}


@app.post("/labs/spawn", response_model=SpawnResponse)
def spawn_lab(req: SpawnRequest) -> SpawnResponse:
    # Placeholder: integrate Docker SDK with per-user isolated network and quotas.
    expires = datetime.now(timezone.utc) + timedelta(minutes=req.ttl_minutes)
    fake_id = f"placeholder-{req.user_id}-{int(expires.timestamp())}"
    return SpawnResponse(status="queued", container_id=fake_id, expires_at=expires)


@app.delete("/labs/{container_id}")
def stop_lab(container_id: str) -> dict[str, Optional[str]]:
    # Placeholder: perform force kill + cleanup network + audit log.
    return {"status": "terminated", "container_id": container_id}
