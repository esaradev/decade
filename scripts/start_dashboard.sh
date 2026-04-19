#!/usr/bin/env bash
cd "$(dirname "$0")/.."
echo "starting decade dashboard on http://localhost:8000"
uvicorn dashboard.backend.main:app --port 8000 --reload &
sleep 2
open http://localhost:8000
wait
