package com.ctf.api.auth;

public record AuthResponse(String accessToken, String role, String expiresIn) {}
