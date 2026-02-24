package com.ctf.api.auth;

import com.ctf.api.config.JwtService;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final AuthService authService;
    private final JwtService jwtService;

    public AuthController(AuthService authService, JwtService jwtService) {
        this.authService = authService;
        this.jwtService = jwtService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "api-java");
    }

    @PostMapping("/auth/register")
    public Map<String, String> register(@RequestBody RegisterRequest req) {
        UserRecord user = authService.register(req.email(), req.password());
        return Map.of("status", "registered", "email", user.email(), "role", user.role());
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@RequestBody LoginRequest req) {
        UserRecord user = authService.login(req.email(), req.password());
        String token = jwtService.issueToken(user.email(), user.role());
        return new AuthResponse(token, user.role(), "900");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> badRequest(IllegalArgumentException ex) {
        return Map.of("error", ex.getMessage());
    }
}
