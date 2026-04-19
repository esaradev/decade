"""Write simulation entries to a fabric-compatible directory."""
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

FABRIC_DIR = Path(os.environ.get("DECADE_FABRIC_DIR", Path.home() / "decade-fabric"))

ENTITY_RE = re.compile(
    r"\b(?:(?:the )?[A-Z][a-z]+(?:\s+(?:of|the|and|for)\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*"
    r"|[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)+)\b"
)


def extract_entities(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for m in ENTITY_RE.finditer(text):
        name = m.group().strip()
        if len(name) < 4 or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append(name)
    return out[:20]


def write_entry(
    persona_name: str,
    era: str,
    event_date: str,
    event_title: str,
    body: str,
    entities: list[str] | None = None,
) -> Path:
    FABRIC_DIR.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", persona_name.lower())[:30]
    suffix = secrets.token_hex(2)
    filename = f"{slug}-{event_date}-{suffix}.md"
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ents = entities or extract_entities(body)

    lines = [
        "---",
        f'persona: "{persona_name}"',
        f'era: "{era}"',
        f'event_date: "{event_date}"',
        f'event_title: "{event_title}"',
        f'type: diary',
        f'timestamp: "{ts}"',
        f'id: "{secrets.token_hex(4)}"',
        f'entities: [{", ".join(f"{e!r}" for e in ents)}]',
        "---",
        "",
        body.strip(),
        "",
    ]

    path = FABRIC_DIR / filename
    path.write_text("\n".join(lines), "utf-8")
    return path


def read_recent(persona_name: str = "", limit: int = 5) -> list[dict]:
    if not FABRIC_DIR.exists():
        return []
    entries = []
    for f in sorted(FABRIC_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
        text = f.read_text("utf-8", errors="replace")
        m = re.search(r'^persona: "?([^"\n]+)"?', text, re.MULTILINE)
        if persona_name and m and m.group(1).strip() != persona_name:
            continue
        body_start = text.find("\n---\n")
        body = text[body_start + 5:].strip() if body_start > 0 else ""
        entries.append({
            "persona": m.group(1).strip() if m else "unknown",
            "body": body[:300],
            "file": f.name,
        })
        if len(entries) >= limit:
            break
    return entries


def read_wiki_entities() -> list[str]:
    wiki_dir = FABRIC_DIR / "wiki" / "entities"
    if not wiki_dir.exists():
        return []
    return [f.stem for f in wiki_dir.glob("*.md")]
