package com.ctf.api.challenge;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ChallengeSessionService {
    private final Map<String, ChallengeSession> sessions = new ConcurrentHashMap<>();

    public ChallengeSession startSession(String userEmail, int challengeId) {
        String key = key(userEmail, challengeId);
        ChallengeSession session = new ChallengeSession(
            challengeId,
            userEmail,
            "lab-" + UUID.randomUUID().toString().substring(0, 8),
            Instant.now().plusSeconds(1800),
            List.of(
                new ConnectionOption("ssh", "Browser SSH", "/ws/terminal"),
                new ConnectionOption("rdp", "Browser RDP", "/ws/rdp")
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
        return session;
    }

    private String key(String userEmail, int challengeId) {
        return userEmail + ":" + challengeId;
    }
}
