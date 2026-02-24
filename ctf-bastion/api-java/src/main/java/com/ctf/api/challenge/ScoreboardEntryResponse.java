package com.ctf.api.challenge;

import java.time.Instant;

public record ScoreboardEntryResponse(int rank, String email, int score, int solves, Instant lastSolveAt) {}
