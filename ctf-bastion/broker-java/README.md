# broker-java

Spring Boot 3 + Java 21 broker service.

Current state:

- `/ws/health` HTTP health endpoint
- `/ws/terminal` WebSocket echo stub for browser terminal integration

Next implementation:

- Replace echo with Netty + Apache Mina SSHD bridge
- Add session recording and abuse kill-switch hooks
