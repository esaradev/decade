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


OPENROUTER_MODEL_MAP = {
    "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
}


def _call_openrouter(system: str, user: str, model: str, max_tokens: int) -> str:
    import json
    import urllib.request
    import urllib.error
    key = os.environ["OPENROUTER_API_KEY"]
    or_model = OPENROUTER_MODEL_MAP.get(model, f"anthropic/{model}")
    body = json.dumps({
        "model": or_model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }).encode()
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=body, headers=headers,
            )
            resp = urllib.request.urlopen(req, timeout=120)
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:500] if hasattr(e, "read") else str(e)
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError(f"OpenRouter {e.code}: {err_body}") from e
            delay = RETRY_DELAYS[attempt]
            logger.warning("OpenRouter %d (attempt %d): %s, retrying in %ds", e.code, attempt + 1, err_body[:200], delay)
            time.sleep(delay)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            delay = RETRY_DELAYS[attempt]
            logger.warning("OpenRouter call failed (attempt %d): %s, retrying in %ds", attempt + 1, e, delay)
            time.sleep(delay)
    return ""
