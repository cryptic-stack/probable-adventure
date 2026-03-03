# CTFd Plugin Scaffolds

Scaffold modules added:
- team_chat
- team_drive
- shared_terminal
- session_recorder

Each plugin currently includes:
- load hook and blueprint
- health endpoint
- admin page
- placeholder API routes returning scaffold/not-implemented status

Recommended next implementation layers:
1. SQLAlchemy models and migrations.
2. Redis-backed realtime transport where needed.
3. Permission model (team/admin scopes).
4. UI integration inside challenge modal panels.
