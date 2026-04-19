"""FastAPI server for the Decade dashboard. Reads fabric entries and serves a graph."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .graph import build_graph, parse_entry

FABRIC_DIR = Path(os.environ.get("DECADE_FABRIC_DIR", Path.home() / "decade-fabric"))

app = FastAPI(title="Decade Dashboard")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/graph")
def graph():
    return build_graph(FABRIC_DIR)


@app.get("/entry/{filename}")
def entry(filename: str):
    path = (FABRIC_DIR / filename).resolve()
    if not str(path).startswith(str(FABRIC_DIR.resolve())):
        raise HTTPException(400, "invalid path")
    if not path.exists():
        raise HTTPException(404, "entry not found")
    return parse_entry(path)


@app.get("/persona/{name}")
def persona(name: str):
    entries = []
    for f in sorted(FABRIC_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime):
        e = parse_entry(f)
        if e.get("persona", "").lower() == name.lower():
            entries.append(e)
    return {"name": name, "entries": entries}


frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

    @app.get("/")
    def index():
        return FileResponse(str(frontend_dir / "index.html"))
