"""CLI entry point for decade simulations."""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from .persona import load_personas
from .simulator import run_simulation
from . import fabric


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    ap = argparse.ArgumentParser(description="Run a Decade simulation")
    ap.add_argument("--decade", default="1960s", help="decade prefix for persona/event files")
    ap.add_argument("--personas", type=int, default=3, help="number of personas to use")
    ap.add_argument("--turns", type=int, default=5, help="number of events to simulate (0 = all)")
    ap.add_argument("--events-file", type=str, default=None, help="path to events JSONL")
    ap.add_argument("--model", type=str, default=None, help="LLM model to use")
    ap.add_argument("--output-dir", type=str, default=None, help="fabric output directory")
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    personas_dir = repo_root / "personas"
    events_dir = repo_root / "events"

    personas = load_personas(personas_dir, era=args.decade, limit=args.personas)
    if not personas:
        print(f"no personas found in {personas_dir} matching era '{args.decade}'")
        sys.exit(1)
    print(f"loaded {len(personas)} personas: {', '.join(p.name for p in personas)}")

    events_file = Path(args.events_file) if args.events_file else events_dir / f"{args.decade}_america.jsonl"
    if not events_file.exists():
        print(f"events file not found: {events_file}")
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else Path(os.environ.get("DECADE_FABRIC_DIR", str(Path.home() / "decade-fabric")))
    fabric.FABRIC_DIR = output_dir

    run_simulation(
        personas=personas,
        events_file=events_file,
        fabric_dir=output_dir,
        model=args.model,
        turns=args.turns,
    )
