package com.ctf.api.challenge;

public record ChallengeDefinition(
    int id,
    String name,
    String category,
    String description,
    String state,
    int maxAttempts,
    int initialValue,
    int minimumValue,
    int decay,
    String image,
    String command,
    String expectedFlag
) {}
