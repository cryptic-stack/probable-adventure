# AI Code Agent Playbook: Web-Launched Terminal + RDP Sessions

This project follows the same guidance defined in [`INSTRUCTIONS`](../INSTRUCTIONS):
- Docker containers only for runtime sessions
- Session-scoped lifecycle APIs
- Same-origin terminal/desktop proxy URLs
- Dedicated right-side workspace UI
- Admin/ops flow around session control and pruning

Use `INSTRUCTIONS` as the normative source for implementation order and quality gates.

## External Runtime Context

When using QEMU-in-container style images (for example `dockurr/windows`), prefer:
- explicit env-driven sizing (`RAM_SIZE`, `CPU_CORES`, `DISK_SIZE`, `VERSION`)
- runtime capability gate before launch (`has_kvm`)
- Docker-only orchestration paths in control-service

Reference repos:
- https://github.com/qemus/qemu
- https://github.com/dockur/windows

## CTFd-First Extension Model

Custom functionality should be implemented as CTFd plugin modules under `ctfd-plugins/`:
- auth/team context from CTFd session (no duplicate identity service)
- admin profile management via plugin routes
- challenge connect/session actions proxied to `control-service`
- CTFd remains source of truth for users, teams, challenge lifecycle
