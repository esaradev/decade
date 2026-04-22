const COLORS = {
  persona: '#7cacf8',
  event: '#e8a849',
  entity: '#4fd6a4',
  entry: '#a78bfa',
};
const SIZES = { persona: 22, event: 14, entity: 8, entry: 4 };
const GLOWS = {
  persona: 'rgba(124,172,248,0.4)',
  event: 'rgba(232,168,73,0.35)',
  entity: 'rgba(79,214,164,0.3)',
  entry: 'rgba(167,139,250,0.2)',
};

let allNodes = [];
let allLinks = [];
let activeFilter = 'all';
let searchTerm = '';
let simulation;
let selectedId = null;

async function init() {
  const resp = await fetch('/graph');
  const data = await resp.json();
  allNodes = data.nodes;
  allLinks = data.links;

  allNodes.forEach(n => {
    n._degree = allLinks.filter(l =>
      (l.source === n.id || l.target === n.id) ||
      (l.source.id === n.id || l.target.id === n.id)
    ).length;
  });

  document.getElementById('stats').textContent =
    `${data.stats.entries} entries / ${data.stats.personas} personas / ${data.stats.events} events / ${data.stats.entities} entities`;

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.type;
      render(filterGraph());
    });
  });

  document.getElementById('search').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase();
    updateVisibility();
  });

  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });

  render(data);
}

function filterGraph() {
  if (activeFilter === 'all') return { nodes: [...allNodes], links: [...allLinks] };
  const visible = new Set();
  allNodes.forEach(n => {
    if (n.type === activeFilter || n.type === 'entry') visible.add(n.id);
  });
  return {
    nodes: allNodes.filter(n => visible.has(n.id)),
    links: allLinks.filter(l => {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      return visible.has(s) && visible.has(t);
    }),
  };
}

function getNeighborIds(nodeId) {
  const ids = new Set([nodeId]);
  allLinks.forEach(l => {
    const s = l.source.id || l.source;
    const t = l.target.id || l.target;
    if (s === nodeId) ids.add(t);
    if (t === nodeId) ids.add(s);
  });
  return ids;
}

function updateVisibility() {
  if (!searchTerm) {
    d3.selectAll('.node-group').attr('opacity', 1);
    d3.selectAll('.link').attr('opacity', 0.15);
    d3.selectAll('.label').attr('opacity', 1);
    return;
  }
  d3.selectAll('.node-group').attr('opacity', d =>
    d.label.toLowerCase().includes(searchTerm) ? 1 : 0.08
  );
  d3.selectAll('.label').attr('opacity', d =>
    d.label.toLowerCase().includes(searchTerm) ? 1 : 0.05
  );
  const matchIds = new Set();
  allNodes.forEach(n => {
    if (n.label.toLowerCase().includes(searchTerm)) matchIds.add(n.id);
  });
  d3.selectAll('.link').attr('opacity', d => {
    const s = d.source.id || d.source;
    const t = d.target.id || d.target;
    return matchIds.has(s) || matchIds.has(t) ? 0.3 : 0.03;
  });
}

function render({ nodes, links }) {
  const svg = d3.select('#graph');
  svg.selectAll('*').remove();
  const { width, height } = svg.node().getBoundingClientRect();

  const defs = svg.append('defs');
  Object.entries(GLOWS).forEach(([type, color]) => {
    const filter = defs.append('filter').attr('id', `glow-${type}`);
    filter.append('feGaussianBlur').attr('stdDeviation', type === 'entry' ? 2 : 4).attr('result', 'blur');
    filter.append('feFlood').attr('flood-color', color).attr('result', 'color');
    filter.append('feComposite').attr('in', 'color').attr('in2', 'blur').attr('operator', 'in').attr('result', 'glow');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'glow');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');
  });

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
      const s = d.source.type || 'entry';
      const t = d.target.type || 'entry';
      if (s === 'persona' || t === 'persona') return 80;
      if (s === 'event' || t === 'event') return 60;
      return 45;
    }))
    .force('charge', d3.forceManyBody().strength(d => d.type === 'persona' ? -300 : d.type === 'event' ? -180 : -60))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => (SIZES[d.type] || 4) + 6))
    .alphaDecay(0.02);

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.15, 6]).on('zoom', e => {
    g.attr('transform', e.transform);
    const k = e.transform.k;
    d3.selectAll('.label').attr('opacity', d => {
      if (d.type === 'persona') return 1;
      if (d.type === 'event') return k > 0.6 ? 1 : 0;
      if (d.type === 'entity') return k > 1.2 ? 0.8 : 0;
      return 0;
    });
  }));

  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke', d => d.type === 'wrote' ? '#1e1e30' : '#1a1a22')
    .attr('stroke-width', d => d.type === 'wrote' ? 1.5 : 0.8)
    .attr('opacity', 0.15);

  const nodeGroup = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node-group')
    .attr('cursor', 'pointer')
    .call(drag())
    .on('click', (_, d) => openPanel(d))
    .on('mouseenter', (_, d) => highlightNeighbors(d.id))
    .on('mouseleave', () => resetHighlight());

  nodeGroup.append('circle')
    .attr('class', 'node')
    .attr('r', d => SIZES[d.type] || 4)
    .attr('fill', d => COLORS[d.type] || '#3a3a42')
    .attr('filter', d => `url(#glow-${d.type})`)
    .attr('opacity', d => d.type === 'entry' ? 0.5 : 0.85);

  const label = g.append('g')
    .selectAll('text')
    .data(nodes.filter(n => n.type !== 'entry'))
    .join('text')
    .attr('class', 'label')
    .text(d => d.label)
    .attr('font-family', "'JetBrains Mono', monospace")
    .attr('font-size', d => d.type === 'persona' ? 13 : 10)
    .attr('font-weight', d => d.type === 'persona' ? 600 : 400)
    .attr('fill', d => COLORS[d.type])
    .attr('opacity', d => d.type === 'persona' ? 1 : 0)
    .attr('pointer-events', 'none')
    .attr('dx', d => (SIZES[d.type] || 4) + 6)
    .attr('dy', 4);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
    label.attr('x', d => d.x).attr('y', d => d.y);
  });
}

