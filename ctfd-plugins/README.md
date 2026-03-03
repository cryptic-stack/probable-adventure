# CTFd Plugin Scaffolds

Scaffold modules added:
- team_chat
- team_drive
- shared_terminal
- session_recorder

Current MVP capabilities:
- `team_chat`: room-scoped message list/post with bounded persistence
- `team_drive`: scope-scoped file registry (metadata/path) with create/list/delete
- `shared_terminal`: collaborative lock acquire/release with TTL
- `session_recorder`: session event ingest/list with team/user scope filters

Recommended next implementation layers:
1. SQLAlchemy models and migrations.
2. Redis-backed realtime transport where needed.
3. Permission model (team/admin scopes).
4. UI integration inside challenge modal panels.
