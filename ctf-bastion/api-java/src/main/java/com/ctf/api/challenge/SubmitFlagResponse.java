package com.ctf.api.challenge;

public record SubmitFlagResponse(
    boolean correct,
    String message,
    Integer awardedPoints,
    int totalScore,
    Integer attemptsRemaining
) {}
