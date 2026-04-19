"""Run the simulation loop: events x personas -> entries."""
from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from .persona import Persona, build_prompt
from .llm import call_llm
from .fabric import write_entry, read_recent, extract_entities

logger = logging.getLogger("decade.simulator")


def _load_events(path: Path, limit: int = 0) -> list[dict]:
    events = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
    events.sort(key=lambda e: e.get("date", ""))
    if limit:
        events = events[:limit]
    return events


def _load_checkpoint(fabric_dir: Path) -> dict:
    cp = fabric_dir / ".checkpoint.json"
    if cp.exists():
        return json.loads(cp.read_text())
    return {"event_index": 0, "entries_written": 0}


def _save_checkpoint(fabric_dir: Path, event_index: int, entries: int) -> None:
    fabric_dir.mkdir(parents=True, exist_ok=True)
    cp = fabric_dir / ".checkpoint.json"
    cp.write_text(json.dumps({"event_index": event_index, "entries_written": entries}))


def _generate_entry(
    persona: Persona, event: dict, model: str, context: list[str]
) -> tuple[str, list[str]]:
    system, user = build_prompt(persona, event, context)
    body = call_llm(system, user, model=model, max_tokens=2000)
    entities = extract_entities(body)
    return body, entities


def run_simulation(
    personas: list[Persona],
    events_file: Path,
    fabric_dir: Path,
    model: str | None = None,
    turns: int = 0,
) -> int:
    events = _load_events(events_file, limit=turns)
    if not events:
        logger.error("no events loaded from %s", events_file)
        return 0

    checkpoint = _load_checkpoint(fabric_dir)
    start_idx = checkpoint["event_index"]
    total_written = checkpoint["entries_written"]

    for ei, event in enumerate(events):
        if ei < start_idx:
            continue
        print(f"[event {ei + 1}/{len(events)}] {event['date']} — {event['title']}")

        context = [e["body"] for e in read_recent(limit=5)]

        with ThreadPoolExecutor(max_workers=min(3, len(personas))) as pool:
            futures = {}
            for pi, persona in enumerate(personas):
                f = pool.submit(_generate_entry, persona, event, model, context)
                futures[f] = (pi, persona)

            for future in as_completed(futures):
                pi, persona = futures[future]
                try:
                    body, entities = future.result()
                    path = write_entry(
                        persona_name=persona.name,
                        era=persona.era,
                        event_date=event["date"],
                        event_title=event["title"],
                        body=body,
                        entities=entities,
                    )
                    total_written += 1
                    print(f"  [{pi + 1}/{len(personas)}] {persona.name} — {len(body)} chars, {len(entities)} entities → {path.name}")
                except Exception as exc:
                    logger.error("failed for %s on %s: %s", persona.name, event["title"], exc)

        if total_written % 10 == 0:
            _save_checkpoint(fabric_dir, ei + 1, total_written)

    _save_checkpoint(fabric_dir, len(events), total_written)
    print(f"\ndone. {total_written} entries written to {fabric_dir}")
    return total_written
