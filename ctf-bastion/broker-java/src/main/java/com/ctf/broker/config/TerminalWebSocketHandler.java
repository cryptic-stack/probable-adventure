package com.ctf.broker.config;

import io.jsonwebtoken.Claims;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {
    private final JwtVerifier jwtVerifier;
    private final long idleTimeoutSeconds;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final Map<String, ScheduledFuture<?>> idleTimers = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Process> processes = new ConcurrentHashMap<>();

    public TerminalWebSocketHandler(
        JwtVerifier jwtVerifier,
        @Value("${ctf.broker.idle-timeout-seconds:900}") long idleTimeoutSeconds
    ) {
        this.jwtVerifier = jwtVerifier;
        this.idleTimeoutSeconds = idleTimeoutSeconds;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String token = extractParam(session.getUri(), "token");
        String containerId = extractParam(session.getUri(), "containerId");

        if (token == null || token.isBlank()) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("missing token"));
            return;
        }
        if (containerId == null || containerId.isBlank()) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("missing containerId"));
            return;
        }

        try {
            Claims claims = jwtVerifier.verify(token);
            String channel = extractChannel(session.getUri());

            Process process = new ProcessBuilder("docker", "exec", "-i", containerId, "/bin/sh")
                .redirectErrorStream(true)
                .start();

            sessions.put(session.getId(), session);
            processes.put(session.getId(), process);
            session.getAttributes().put("user", claims.getSubject());
            session.getAttributes().put("channel", channel);
            session.getAttributes().put("containerId", containerId);
            resetIdleTimeout(session);

            startOutputPump(session, process);
            session.sendMessage(new TextMessage("broker connected channel=" + channel + " user=" + claims.getSubject()));
        } catch (Exception ex) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("invalid token or container"));
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        if (!session.isOpen()) {
            return;
        }

        Process process = processes.get(session.getId());
        if (process == null) {
            return;
        }

        resetIdleTimeout(session);

        try {
            OutputStream stdin = process.getOutputStream();
            stdin.write(message.getPayload().getBytes(StandardCharsets.UTF_8));
            stdin.flush();
        } catch (IOException ignored) {
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        cancelIdleTimeout(session.getId());
        Process process = processes.remove(session.getId());
        if (process != null) {
            process.destroyForcibly();
        }
    }

    public int activeSessionCount() {
        return sessions.size();
    }

    private void startOutputPump(WebSocketSession session, Process process) {
        scheduler.submit(() -> {
            try (var in = process.getInputStream()) {
                byte[] buffer = new byte[1024];
                int read;
                while (session.isOpen() && (read = in.read(buffer)) != -1) {
                    String payload = new String(buffer, 0, read, StandardCharsets.UTF_8);
                    synchronized (session) {
                        session.sendMessage(new TextMessage(payload));
                    }
                }
            } catch (Exception ignored) {
            } finally {
                try {
                    if (session.isOpen()) {
                        session.close(CloseStatus.NORMAL);
                    }
                } catch (IOException ignored) {
                }
            }
        });
    }

    private void resetIdleTimeout(WebSocketSession session) {
        cancelIdleTimeout(session.getId());
        ScheduledFuture<?> future = scheduler.schedule(() -> closeForIdle(session), idleTimeoutSeconds, TimeUnit.SECONDS);
        idleTimers.put(session.getId(), future);
    }

    private void cancelIdleTimeout(String sessionId) {
        ScheduledFuture<?> existing = idleTimers.remove(sessionId);
        if (existing != null) {
            existing.cancel(false);
        }
    }

    private void closeForIdle(WebSocketSession session) {
        try {
            if (session.isOpen()) {
                session.close(CloseStatus.SESSION_NOT_RELIABLE.withReason("idle timeout"));
            }
        } catch (Exception ignored) {
        }
    }

    private static String extractParam(URI uri, String name) {
        if (uri == null || uri.getQuery() == null) {
            return null;
        }

        return Arrays.stream(uri.getQuery().split("&"))
            .map(part -> part.split("=", 2))
            .filter(parts -> parts.length == 2 && name.equals(parts[0]))
            .map(parts -> URLDecoder.decode(parts[1], StandardCharsets.UTF_8))
            .findFirst()
            .orElse(null);
    }

    private static String extractChannel(URI uri) {
        if (uri == null || uri.getPath() == null) {
            return "terminal";
        }
        if (uri.getPath().endsWith("/rdp")) {
            return "rdp";
        }
        return "terminal";
    }

    @PreDestroy
    public void cleanup() {
        scheduler.shutdownNow();
    }
}
