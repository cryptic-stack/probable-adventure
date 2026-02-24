package com.ctf.api.challenge;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ChallengeSessionService {
    private final Map<String, ChallengeSession> sessions = new ConcurrentHashMap<>();
    private final Map<Integer, ChallengeDefinition> catalog = Map.of(
        1,
        new ChallengeDefinition(
            1,
            "alpine:3.21",
            "sh -lc \"mkdir -p /challenge && echo 'flag{ctf_demo_01}' >/challenge/flag.txt && chmod 400 /challenge/flag.txt && sleep infinity\"",
            "flag{ctf_demo_01}"
        )
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .build();
    private final ObjectMapper objectMapper;
    private final String orchestratorBaseUrl;

    public ChallengeSessionService(
        @Value("${ctf.orchestrator.url:http://orchestrator:8000}") String orchestratorBaseUrl,
        ObjectMapper objectMapper
    ) {
        this.orchestratorBaseUrl = orchestratorBaseUrl;
        this.objectMapper = objectMapper;
    }

    public ChallengeSession startSession(String userEmail, int challengeId) {
        ChallengeDefinition definition = requireChallenge(challengeId);
        terminateExistingSession(userEmail, challengeId);

        SpawnLabResponse spawn = spawnContainer(userEmail, definition);
        String key = key(userEmail, challengeId);

        String terminalPath = "/ws/terminal?containerId=" + spawn.containerId();
        String rdpPath = "/ws/rdp?containerId=" + spawn.containerId();

        ChallengeSession session = new ChallengeSession(
            challengeId,
            userEmail,
            spawn.containerId(),
            spawn.expiresAt(),
            List.of(
                new ConnectionOption("ssh", "Browser SSH", terminalPath),
                new ConnectionOption("rdp", "Browser RDP", rdpPath)
            )
        );

        sessions.put(key, session);
        return session;
    }

    public ChallengeSession getSession(String userEmail, int challengeId) {
        ChallengeSession session = sessions.get(key(userEmail, challengeId));
        if (session == null) {
            throw new IllegalArgumentException("challenge not started");
        }
        if (session.expiresAt().isBefore(Instant.now())) {
            terminateLab(session.containerId());
            sessions.remove(key(userEmail, challengeId));
            throw new IllegalArgumentException("challenge session expired");
        }
        return session;
    }

    public SubmitFlagResponse submitFlag(String userEmail, int challengeId, String flag) {
        ChallengeDefinition definition = requireChallenge(challengeId);
        getSession(userEmail, challengeId);

        boolean correct = MessageDigest.isEqual(
            definition.expectedFlag().getBytes(StandardCharsets.UTF_8),
            flag.getBytes(StandardCharsets.UTF_8)
        );

        if (correct) {
            return new SubmitFlagResponse(true, "correct flag");
        }
        return new SubmitFlagResponse(false, "incorrect flag");
    }

    private ChallengeDefinition requireChallenge(int challengeId) {
        ChallengeDefinition definition = catalog.get(challengeId);
        if (definition == null) {
            throw new IllegalArgumentException("unknown challenge");
        }
        return definition;
    }

    private SpawnLabResponse spawnContainer(String userEmail, ChallengeDefinition definition) {
        Map<String, Object> requestBody = Map.of(
            "user_id", Math.abs(userEmail.hashCode()),
            "challenge_image", definition.image(),
            "challenge_command", definition.command(),
            "ttl_minutes", 30,
            "memory_limit", "512m",
            "cpu_quota", 50000,
            "read_only", false
        );

        try {
            String json = objectMapper.writeValueAsString(requestBody);
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(orchestratorBaseUrl + "/labs/spawn"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                throw new IllegalArgumentException("failed to spawn challenge container");
            }

            return objectMapper.readValue(response.body(), SpawnLabResponse.class);
        } catch (Exception ex) {
            throw new IllegalArgumentException("orchestrator error: " + ex.getMessage());
        }
    }

    private void terminateExistingSession(String userEmail, int challengeId) {
        String key = key(userEmail, challengeId);
        ChallengeSession existing = sessions.remove(key);
        if (existing != null) {
            terminateLab(existing.containerId());
        }
    }

    private void terminateLab(String containerId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(orchestratorBaseUrl + "/labs/" + containerId))
                .DELETE()
                .build();
            httpClient.send(request, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {
        }
    }

    private String key(String userEmail, int challengeId) {
        return userEmail + ":" + challengeId;
    }
}
