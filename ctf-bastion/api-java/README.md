# api-java

Spring Boot 3 + Java 21 auth/API service.

Current state:

- `/api/health`
- `/api/auth/register`
- `/api/auth/login` with JWT issuance (HMAC)

Notes:

- Uses in-memory user store for MVP bootstrap.
- Replace with PostgreSQL + password hashing before production.
