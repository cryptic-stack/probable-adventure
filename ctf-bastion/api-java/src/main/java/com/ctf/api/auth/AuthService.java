package com.ctf.api.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final JdbcTemplate jdbcTemplate;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public UserRecord register(String email, String password) {
        Integer existing = jdbcTemplate.queryForObject(
            "SELECT COUNT(1) FROM users WHERE email = ?",
            Integer.class,
            email
        );

        if (existing != null && existing > 0) {
            throw new IllegalArgumentException("email already exists");
        }

        String hash = passwordEncoder.encode(password);
        jdbcTemplate.update(
            "INSERT INTO users (email, password_hash, role, banned) VALUES (?, ?, ?, false)",
            email,
            hash,
            "ROLE_PLAYER"
        );

        return new UserRecord(email, hash, "ROLE_PLAYER");
    }

    public UserRecord login(String email, String password) {
        UserRecord user = jdbcTemplate.query(
            "SELECT email, password_hash, role FROM users WHERE email = ? AND banned = false",
            rs -> rs.next()
                ? new UserRecord(rs.getString("email"), rs.getString("password_hash"), rs.getString("role"))
                : null,
            email
        );

        if (user == null || !passwordEncoder.matches(password, user.passwordHash())) {
            throw new IllegalArgumentException("invalid credentials");
        }

        return user;
    }
}
