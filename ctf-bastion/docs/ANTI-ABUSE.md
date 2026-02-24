# Anti-Abuse Controls

## Broker controls

- Idle timeout and max session duration
- Max commands/sec or max input bytes/sec threshold
- Detect repetitive process spawn and shell upgrade patterns
- Immediate session teardown on policy match

## Orchestrator controls

- Enforce per-user active container quota
- Enforce per-team aggregate resource budget
- Auto-kill on CPU saturation windows and suspicious egress profile
- Hard TTL destroy regardless of user state

## API controls

- Submission delay after failed attempts
- Progressive lockout by challenge and account
- Device/IP fingerprint anomaly scoring

## Event model

- `ABUSE_SIGNAL_LOW`
- `ABUSE_SIGNAL_MEDIUM`
- `ABUSE_SIGNAL_HIGH`
- `ABUSE_BAN_TEMP`
- `ABUSE_BAN_PERM`

Persist all abuse events with UTC timestamp, actor, IP, and evidence pointer.
