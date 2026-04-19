"""Build a node-link graph from fabric entries for d3 visualization."""
from __future__ import annotations

import re
from pathlib import Path

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.S)
SCALAR_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$')


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    m = FM_RE.match(text)
    if not m:
        return {}, text
    meta: dict = {}
    for line in m.group(1).splitlines():
        sm = SCALAR_RE.match(line)
        if not sm:
            continue
        k, v = sm.group(1), sm.group(2).strip().strip('"')
        meta[k] = v
    return meta, m.group(2)


def _parse_entities_field(raw: str) -> list[str]:
    raw = raw.strip().strip("[]")
    if not raw:
        return []
    return [e.strip().strip("'\"") for e in raw.split(",") if e.strip()]


def parse_entry(path: Path) -> dict:
    text = path.read_text("utf-8", errors="replace")
    meta, body = _parse_frontmatter(text)
    return {
        "file": path.name,
        "persona": meta.get("persona", "unknown"),
        "era": meta.get("era", ""),
        "event_date": meta.get("event_date", ""),
        "event_title": meta.get("event_title", ""),
        "entities": _parse_entities_field(meta.get("entities", "")),
        "body": body.strip(),
        "timestamp": meta.get("timestamp", ""),
    }


def build_graph(fabric_dir: Path) -> dict:
    nodes: list[dict] = []
    links: list[dict] = []
    seen_personas: set[str] = set()
    seen_events: set[str] = set()
    seen_entities: set[str] = set()

    entries = []
    for f in sorted(fabric_dir.glob("*.md"), key=lambda p: p.name):
        entries.append(parse_entry(f))

    for entry in entries:
        entry_id = entry["file"]
        persona = entry["persona"]
        event = entry["event_title"]

        nodes.append({
            "id": entry_id, "type": "entry", "label": f"{persona}: {event}",
            "persona": persona, "event": event,
        })

        if persona not in seen_personas:
            seen_personas.add(persona)
            nodes.append({"id": f"persona:{persona}", "type": "persona", "label": persona})
        links.append({"source": f"persona:{persona}", "target": entry_id, "type": "wrote"})

        if event and event not in seen_events:
            seen_events.add(event)
            nodes.append({
                "id": f"event:{event}", "type": "event", "label": event,
                "date": entry.get("event_date", ""),
            })
        if event:
            links.append({"source": entry_id, "target": f"event:{event}", "type": "reacts_to"})

        for entity in entry.get("entities", []):
            eid = entity.lower()
            if eid not in seen_entities:
                seen_entities.add(eid)
                nodes.append({"id": f"entity:{eid}", "type": "entity", "label": entity})
            links.append({"source": entry_id, "target": f"entity:{eid}", "type": "mentions"})

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "entries": len(entries),
            "personas": len(seen_personas),
            "events": len(seen_events),
            "entities": len(seen_entities),
        },
    }
