package com.ctf.api.challenge;

public record ChallengeSummaryResponse(
    int id,
    String name,
    String category,
    String description,
    String state,
    int value,
    int solves,
    int maxAttempts,
    boolean solvedByMe
) {}
