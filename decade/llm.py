"""LLM calling with retry. Uses Anthropic SDK directly."""
from __future__ import annotations

import os
import time
import logging

logger = logging.getLogger("decade.llm")

DEFAULT_MODEL = "claude-sonnet-4-20250514"
MAX_RETRIES = 3
RETRY_DELAYS = [2, 4, 8]


def call_llm(
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int = 2000,
) -> str:
    model = model or os.environ.get("DECADE_MODEL", DEFAULT_MODEL)

    if os.environ.get("OPENROUTER_API_KEY"):
        return _call_openrouter(system, user, model, max_tokens)
    return _call_anthropic(system, user, model, max_tokens)


def _call_anthropic(system: str, user: str, model: str, max_tokens: int) -> str:
    import anthropic
    client = anthropic.Anthropic()
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return resp.content[0].text
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            delay = RETRY_DELAYS[attempt]
            logger.warning("LLM call failed (attempt %d): %s, retrying in %ds", attempt + 1, e, delay)
            time.sleep(delay)
    return ""


def _call_openrouter(system: str, user: str, model: str, max_tokens: int) -> str:
    import json
    import urllib.request
    key = os.environ["OPENROUTER_API_KEY"]
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    for attempt in range(MAX_RETRIES):
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            delay = RETRY_DELAYS[attempt]
            logger.warning("OpenRouter call failed (attempt %d): %s, retrying in %ds", attempt + 1, e, delay)
            time.sleep(delay)
    return ""
