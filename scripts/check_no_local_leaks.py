#!/usr/bin/env python3
import argparse
import ipaddress
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List, Optional, Tuple


TEXT_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".json",
    ".yml",
    ".yaml",
    ".md",
    ".txt",
    ".sh",
    ".ps1",
    ".env",
    ".example",
    ".html",
    ".css",
    ".scss",
    ".ini",
    ".cfg",
    ".conf",
    ".toml",
    ".xml",
    ".csv",
}

WINDOWS_PATH_RE = re.compile(r"(?<![A-Za-z0-9])(?:[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*)")
UNIX_HOME_RE = re.compile(r"(?<![A-Za-z0-9])/home/([^\s/'\"`]+)/[^\s'\"`]+")
MAC_USERS_RE = re.compile(r"(?<![A-Za-z0-9])/Users/([^\s/'\"`]+)/[^\s'\"`]+")
IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
]

ALLOW_MARKER = "allow-local-ref"
CURRENT_USER = (os.getenv("USERNAME") or os.getenv("USER") or "").strip().lower()


def staged_files() -> List[Path]:
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        capture_output=True,
        text=True,
        check=True,
    )
    files: List[Path] = []
    for line in result.stdout.splitlines():
        p = Path(line.strip())
        if p.exists() and p.is_file():
            files.append(p)
    return files


def looks_text(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTENSIONS or path.name in {
        ".env",
        ".env.example",
        ".gitignore",
        "Dockerfile",
        "docker-compose.yml",
    }


def private_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    if ip.version != 4:
        return False
    return any(ip in net for net in PRIVATE_NETS)


def scan_file(path: Path) -> List[Tuple[int, str, str]]:
    findings: List[Tuple[int, str, str]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return findings

    for lineno, line in enumerate(text.splitlines(), start=1):
        if ALLOW_MARKER in line:
            continue

        for match in WINDOWS_PATH_RE.findall(line):
            findings.append((lineno, "windows_path", match))
        for m in UNIX_HOME_RE.finditer(line):
            if CURRENT_USER and m.group(1).lower() == CURRENT_USER:
                findings.append((lineno, "home_path", m.group(0)))
        for m in MAC_USERS_RE.finditer(line):
            if CURRENT_USER and m.group(1).lower() == CURRENT_USER:
                findings.append((lineno, "users_path", m.group(0)))
        for ip_match in IPV4_RE.finditer(line):
            match = ip_match.group(0)
            # Skip CIDR declarations like 10.0.0.0/8 used in code/config.
            tail = line[ip_match.end() : ip_match.end() + 1]
            if tail == "/":
                continue
            if private_ip(match):
                findings.append((lineno, "private_ip", match))
    return findings


def iter_targets(paths: Optional[Iterable[str]], staged: bool) -> List[Path]:
    if staged:
        return staged_files()
    if paths:
        targets = []
        for raw in paths:
            p = Path(raw)
            if p.exists() and p.is_file():
                targets.append(p)
        return targets
    return [p for p in Path(".").rglob("*") if p.is_file()]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Block commits that leak local paths/private IPs."
    )
    parser.add_argument("paths", nargs="*", help="Optional explicit files to scan")
    parser.add_argument(
        "--staged",
        action="store_true",
        help="Scan staged git files only",
    )
    args = parser.parse_args()

    targets = iter_targets(args.paths, args.staged)
    findings = []
    for path in targets:
        if not looks_text(path):
            continue
        for finding in scan_file(path):
            findings.append((path, *finding))

    if not findings:
        print("No local path/private IP leaks detected.")
        return 0

    print("Local path/private IP references detected:")
    for path, lineno, kind, value in findings:
        print(f"- {path}:{lineno} [{kind}] {value}")
    print(
        "\nIf a reference is intentional, add 'allow-local-ref' on that line."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
