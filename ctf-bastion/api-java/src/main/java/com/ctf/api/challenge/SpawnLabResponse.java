package com.ctf.api.challenge;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record SpawnLabResponse(
    String status,
    @JsonProperty("container_id") String containerId,
    @JsonProperty("expires_at") Instant expiresAt
) {}
