package com.ctf.api.challenge;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SpawnLabRequest(
    @JsonProperty("user_id") int userId,
    @JsonProperty("challenge_image") String challengeImage,
    @JsonProperty("challenge_command") String challengeCommand,
    @JsonProperty("ttl_minutes") int ttlMinutes,
    @JsonProperty("memory_limit") String memoryLimit,
    @JsonProperty("cpu_quota") int cpuQuota,
    @JsonProperty("read_only") boolean readOnly
) {}
