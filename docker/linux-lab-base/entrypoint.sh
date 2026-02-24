#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${FLAG:-}" ]]; then
  FLAG_VALUE="${FLAG}"
else
  FLAG_VALUE="flag{linux_default_placeholder}"
fi

mkdir -p /opt/ctf
printf '%s\n' "${FLAG_VALUE}" > /opt/ctf/flag.txt
chmod 0400 /opt/ctf/flag.txt
chown root:root /opt/ctf/flag.txt

cat > /opt/ctf/README.txt <<'EOF'
CTF Lab Runtime
---------------
- Your challenge flag is stored at /opt/ctf/flag.txt
- Use terminal commands to complete the question
- This container is ephemeral and may be reset at any time
EOF
chmod 0444 /opt/ctf/README.txt

if id ctf >/dev/null 2>&1; then
  chown -R ctf:ctf /home/ctf
fi

exec "$@"