function highlightNeighbors(nodeId) {
  const neighbors = getNeighborIds(nodeId);
  d3.selectAll('.node-group').attr('opacity', d => neighbors.has(d.id) ? 1 : 0.06);
  d3.selectAll('.link').attr('opacity', d => {
    const s = d.source.id || d.source;
    const t = d.target.id || d.target;
    return (s === nodeId || t === nodeId) ? 0.5 : 0.02;
  });
  d3.selectAll('.label').attr('opacity', d => neighbors.has(d.id) ? 1 : 0.03);
}

function resetHighlight() {
  if (searchTerm) { updateVisibility(); return; }
  d3.selectAll('.node-group').attr('opacity', 1);
  d3.selectAll('.link').attr('opacity', 0.15);
  d3.selectAll('.label').each(function(d) {
    const k = d3.zoomTransform(document.getElementById('graph')).k;
    d3.select(this).attr('opacity',
      d.type === 'persona' ? 1 : d.type === 'event' && k > 0.6 ? 1 : d.type === 'entity' && k > 1.2 ? 0.8 : 0
    );
  });
}

function drag() {
  return d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.15).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    });
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  document.getElementById('panel').classList.add('closed');
  selectedId = null;
}

async function openPanel(node) {
  selectedId = node.id;
  const panel = document.getElementById('panel');
  const content = document.getElementById('panel-content');
  panel.classList.remove('closed');
  panel.classList.add('open');

  if (node.type === 'entry') {
    const resp = await fetch(`/entry/${encodeURIComponent(node.id)}`);
    const data = await resp.json();
    const body = data.body.split('\n\n').map(p => `<p>${p}</p>`).join('');
    const entities = (data.entities || []).map(e =>
      `<span class="entity-tag" onclick="searchFor('${e.replace(/'/g, "\\'")}')">${e}</span>`
    ).join('');
    content.innerHTML = `
      <div class="panel-type entry">diary entry</div>
      <div class="panel-title">${data.persona}</div>
      <div class="panel-meta">
        <span>${data.event_date}</span>
        <span>${data.event_title}</span>
      </div>
      <div class="panel-body">${body}</div>
      ${entities ? `
        <div class="panel-section">
          <div class="panel-section-title">Entities mentioned</div>
          <div class="entity-tags">${entities}</div>
        </div>
      ` : ''}
    `;
  } else if (node.type === 'persona') {
    const resp = await fetch(`/persona/${encodeURIComponent(node.label)}`);
    const data = await resp.json();
    const connections = allLinks.filter(l => (l.source.id || l.source) === node.id).length;
    content.innerHTML = `
      <div class="panel-type persona">persona</div>
      <div class="panel-title">${node.label}</div>
      <div class="panel-meta">
        <span>${data.entries.length} entries</span>
        <span>${connections} connections</span>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Diary entries</div>
        ${data.entries.map(e => `
          <div class="entry-card">
            <div class="entry-card-meta">${e.event_date} / ${e.event_title}</div>
            <div class="entry-card-body">${e.body.substring(0, 250).split('\n\n')[0]}${e.body.length > 250 ? '...' : ''}</div>
            <span class="entry-card-link" onclick="clickEntry('${e.file}')">read full entry</span>
          </div>
        `).join('')}
      </div>
    `;
  } else if (node.type === 'event') {
    const entries = allLinks
      .filter(l => (l.target.id || l.target) === node.id && l.type === 'reacts_to')
      .map(l => l.source.id || l.source);
    const personas = [...new Set(
      allNodes.filter(n => entries.includes(n.id)).map(n => n.persona)
    )];
    content.innerHTML = `
      <div class="panel-type event">historical event</div>
      <div class="panel-title">${node.label}</div>
      <div class="panel-meta">
        <span>${node.date || ''}</span>
        <span>${entries.length} reactions</span>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Personas who reacted</div>
        <ul class="connection-list">
          ${personas.map(p => `
            <li onclick="clickPersona('${p.replace(/'/g, "\\'")}')">
              <span class="connection-dot" style="background:var(--persona)"></span>
              ${p}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  } else if (node.type === 'entity') {
    const mentioningEntries = allLinks
      .filter(l => (l.target.id || l.target) === node.id && l.type === 'mentions')
      .map(l => allNodes.find(n => n.id === (l.source.id || l.source)))
      .filter(Boolean);
    const personas = [...new Set(mentioningEntries.map(e => e.persona))];
    content.innerHTML = `
      <div class="panel-type entity">entity</div>
      <div class="panel-title">${node.label}</div>
      <div class="panel-meta">
        <span>mentioned ${mentioningEntries.length} times</span>
        <span>by ${personas.length} persona${personas.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Mentioned by</div>
        <ul class="connection-list">
          ${personas.map(p => `
            <li onclick="clickPersona('${p.replace(/'/g, "\\'")}')">
              <span class="connection-dot" style="background:var(--persona)"></span>
              ${p}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }
}

function searchFor(term) {
  document.getElementById('search').value = term;
  searchTerm = term.toLowerCase();
  updateVisibility();
}

async function clickEntry(file) {
  const node = allNodes.find(n => n.id === file);
  if (node) openPanel(node);
}

async function clickPersona(name) {
  const node = allNodes.find(n => n.type === 'persona' && n.label === name);
  if (node) openPanel(node);
}

init();
