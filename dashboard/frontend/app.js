const COLORS = {
  persona: '#60a5fa',
  event: '#f59e0b',
  entity: '#34d399',
  entry: '#a78bfa',
};
const SIZES = { persona: 18, event: 12, entity: 7, entry: 5 };

let allNodes = [];
let allLinks = [];
let activeFilter = 'all';

async function init() {
  const resp = await fetch('/graph');
  const data = await resp.json();
  allNodes = data.nodes;
  allLinks = data.links;

  document.getElementById('stats').textContent =
    `${data.stats.entries} entries · ${data.stats.personas} personas · ${data.stats.events} events · ${data.stats.entities} entities`;

  document.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.type;
      render(filterGraph());
    });
  });

  render(data);
}

function filterGraph() {
  if (activeFilter === 'all') return { nodes: allNodes, links: allLinks };
  const visible = new Set();
  allNodes.forEach(n => {
    if (n.type === activeFilter || n.type === 'entry') visible.add(n.id);
  });
  return {
    nodes: allNodes.filter(n => visible.has(n.id)),
    links: allLinks.filter(l => visible.has(l.source.id || l.source) && visible.has(l.target.id || l.target)),
  };
}

function render({ nodes, links }) {
  const svg = d3.select('#graph');
  svg.selectAll('*').remove();
  const width = svg.node().getBoundingClientRect().width;
  const height = svg.node().getBoundingClientRect().height;

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(60))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => (SIZES[d.type] || 5) + 4));

  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', e => g.attr('transform', e.transform)));

  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', '#27272a')
    .attr('stroke-width', 1);

  const node = g.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('r', d => SIZES[d.type] || 5)
    .attr('fill', d => COLORS[d.type] || '#71717a')
    .attr('opacity', d => d.type === 'entry' ? 0.6 : 0.9)
    .attr('cursor', 'pointer')
    .call(drag(simulation))
    .on('click', (_, d) => showPanel(d));

  const label = g.append('g')
    .selectAll('text')
    .data(nodes.filter(n => n.type !== 'entry'))
    .join('text')
    .text(d => d.label)
    .attr('font-size', d => d.type === 'persona' ? 12 : 9)
    .attr('fill', d => COLORS[d.type])
    .attr('opacity', 0.8)
    .attr('pointer-events', 'none')
    .attr('dx', d => (SIZES[d.type] || 5) + 4)
    .attr('dy', 4);

  node.append('title').text(d => d.label);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });
}

function drag(simulation) {
  return d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    });
}

async function showPanel(node) {
  const panel = document.getElementById('panel-content');
  if (node.type === 'entry') {
    const resp = await fetch(`/entry/${encodeURIComponent(node.id)}`);
    const data = await resp.json();
    const entities = (data.entities || []).map(e => `<span class="entity-tag">${e}</span>`).join('');
    panel.innerHTML = `
      <h2>${data.persona}</h2>
      <div class="meta">${data.event_date} · ${data.event_title}</div>
      <div class="body">${data.body}</div>
      ${entities ? `<div class="entities">${entities}</div>` : ''}
    `;
  } else if (node.type === 'persona') {
    const name = node.label;
    const resp = await fetch(`/persona/${encodeURIComponent(name)}`);
    const data = await resp.json();
    panel.innerHTML = `
      <h2>${name}</h2>
      <div class="meta">${data.entries.length} entries</div>
      ${data.entries.map(e => `
        <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #27272a">
          <div class="meta">${e.event_date} · ${e.event_title}</div>
          <div class="body">${e.body.substring(0, 300)}${e.body.length > 300 ? '...' : ''}</div>
        </div>
      `).join('')}
    `;
  } else if (node.type === 'event') {
    panel.innerHTML = `<h2>${node.label}</h2><div class="meta">${node.date || ''}</div>`;
  } else if (node.type === 'entity') {
    panel.innerHTML = `<h2>${node.label}</h2><div class="meta">entity</div>`;
  }
}

init();
