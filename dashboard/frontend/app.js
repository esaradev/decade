const P_COLORS = ['#7cacf8', '#c4a06a', '#5cb88a'];
const E_COLOR = '#e8a849';
const ENT_COLOR = '#3a6858';
const ENTRY_COLOR = '#6a6090';

let graph, allEntries = [], sim;
const personaColorMap = {};

async function init() {
  const resp = await fetch('/graph');
  graph = await resp.json();

  const personas = graph.nodes.filter(n => n.type === 'persona');
  personas.forEach((p, i) => { personaColorMap[p.label] = P_COLORS[i % P_COLORS.length]; });

  const fetches = graph.nodes.filter(n => n.type === 'entry').map(n =>
    fetch(`/entry/${encodeURIComponent(n.id)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  );
  allEntries = (await Promise.all(fetches)).filter(Boolean);
  const entryMap = {};
  allEntries.forEach(e => { entryMap[e.file] = e; });

  graph.nodes.forEach(n => {
    n._color = n.type === 'persona' ? (personaColorMap[n.label] || P_COLORS[0])
             : n.type === 'event' ? E_COLOR
             : n.type === 'entity' ? ENT_COLOR
             : ENTRY_COLOR;
    n._r = n.type === 'persona' ? 28
         : n.type === 'event' ? 16
         : n.type === 'entity' ? 4
         : 6;
    n._entry = entryMap[n.id] || null;
  });

  render();
  setupSearch();
  setupDetail();
  breathe();
}

function render() {
  const svg = d3.select('#graph');
  svg.selectAll('*').remove();
  const { width, height } = svg.node().getBoundingClientRect();

  const defs = svg.append('defs');

  graph.nodes.filter(n => n.type === 'persona' || n.type === 'event').forEach(n => {
    const g = defs.append('radialGradient').attr('id', `grd-${css(n.id)}`);
    g.append('stop').attr('offset', '0%').attr('stop-color', n._color).attr('stop-opacity', 0.15);
    g.append('stop').attr('offset', '100%').attr('stop-color', n._color).attr('stop-opacity', 0);
  });

  const events = graph.nodes.filter(n => n.type === 'event');
  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  events.forEach((n, i) => {
    n.fx = 120 + (i / Math.max(1, events.length - 1)) * (width - 240);
    n.fy = height * 0.3 + Math.sin(i * 0.8) * 40;
  });

  const personaNodes = graph.nodes.filter(n => n.type === 'persona');
  personaNodes.forEach((n, i) => {
    n.y = height * 0.7;
    n.x = width * (0.2 + i * 0.3);
  });

  sim = d3.forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.links).id(d => d.id)
      .distance(d => {
        const s = d.source.type || d.source;
        const t = d.target.type || d.target;
        if (s === 'persona' || t === 'persona') return 100;
        if (s === 'event' || t === 'event') return 70;
        return 40;
      })
      .strength(d => {
        const s = d.source.type || d.source;
        return s === 'persona' ? 0.3 : 0.15;
      })
    )
    .force('charge', d3.forceManyBody().strength(d =>
      d.type === 'persona' ? -400 : d.type === 'event' ? -200 : d.type === 'entity' ? -15 : -40
    ))
    .force('y', d3.forceY(d =>
      d.type === 'event' ? height * 0.3 : d.type === 'persona' ? height * 0.72 : height * 0.5
    ).strength(d => d.type === 'event' || d.type === 'persona' ? 0.12 : 0.02))
    .force('collision', d3.forceCollide().radius(d => d._r + 3))
    .alphaDecay(0.015)
    .velocityDecay(0.4);

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', e => g.attr('transform', e.transform)));

  graph.nodes.filter(n => n.type === 'persona' || n.type === 'event').forEach(n => {
    g.append('circle')
      .attr('r', n._r * 3)
      .attr('fill', `url(#grd-${css(n.id)})`)
      .attr('class', `aura aura-${n.id.replace(/[^a-z0-9]/gi, '')}`);
  });

  const edges = g.append('g').selectAll('path').data(graph.links).join('path')
    .attr('class', d => `edge edge-${css(d.source.id || d.source)} edge-${css(d.target.id || d.target)}`)
    .attr('stroke', d => {
      const s = graph.nodes.find(n => n.id === (d.source.id || d.source));
      return s ? s._color : '#1a1a22';
    })
    .attr('stroke-width', d => d.type === 'wrote' ? 1.2 : 0.5)
    .attr('opacity', d => d.type === 'wrote' ? 0.12 : 0.06);

  const nodeGroups = g.append('g').selectAll('g').data(graph.nodes).join('g')
    .attr('class', d => `node-group node-${d.type}`)
    .attr('cursor', d => d.type === 'entity' ? 'default' : 'pointer')
    .call(drag())
    .on('mouseenter', (_, d) => focus(d))
    .on('mouseleave', () => unfocus())
    .on('click', (_, d) => { if (d.type !== 'entity') showDetail(d); });

  nodeGroups.append('circle')
    .attr('r', d => d._r)
    .attr('fill', d => d._color)
    .attr('opacity', d => d.type === 'entity' ? 0.3 : d.type === 'entry' ? 0.4 : 0.7);

  nodeGroups.filter(d => d.type === 'persona').append('text')
    .attr('class', 'node-label node-persona-label')
    .attr('dy', d => d._r + 16)
    .attr('text-anchor', 'middle')
    .attr('fill', d => d._color)
    .text(d => d.label);

  nodeGroups.filter(d => d.type === 'event').append('text')
    .attr('class', 'node-label node-event-label')
    .attr('dy', d => -d._r - 8)
    .attr('text-anchor', 'middle')
    .attr('fill', E_COLOR)
    .attr('opacity', 0.5)
    .text(d => d.label.length > 30 ? d.label.substring(0, 28) + '...' : d.label);

  nodeGroups.filter(d => d.type === 'event').append('text')
    .attr('class', 'node-label node-event-label')
    .attr('dy', d => -d._r - 20)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .attr('font-size', '8px')
    .text(d => d.date || '');

  sim.on('tick', () => {
    edges.attr('d', d => {
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
      return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
    });
    nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
    g.selectAll('.aura').each(function() {
      const id = this.classList[1]?.replace('aura-', '');
      const n = graph.nodes.find(nd => nd.id.replace(/[^a-z0-9]/gi, '') === id);
      if (n) { d3.select(this).attr('cx', n.x).attr('cy', n.y); }
    });
  });
}

function focus(node) {
  const neighbors = new Set([node.id]);
  graph.links.forEach(l => {
    const s = l.source.id || l.source;
    const t = l.target.id || l.target;
    if (s === node.id) neighbors.add(t);
    if (t === node.id) neighbors.add(s);
  });

  d3.select('#graph g').classed('graph-focused', true);
  d3.selectAll('.node-group').classed('dimmed', d => !neighbors.has(d.id)).classed('lit', d => neighbors.has(d.id));
  d3.selectAll('.node-label').classed('dimmed', d => !neighbors.has(d.id)).classed('lit', d => neighbors.has(d.id));
  d3.selectAll('.edge').classed('dimmed', d => {
    const s = d.source.id || d.source;
    const t = d.target.id || d.target;
    return s !== node.id && t !== node.id;
  }).classed('lit', d => {
    const s = d.source.id || d.source;
    const t = d.target.id || d.target;
    return s === node.id || t === node.id;
  });
}

function unfocus() {
  d3.select('#graph g').classed('graph-focused', false);
  d3.selectAll('.node-group, .node-label, .edge').classed('dimmed', false).classed('lit', false);
}

function drag() {
  return d3.drag()
    .on('start', (e, d) => {
      if (!e.active) sim.alphaTarget(0.1).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => {
      if (!e.active) sim.alphaTarget(0);
      if (d.type !== 'event') { d.fx = null; d.fy = null; }
    });
}

function breathe() {
  let t = 0;
  function tick() {
    t += 0.008;
    d3.selectAll('.node-group').filter(d => d.type === 'persona').select('circle')
      .attr('r', d => d._r + Math.sin(t + d.x * 0.01) * 1.5);
    requestAnimationFrame(tick);
  }
  tick();
}

function showDetail(node) {
  const inner = document.getElementById('detail-inner');
  const el = document.getElementById('detail');

  if (node.type === 'entry' && node._entry) {
    const e = node._entry;
    const body = e.body.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('');
    const ents = (e.entities || []).map(x => `<span class="d-entity">${x}</span>`).join('');
    inner.innerHTML = `
      <div class="d-type" style="color:${personaColorMap[e.persona] || '#888'}">diary entry</div>
      <div class="d-title">${e.persona}</div>
      <div class="d-meta">${e.event_date} / ${e.event_title}</div>
      <div class="d-body">${body}</div>
      ${ents ? `<div class="d-entities">${ents}</div>` : ''}
    `;
  } else if (node.type === 'persona') {
    const entries = allEntries.filter(e => e.persona === node.label);
    inner.innerHTML = `
      <div class="d-type" style="color:${node._color}">persona</div>
      <div class="d-title">${node.label}</div>
      <div class="d-meta">${entries.length} diary entries</div>
      <div class="d-entries">
        ${entries.map(e => `
          <div class="d-entry-item" onclick="clickEntry('${e.file}')">
            <div class="d-entry-meta">${e.event_date} / ${e.event_title}</div>
            <div class="d-entry-excerpt">${esc(e.body.substring(0, 180))}...</div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (node.type === 'event') {
    const entries = allEntries.filter(e => e.event_title === node.label);
    inner.innerHTML = `
      <div class="d-type" style="color:${E_COLOR}">historical event</div>
      <div class="d-title">${node.label}</div>
      <div class="d-meta">${node.date || ''} / ${entries.length} reactions</div>
      <div class="d-entries">
        ${entries.map(e => `
          <div class="d-entry-item" onclick="clickEntry('${e.file}')">
            <div class="d-entry-meta" style="color:${personaColorMap[e.persona] || '#555'}">${e.persona}</div>
            <div class="d-entry-excerpt">${esc(e.body.substring(0, 180))}...</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  el.classList.remove('hidden');
}

function clickEntry(file) {
  const node = graph.nodes.find(n => n.id === file);
  if (node) showDetail(node);
}

function setupDetail() {
  document.getElementById('detail-close').onclick = () => document.getElementById('detail').classList.add('hidden');
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.getElementById('detail').classList.add('hidden');
  });
}

function setupSearch() {
  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    if (!q) { unfocus(); return; }
    const matches = new Set();
    graph.nodes.forEach(n => { if (n.label.toLowerCase().includes(q)) matches.add(n.id); });
    d3.selectAll('.node-group').attr('opacity', d => matches.size === 0 || matches.has(d.id) ? 1 : 0.06);
    d3.selectAll('.edge').attr('opacity', d => {
      const s = d.source.id; const t = d.target.id;
      return matches.has(s) || matches.has(t) ? 0.3 : 0.02;
    });
  });
}

function css(id) { return String(id).replace(/[^a-zA-Z0-9]/g, '_'); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

init();
