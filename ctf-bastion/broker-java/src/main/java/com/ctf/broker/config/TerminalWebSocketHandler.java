package com.ctf.broker.config;

import io.jsonwebtoken.Claims;
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
import jakarta.annotation.PreDestroy;
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
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
    private final Map<String, ScheduledFuture<?>> idleTimers = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public TerminalWebSocketHandler(
        JwtVerifier jwtVerifier,
        @Value("${ctf.broker.idle-timeout-seconds:900}") long idleTimeoutSeconds
    ) {
        this.jwtVerifier = jwtVerifier;
        this.idleTimeoutSeconds = idleTimeoutSeconds;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String token = extractToken(session.getUri());
        if (token == null || token.isBlank()) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("missing token"));
            return;
        }

        try {
            Claims claims = jwtVerifier.verify(token);
            String channel = extractChannel(session.getUri());
            session.getAttributes().put("user", claims.getSubject());
            session.getAttributes().put("channel", channel);
            sessions.put(session.getId(), session);
            resetIdleTimeout(session);
            session.sendMessage(new TextMessage("broker connected channel=" + channel + " user=" + claims.getSubject()));
        } catch (Exception ex) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("invalid token"));
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if (!session.isOpen()) {
            return;
        }

        resetIdleTimeout(session);
        String payload = message.getPayload();
        String user = (String) session.getAttributes().getOrDefault("user", "unknown");
        String channel = (String) session.getAttributes().getOrDefault("channel", "terminal");
        String response = "[" + Instant.now() + "] channel=" + channel + " user=" + user + " broker-echo: " + payload;
        session.sendMessage(new TextMessage(response));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        cancelIdleTimeout(session.getId());
    }

    public int activeSessionCount() {
        return sessions.size();
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

    private static String extractToken(URI uri) {
        if (uri == null || uri.getQuery() == null) {
            return null;
        }

        return Arrays.stream(uri.getQuery().split("&"))
            .map(part -> part.split("=", 2))
            .filter(parts -> parts.length == 2 && "token".equals(parts[0]))
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
