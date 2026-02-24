package com.ctf.api.auth;

public record UserRecord(String email, String passwordHash, String role) {}
