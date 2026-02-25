#!/usr/bin/env python3
import argparse
import csv
import json
import re
from dataclasses import dataclass
from html import unescape
from pathlib import Path
from typing import Dict, List, Tuple


QUESTION_RE = re.compile(r'<h3 id="question-(\d+)">.*?</h3>', re.IGNORECASE | re.DOTALL)
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
PROMPT_RE = re.compile(
    r'<p class="admonition-title">(.*?)</p>', re.IGNORECASE | re.DOTALL
)
EXPECTED_RE = re.compile(
    r"<summary>\s*Expected Result[^<]*</summary>\s*<p>(.*?)</p>",
    re.IGNORECASE | re.DOTALL,
)
COMMAND_RE = re.compile(
    r"<summary>\s*Command Line\s*</summary>.*?<code>(.*?)</code>",
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")
LAB_NUM_RE = re.compile(r"lab(\d+)", re.IGNORECASE)
TOKEN_RE = re.compile(r"[A-Za-z0-9_./-]+")
SENTENCE_SPLIT_RE = re.compile(r"[.!?]\s+")
DEFAULT_LINUX_IMAGE = "ctfd-linux-lab-base:latest"

CSV_FIELDS = [
    "name",
    "description",
    "max_attempts",
    "value",
    "type_data",
    "category",
    "type",
    "state",
    "requirements",
    "connection_info",
    "flags",
    "tags",
    "hints",
]

EXCLUDED_LABS = {0}
EXCLUDED_KEYWORDS = (
    "vmware",
    "open-vm-tools",
    "remote work workstation setup",
    "connect or reconnect to vpn",
    "linux-vpn.sh",
    "linuxlabs.dcob.net",
    "instructor will provide the password",
    "workstation setup",
    "system setup for remote work",
)
GENERIC_PROMPTS = {
    "question",
    "task",
    "expected result",
    "command line",
}


@dataclass
class ChallengeRow:
    name: str
    description: str
    max_attempts: int
    value: int
    type_data: str
    category: str
    type: str
    state: str
    requirements: str
    connection_info: str
    flags: str
    tags: str
    hints: str

    def as_csv_row(self) -> Dict[str, str]:
        return {
            "name": self.name,
            "description": self.description,
            "max_attempts": str(self.max_attempts),
            "value": str(self.value),
            "type_data": self.type_data,
            "category": self.category,
            "type": self.type,
            "state": self.state,
            "requirements": self.requirements,
            "connection_info": self.connection_info,
            "flags": self.flags,
            "tags": self.tags,
            "hints": self.hints,
        }


def clean_html(value: str) -> str:
    no_tags = TAG_RE.sub(" ", value)
    text = unescape(no_tags)
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def clean_code(value: str) -> str:
    text = clean_html(value)
    return text.replace("`", "")


def slugify(value: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").upper()
    return re.sub(r"_+", "_", s)


def level_for_lab(lab_number: int, lab_slug: str) -> Tuple[str, int]:
    if lab_number <= 8:
        level = "Beginner"
    elif lab_number <= 18:
        level = "Intermediate"
    elif lab_number <= 27:
        level = "Advanced"
    else:
        level = "Expert"
    if "-remote" in lab_slug.lower() and level in {"Beginner", "Intermediate"}:
        level = "Advanced"
    points = {"Beginner": 100, "Intermediate": 200, "Advanced": 350, "Expert": 500}[level]
    return level, points


def parse_title(raw: str, fallback: str) -> str:
    m = TITLE_RE.search(raw)
    if m:
        title = clean_html(m.group(1))
        title = title.replace(" - MILSYS Wiki", "").strip()
        if title:
            return title
    h1 = H1_RE.search(raw)
    if h1:
        text = clean_html(h1.group(1))
        if text:
            return text
    return fallback


def parse_questions(raw: str) -> List[Tuple[int, str]]:
    matches = list(QUESTION_RE.finditer(raw))
    out: List[Tuple[int, str]] = []
    for i, m in enumerate(matches):
        q_num = int(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        out.append((q_num, raw[start:end]))
    return out


def prompt_from_section(
    section: str, lab_title: str, q_num: int, expected: str, commands: List[str]
) -> str:
    titles = [clean_html(t) for t in PROMPT_RE.findall(section)]
    for title in titles:
        lowered = title.strip().lower()
        if lowered and lowered not in GENERIC_PROMPTS and len(lowered) > 6:
            return title

    if expected:
        first_sentence = SENTENCE_SPLIT_RE.split(expected, maxsplit=1)[0].strip()
        if first_sentence:
            return first_sentence

    if commands:
        first_cmd = commands[0].split()[0]
        return f"Complete the lab task using {first_cmd}"

    return f"Complete {lab_title} question {q_num}"


EXACT_ANSWER_OVERRIDES = {
    "what is your current working directory?": "/home/ctf",
    "what account are you currently logged in as?": "ctf",
}


def build_flag(lab_num: int, q_num: int, prompt: str, seen: Dict[str, int]) -> str:
    normalized_prompt = prompt.strip().lower()
    if normalized_prompt in EXACT_ANSWER_OVERRIDES:
        return EXACT_ANSWER_OVERRIDES[normalized_prompt]

    task = re.sub(r"[^a-z0-9]+", "_", prompt.lower()).strip("_")
    if not task:
        task = "complete_the_task"
    task = re.sub(r"_+", "_", task)
    base = f"lab{lab_num:02d}_q{q_num:02d}_{task}"
    if len(base) > 64:
        base = base[:64].rstrip("_")
    seen[base] = seen.get(base, 0) + 1
    token = base if seen[base] == 1 else f"{base}_{seen[base]}"
    return token


def extract_autograde_commands(commands: List[str]) -> List[str]:
    out: List[str] = []
    for command in commands:
        value = command.strip()
        if not value:
            continue
        lowered = value.lower()
        if any(
            bad in lowered
            for bad in (
                "insert flag",
                "flag #",
                "linux-vpn.sh",
                "checkit",
                "runme",
                "supercat",
            )
        ):
            continue

        first = value.split()[0].strip("`")
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+._-]*$", first):
            continue

        candidate = " ".join(value.split()[:4])
        candidate = re.sub(r"\b127\.0\.0\.\d+\b", "localhost", candidate)
        if candidate not in out:
            out.append(candidate)
        if len(out) >= 3:
            break
    return out


def build_connection_info(runtime_image: str, flag: str, commands: List[str]) -> str:
    autograde_commands = extract_autograde_commands(commands)
    payload = {
        "schema": "ctfd-access-v1",
        "type": "terminal",
        "provision": {
            "enabled": True,
            "image": runtime_image,
            "startup_command": "while true; do sleep 3600; done",
            "flag": flag,
        },
        "autograde": {
            "enabled": bool(autograde_commands),
            "commands": autograde_commands,
        },
    }
    return json.dumps(payload, separators=(",", ":"))


def build_description(
    lab_title: str,
    prompt: str,
    expected: str,
    lab_num: int,
    level: str,
    runtime_image: str,
) -> str:
    # Keep challenge body minimal: only the question/task itself.
    return prompt.strip()


def should_skip_question(
    lab_num: int, lab_title: str, prompt: str, expected: str, commands: List[str]
) -> bool:
    if lab_num in EXCLUDED_LABS:
        return True
    combined = " ".join([lab_title, prompt, expected, " ".join(commands)]).lower()
    return any(keyword in combined for keyword in EXCLUDED_KEYWORDS)


def generic_hints(prompt: str, expected: str, commands: List[str]) -> str:
    hints = [
        {
            "content": "Focus on the Linux utility implied by the task wording.",
            "cost": 10,
        }
    ]
    tokens = TOKEN_RE.findall(" ".join([prompt, expected]))
    primary = next((t for t in tokens if t.isalpha() and len(t) >= 3), None)
    if primary:
        hints.append(
            {
                "content": f"Start by checking manual/help for `{primary.lower()}`.",
                "cost": 25,
            }
        )
    elif commands:
        first_cmd = commands[0].split()[0]
        hints.append(
            {
                "content": f"Identify the right command family (starts with `{first_cmd}`).",
                "cost": 25,
            }
        )
    return json.dumps(hints)


def dynamic_type_data(points: int) -> str:
    # Keep full value for first solve, decay to 50% by solve #5, then clamp.
    minimum = int(points * 0.5)
    payload = {
        "initial": points,
        "minimum": minimum,
        "decay": 5,
        "function": "logarithmic",
    }
    return json.dumps(payload, separators=(",", ":"))


def discover_index_files(source_root: Path) -> List[Path]:
    return sorted(source_root.rglob("index.html"))


def generate(
    source_root: Path, output_dir: Path, runtime_image: str
) -> Tuple[int, Path, Path, Path]:
    rows: List[ChallengeRow] = []
    manifest = []
    seen_flag_tokens: Dict[str, int] = {}
    seen_names: Dict[str, int] = {}

    for index_file in discover_index_files(source_root):
        rel = index_file.relative_to(source_root)
        raw = index_file.read_text(encoding="utf-8", errors="ignore")

        lab_slug = rel.parts[0] if rel.parts else "lab"
        lab_num_match = LAB_NUM_RE.search(lab_slug)
        if not lab_num_match:
            continue
        lab_num = int(lab_num_match.group(1))
        level, points = level_for_lab(lab_num, lab_slug)
        lab_title = parse_title(raw, fallback=f"Lab {lab_num}")
        questions = parse_questions(raw)

        if not questions:
            questions = [(1, raw)]

        for q_num, section in questions:
            expected_match = EXPECTED_RE.search(section)
            expected = clean_html(expected_match.group(1)) if expected_match else ""
            commands = [clean_code(c) for c in COMMAND_RE.findall(section)]
            commands = [c for c in commands if c]
            prompt = prompt_from_section(section, lab_title, q_num, expected, commands)
            if should_skip_question(lab_num, lab_title, prompt, expected, commands):
                continue

            flag = build_flag(lab_num, q_num, prompt, seen=seen_flag_tokens)
            base_name = prompt.strip()
            seen_names[base_name] = seen_names.get(base_name, 0) + 1
            challenge_name = (
                base_name
                if seen_names[base_name] == 1
                else f"{base_name} ({seen_names[base_name]})"
            )
            category = f"Linux / {level}"
            tags = ",".join(["linux", f"lab{lab_num:02d}", level.lower()])
            hints = generic_hints(prompt, expected, commands)
            challenge_type = "dynamic" if level in {"Advanced", "Expert"} else "standard"
            type_data = dynamic_type_data(points) if challenge_type == "dynamic" else ""

            row = ChallengeRow(
                name=challenge_name,
                description=build_description(
                    lab_title=lab_title,
                    prompt=prompt,
                    expected=expected,
                    lab_num=lab_num,
                    level=level,
                    runtime_image=runtime_image,
                ),
                max_attempts=0,
                value=points,
                type_data=type_data,
                category=category,
                type=challenge_type,
                state="visible",
                requirements="",
                connection_info=build_connection_info(runtime_image, flag, commands),
                flags=json.dumps([{"type": "static", "content": flag}]),
                tags=tags,
                hints=hints,
            )
            rows.append(row)
            manifest.append(
                {
                    "name": row.name,
                    "lab": lab_num,
                    "difficulty": level,
                    "points": points,
                    "flag": flag,
                }
            )

    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "linux_challenges.csv"
    json_path = output_dir / "linux_challenges.json"
    manifest_path = output_dir / "linux_manifest.json"

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.as_csv_row())

    with json_path.open("w", encoding="utf-8") as f:
        json.dump([row.as_csv_row() for row in rows], f, indent=2)

    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return len(rows), csv_path, json_path, manifest_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate CTFd challenge imports from linux-lab-wiki HTML pages."
    )
    parser.add_argument(
        "--source",
        default="Labs/linux",
        help="Path to linux-lab-wiki Labs/linux folder",
    )
    parser.add_argument(
        "--output",
        default="ctf-content/linux",
        help="Output directory for generated CTFd import files",
    )
    parser.add_argument(
        "--runtime-image",
        default=DEFAULT_LINUX_IMAGE,
        help="Docker image used for Linux challenge runtime provisioning",
    )
    args = parser.parse_args()

    source_root = Path(args.source)
    if not source_root.exists():
        raise SystemExit(f"Source path not found: {source_root}")

    count, csv_path, json_path, manifest_path = generate(
        source_root=source_root,
        output_dir=Path(args.output),
        runtime_image=args.runtime_image.strip() or DEFAULT_LINUX_IMAGE,
    )
    print(f"Generated {count} challenges")
    print(f"CSV: {csv_path}")
    print(f"JSON: {json_path}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
