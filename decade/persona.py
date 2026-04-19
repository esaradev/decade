"""Persona loading and prompt building for decade simulations."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Persona:
    name: str
    age: int
    location: str
    occupation: str
    era: str
    worldview: str
    voice_notes: str
    reading_list: list[str] = field(default_factory=list)
    identity_card: str = ""
    backstory: str = ""

    @property
    def slug(self) -> str:
        return re.sub(r"[^a-z0-9]+", "-", self.name.lower()).strip("-")


FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.S)


def load_persona(path: Path) -> Persona:
    text = path.read_text("utf-8")
    m = FM_RE.match(text)
    if not m:
        raise ValueError(f"no frontmatter in {path}")
    meta = yaml.safe_load(m.group(1))
    body = m.group(2).strip()
    return Persona(
        name=str(meta.get("name", path.stem)),
        age=int(meta.get("age", 30)),
        location=str(meta.get("location", "")),
        occupation=str(meta.get("occupation", "")),
        era=str(meta.get("era", "")),
        worldview=str(meta.get("worldview", "")),
        voice_notes=str(meta.get("voice_notes", "")),
        reading_list=list(meta.get("reading_list") or []),
        identity_card=text,
        backstory=body,
    )


def load_personas(directory: Path, era: str = "", limit: int = 0) -> list[Persona]:
    personas = []
    for p in sorted(directory.glob("*.md")):
        if p.name.lower() == "readme.md":
            continue
        if era and not p.stem.startswith(era):
            continue
        personas.append(load_persona(p))
        if limit and len(personas) >= limit:
            break
    return personas


def build_prompt(persona: Persona, event: dict, context: list[str] | None = None) -> tuple[str, str]:
    system = f"""You are {persona.name}, a {persona.age}-year-old {persona.occupation} living in {persona.location} during the {persona.era}.

{persona.worldview}

Voice and style:
{persona.voice_notes}

Background:
{persona.backstory[:500]}

Rules:
- Write in first person as {persona.name}. Never break character.
- No AI disclaimers, no meta-commentary.
- Write a diary entry of 200-400 words.
- React to the event from your specific life circumstances.
- Reference specific details from your daily life, work, family, neighborhood.
- If the event doesn't directly affect you, write about how you heard about it and what you think."""

    user_parts = [f"Date: {event.get('date', 'unknown')}\nEvent: {event['title']}\n{event.get('summary', '')}"]
    if event.get("impact"):
        user_parts.append(f"Why it matters: {event['impact']}")
    if context:
        user_parts.append("\nRecent entries from other people in this world:\n" + "\n---\n".join(context[-3:]))
    user_parts.append("\nWrite your diary entry for today.")

    return system, "\n\n".join(user_parts)
