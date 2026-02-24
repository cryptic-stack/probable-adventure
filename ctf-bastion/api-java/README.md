# api-java

Spring Boot 3 + Java 21 placeholder service.

Current state:

- Minimal Java 21 HTTP server for health checks and compose integration.
- Replace with Spring Boot auth/API implementation in Phase 1.

Target responsibilities:

- JWT auth + refresh tokens
- RBAC (`ROLE_ADMIN`, `ROLE_MODERATOR`, `ROLE_PLAYER`)
- Challenge and team APIs
- Flag submission with anti-bruteforce controls
