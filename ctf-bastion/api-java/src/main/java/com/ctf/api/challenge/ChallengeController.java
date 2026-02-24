package com.ctf.api.challenge;

import com.ctf.api.config.JwtService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/challenges")
public class ChallengeController {
    private final ChallengeSessionService challengeSessionService;
    private final JwtService jwtService;

    public ChallengeController(ChallengeSessionService challengeSessionService, JwtService jwtService) {
        this.challengeSessionService = challengeSessionService;
        this.jwtService = jwtService;
    }

    @PostMapping("/{challengeId}/start")
    public ChallengeSessionResponse start(
        @PathVariable int challengeId,
        @RequestHeader("Authorization") String authorization
    ) {
        String email = parseBearerSubject(authorization);
        ChallengeSession session = challengeSessionService.startSession(email, challengeId);
        return new ChallengeSessionResponse(
            session.challengeId(),
            session.containerId(),
            session.expiresAt(),
            session.options()
        );
    }

    @GetMapping("/{challengeId}/connection-options")
    public ChallengeSessionResponse connectionOptions(
        @PathVariable int challengeId,
        @RequestHeader("Authorization") String authorization
    ) {
        String email = parseBearerSubject(authorization);
        ChallengeSession session = challengeSessionService.getSession(email, challengeId);
        return new ChallengeSessionResponse(
            session.challengeId(),
            session.containerId(),
            session.expiresAt(),
            session.options()
        );
    }

    @PostMapping("/{challengeId}/submit")
    public SubmitFlagResponse submit(
        @PathVariable int challengeId,
        @RequestHeader("Authorization") String authorization,
        @RequestBody SubmitFlagRequest req
    ) {
        String email = parseBearerSubject(authorization);
        return challengeSessionService.submitFlag(email, challengeId, req.flag());
    }

    private String parseBearerSubject(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new IllegalArgumentException("missing bearer token");
        }
        String token = authorization.substring("Bearer ".length()).trim();
        return jwtService.extractSubject(token);
    }
}
