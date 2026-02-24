package com.ctf.api.challenge;

import java.time.Instant;
import java.util.List;

public record ChallengeSessionResponse(
    int challengeId,
    String containerId,
    Instant expiresAt,
    List<ConnectionOption> options
) {}
