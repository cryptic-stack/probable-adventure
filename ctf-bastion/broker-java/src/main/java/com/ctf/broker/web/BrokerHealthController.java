package com.ctf.broker.web;

import com.ctf.broker.config.TerminalWebSocketHandler;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ws")
public class BrokerHealthController {
    private final TerminalWebSocketHandler terminalWebSocketHandler;

    public BrokerHealthController(TerminalWebSocketHandler terminalWebSocketHandler) {
        this.terminalWebSocketHandler = terminalWebSocketHandler;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "broker-java");
    }

    @GetMapping("/sessions")
    public Map<String, Integer> sessions() {
        return Map.of("active", terminalWebSocketHandler.activeSessionCount());
    }
}
