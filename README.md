# Decade

Pick a decade. Spawn a cast of characters. Watch them live through history.

Decade creates AI personas from any era and runs them through real historical events. Each persona writes diary entries in their own voice, reacting to what happens around them. Their entries feed into a shared knowledge graph that connects people, events, and ideas across the simulation. The result is a browsable, interlinked wiki of lived experience that you can explore as a force-directed graph.

Built for the [Nous Research Hermes Agent Creative Hackathon 2026](https://nous.hermes.ai). Powered by [Icarus](https://github.com/esaradev/icarus-plugin) for shared agent memory and wiki compilation.

## Run

```bash
git clone https://github.com/esaradev/decade.git
cd decade
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your ANTHROPIC_API_KEY

python scripts/run_simulation.py --decade 1960s --personas 3 --turns 5
bash scripts/start_dashboard.sh
```

## How it works

1. You pick a decade and a set of personas (or use the defaults)
2. The system loads real historical events for that period
3. For each event, each persona writes a diary entry reacting to it
4. Entries are written to a shared fabric directory as markdown
5. A dashboard renders the simulation as an interactive graph

## License

Apache 2.0
