package com.ctf.api.challenge;

import java.time.Instant;
import java.util.List;

public record ChallengeSession(
    int challengeId,
    String userEmail,
    String containerId,
    Instant expiresAt,
    List<ConnectionOption> options
) {}
