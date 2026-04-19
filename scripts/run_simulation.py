#!/usr/bin/env python3
"""Run a Decade simulation from the command line."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from decade.orchestrator import main
main()
