package com.ctf.api.challenge;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ChallengeSessionService {
    private final Map<String, ChallengeSession> sessions = new ConcurrentHashMap<>();
    private final Map<UserChallengeKey, Integer> failedAttempts = new ConcurrentHashMap<>();
    private final Map<UserChallengeKey, SolveRecord> solvesByUserChallenge = new ConcurrentHashMap<>();
    private final Map<Integer, Integer> solvesByChallenge = new ConcurrentHashMap<>();
    private final AtomicLong solveOrder = new AtomicLong(1);

    private final Map<Integer, ChallengeDefinition> catalog = Map.of(
        1,
        new ChallengeDefinition(
            1,
            "Warmup Shell",
            "intro",
            "Connect to the jailed shell and recover the flag from /home/ctf/challenge/flag.txt",
            "visible",
            10,
            500,
            100,
            20,
            "alpine:3.21",
            buildSandboxCommand("flag.txt", "flag{ctf_demo_01}"),
            "flag{ctf_demo_01}"
        ),
        2,
        new ChallengeDefinition(
            2,
            "Permissions Trap",
            "linux",
            "Find the readable artifact and escalate within container constraints.",
            "visible",
            8,
            400,
            150,
            15,
            "alpine:3.21",
            buildSandboxCommand("hidden.flag", "flag{ctf_demo_02}"),
            "flag{ctf_demo_02}"
        ),
        3,
        new ChallengeDefinition(
            3,
            "Forensics Quick",
            "forensics",
            "Inspect container filesystem traces and extract the expected token.",
            "visible",
            6,
            300,
            120,
            10,
            "alpine:3.21",
            buildSandboxCommand("logs/audit.log", "trace=flag{ctf_demo_03}"),
            "flag{ctf_demo_03}"
        )
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .build();
    private final ObjectMapper objectMapper;
    private final String orchestratorBaseUrl;

    public ChallengeSessionService(
        @Value("${ctf.orchestrator.url:http://orchestrator:8000}") String orchestratorBaseUrl,
        ObjectMapper objectMapper
    ) {
        this.orchestratorBaseUrl = orchestratorBaseUrl;
        this.objectMapper = objectMapper;
    }

    public List<ChallengeSummaryResponse> listChallenges(String userEmail) {
        return catalog
            .values()
            .stream()
            .sorted(Comparator.comparingInt(ChallengeDefinition::id))
            .map(definition -> {
                int solveCount = solvesByChallenge.getOrDefault(definition.id(), 0);
                boolean solvedByMe =
                    userEmail != null && solvesByUserChallenge.containsKey(new UserChallengeKey(userEmail, definition.id()));
                return new ChallengeSummaryResponse(
                    definition.id(),
                    definition.name(),
                    definition.category(),
                    definition.description(),
                    definition.state(),
                    currentValue(definition, solveCount),
                    solveCount,
                    definition.maxAttempts(),
                    solvedByMe
                );
            })
            .toList();
    }

    public List<ScoreboardEntryResponse> scoreboard() {
        Map<String, List<SolveRecord>> grouped =
            solvesByUserChallenge
                .values()
                .stream()
                .collect(Collectors.groupingBy(SolveRecord::userEmail));

        List<UserScore> scores = new ArrayList<>();
        for (Map.Entry<String, List<SolveRecord>> entry : grouped.entrySet()) {
            int total = entry.getValue().stream().mapToInt(SolveRecord::awardedPoints).sum();
            int solveCount = entry.getValue().size();
            SolveRecord lastSolve = entry
                .getValue()
                .stream()
                .max(Comparator.comparingLong(SolveRecord::solveOrder))
                .orElseThrow();
            scores.add(new UserScore(entry.getKey(), total, solveCount, lastSolve.solvedAt(), lastSolve.solveOrder()));
        }

        scores.sort(
            Comparator
                .comparingInt(UserScore::score)
                .reversed()
                .thenComparingLong(UserScore::lastSolveOrder)
                .thenComparing(UserScore::email)
        );

        List<ScoreboardEntryResponse> rows = new ArrayList<>();
        for (int i = 0; i < scores.size(); i++) {
            UserScore score = scores.get(i);
            rows.add(new ScoreboardEntryResponse(i + 1, score.email(), score.score(), score.solves(), score.lastSolveAt()));
        }
        return rows;
    }

    public ChallengeSession startSession(String userEmail, int challengeId) {
        ChallengeDefinition definition = requireChallenge(challengeId);
        if (!"visible".equalsIgnoreCase(definition.state())) {
            throw new IllegalArgumentException("challenge unavailable");
        }
        terminateExistingSession(userEmail, challengeId);

        SpawnLabResponse spawn = spawnContainer(userEmail, definition);
        String key = key(userEmail, challengeId);

        String terminalPath = "/ws/terminal?containerId=" + spawn.containerId();
        String rdpPath = "/ws/rdp?containerId=" + spawn.containerId();

        ChallengeSession session = new ChallengeSession(
            challengeId,
            userEmail,
            spawn.containerId(),
            spawn.expiresAt(),
            List.of(
                new ConnectionOption("ssh", "Browser SSH", terminalPath),
                new ConnectionOption("rdp", "Browser RDP", rdpPath)
            )
        );

        sessions.put(key, session);
        return session;
    }

    public ChallengeSession getSession(String userEmail, int challengeId) {
        ChallengeSession session = sessions.get(key(userEmail, challengeId));
        if (session == null) {
            throw new IllegalArgumentException("challenge not started");
        }
        if (session.expiresAt().isBefore(Instant.now())) {
            terminateLab(session.containerId());
            sessions.remove(key(userEmail, challengeId));
            throw new IllegalArgumentException("challenge session expired");
        }
        return session;
    }

    public SubmitFlagResponse submitFlag(String userEmail, int challengeId, String flag) {
        ChallengeDefinition definition = requireChallenge(challengeId);
        getSession(userEmail, challengeId);
        UserChallengeKey key = new UserChallengeKey(userEmail, challengeId);

        if (solvesByUserChallenge.containsKey(key)) {
            return new SubmitFlagResponse(true, "already solved", 0, totalScore(userEmail), attemptsRemaining(definition, key));
        }

        Integer remainingBefore = attemptsRemaining(definition, key);
        if (remainingBefore != null && remainingBefore <= 0) {
            return new SubmitFlagResponse(
                false,
                "max attempts reached",
                null,
                totalScore(userEmail),
                0
            );
        }

        boolean correct = MessageDigest.isEqual(
            definition.expectedFlag().getBytes(StandardCharsets.UTF_8),
            flag.getBytes(StandardCharsets.UTF_8)
        );

        if (correct) {
            int awardedPoints = currentValue(definition, solvesByChallenge.getOrDefault(challengeId, 0));
            solvesByChallenge.merge(challengeId, 1, Integer::sum);
            solvesByUserChallenge.put(
                key,
                new SolveRecord(userEmail, challengeId, awardedPoints, Instant.now(), solveOrder.getAndIncrement())
            );
            return new SubmitFlagResponse(
                true,
                "correct flag",
                awardedPoints,
                totalScore(userEmail),
                attemptsRemaining(definition, key)
            );
        }

        failedAttempts.merge(key, 1, Integer::sum);
        return new SubmitFlagResponse(
            false,
            "incorrect flag",
            null,
            totalScore(userEmail),
            attemptsRemaining(definition, key)
        );
    }

    private ChallengeDefinition requireChallenge(int challengeId) {
        ChallengeDefinition definition = catalog.get(challengeId);
        if (definition == null) {
            throw new IllegalArgumentException("unknown challenge");
        }
        return definition;
    }

    private SpawnLabResponse spawnContainer(String userEmail, ChallengeDefinition definition) {
        Map<String, Object> requestBody = Map.of(
            "user_id", Math.abs(userEmail.hashCode()),
            "challenge_image", definition.image(),
            "challenge_command", definition.command(),
            "ttl_minutes", 30,
            "memory_limit", "512m",
            "cpu_quota", 50000,
            "read_only", false
        );

        try {
            String json = objectMapper.writeValueAsString(requestBody);
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(orchestratorBaseUrl + "/labs/spawn"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                throw new IllegalArgumentException("failed to spawn challenge container");
            }

            return objectMapper.readValue(response.body(), SpawnLabResponse.class);
        } catch (Exception ex) {
            throw new IllegalArgumentException("orchestrator error: " + ex.getMessage());
        }
    }

    private void terminateExistingSession(String userEmail, int challengeId) {
        String key = key(userEmail, challengeId);
        ChallengeSession existing = sessions.remove(key);
        if (existing != null) {
            terminateLab(existing.containerId());
        }
    }

    private void terminateLab(String containerId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(orchestratorBaseUrl + "/labs/" + containerId))
                .DELETE()
                .build();
            httpClient.send(request, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {
        }
    }

    private String key(String userEmail, int challengeId) {
        return userEmail + ":" + challengeId;
    }

    private int currentValue(ChallengeDefinition definition, int solveCount) {
        int value = definition.initialValue() - (solveCount * definition.decay());
        return Math.max(definition.minimumValue(), value);
    }

    private int totalScore(String userEmail) {
        return solvesByUserChallenge
            .values()
            .stream()
            .filter(solve -> solve.userEmail().equals(userEmail))
            .mapToInt(SolveRecord::awardedPoints)
            .sum();
    }

    private Integer attemptsRemaining(ChallengeDefinition definition, UserChallengeKey key) {
        if (definition.maxAttempts() <= 0) {
            return null;
        }
        int used = failedAttempts.getOrDefault(key, 0);
        return Math.max(definition.maxAttempts() - used, 0);
    }

    private static String buildSandboxCommand(String artifactPath, String content) {
        String escapedPath = artifactPath.replace("'", "'\"'\"'");
        String escapedContent = content.replace("'", "'\"'\"'");
        String artifactDir = artifactPath.contains("/") ? artifactPath.substring(0, artifactPath.lastIndexOf('/')) : "";
        String escapedDir = artifactDir.replace("'", "'\"'\"'");

        String setupDirCommand = artifactDir.isBlank()
            ? ""
            : "mkdir -p /sandbox/home/ctf/challenge/'" + escapedDir + "'; ";

        return "sh -lc \"set -eu; "
            + "rm -rf /sandbox; "
            + "mkdir -p /sandbox/bin /sandbox/lib /sandbox/home/ctf/challenge /sandbox/tmp /sandbox/etc; "
            + "cp /bin/busybox /sandbox/bin/; "
            + "cp /lib/ld-musl-*.so.1 /sandbox/lib/; "
            + "for c in sh ls cat echo pwd id whoami uname mkdir touch grep; do ln -sf /bin/busybox /sandbox/bin/$c; done; "
            + "echo 'ctf:x:1000:1000:ctf:/home/ctf:/bin/sh' > /sandbox/etc/passwd; "
            + "echo 'ctf:x:1000:' > /sandbox/etc/group; "
            + setupDirCommand
            + "echo '" + escapedContent + "' > /sandbox/home/ctf/challenge/'" + escapedPath + "'; "
            + "chmod 755 /sandbox /sandbox/bin /sandbox/lib /sandbox/home /sandbox/home/ctf /sandbox/home/ctf/challenge; "
            + "chmod -R go-w /sandbox/home/ctf/challenge; "
            + "sleep infinity\"";
    }

    private record UserChallengeKey(String userEmail, int challengeId) {}

    private record SolveRecord(
        String userEmail,
        int challengeId,
        int awardedPoints,
        Instant solvedAt,
        long solveOrder
    ) {}

    private record UserScore(String email, int score, int solves, Instant lastSolveAt, long lastSolveOrder) {}
}
