const P_COLORS = ['#7cacf8', '#c4a06a', '#5cb88a'];
const P_VARS = ['--p1', '--p2', '--p3'];
const E_COLOR = '#e8a849';
const ENT_COLOR = '#3a6858';
const ENTRY_COLOR = '#6a6090';

let graph, allEntries = [], sim;
const pcMap = {};

async function init() {
  graph = await (await fetch('/graph')).json();
  const personas = graph.nodes.filter(n => n.type === 'persona');
  personas.forEach((p, i) => { pcMap[p.label] = { color: P_COLORS[i % 3], var: P_VARS[i % 3] }; });

  const fetches = graph.nodes.filter(n => n.type === 'entry').map(n =>
    fetch(`/entry/${encodeURIComponent(n.id)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  );
  allEntries = (await Promise.all(fetches)).filter(Boolean);
  const entryMap = {};
  allEntries.forEach(e => { entryMap[e.file] = e; });
  graph.nodes.forEach(n => { n._entry = entryMap[n.id] || null; });

  populateIntro();
  populateDashboard();
  setupNav();
  drawParticles();
}

/* ── intro ── */

function populateIntro() {
  const events = [...new Set(allEntries.map(e => e.event_date))].sort();
  const decade = events.length ? events[0].substring(0, 3) + '0s' : '';
  if (decade) {
    document.getElementById('intro-title').textContent = decade;
    document.getElementById('intro-label').textContent = 'an open-source historical simulation';
  }
}

function drawParticles() {
  const container = document.getElementById('intro-particles');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let w, h;
  const dots = [];
  for (let i = 0; i < 60; i++) {
    dots.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0003, vy: (Math.random() - 0.5) * 0.0003, r: Math.random() * 1.5 + 0.5 });
  }
  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  function frame() {
    ctx.clearRect(0, 0, w, h);
    dots.forEach(d => {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > 1) d.vx *= -1;
      if (d.y < 0 || d.y > 1) d.vy *= -1;
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,60,70,0.3)';
      ctx.fill();
    });
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = (dots[i].x - dots[j].x) * w;
        const dy = (dots[i].y - dots[j].y) * h;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(dots[i].x * w, dots[i].y * h);
          ctx.lineTo(dots[j].x * w, dots[j].y * h);
          ctx.strokeStyle = `rgba(40,40,50,${0.15 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
}

/* ── dashboard ── */

function populateDashboard() {
  const s = graph.stats;
  const events = [...new Set(allEntries.map(e => e.event_date))].sort();
  const decade = events.length ? events[0].substring(0, 3) + '0s' : '';

  document.getElementById('dash-era').textContent = decade || 'simulation';
  document.getElementById('dash-summary').innerHTML =
    `${s.entries} voices across ${s.events} historical events.<br>${s.entities} entities discovered. ${s.personas} personas.`;

  const cards = document.getElementById('persona-cards');
  cards.innerHTML = '';
  const personas = graph.nodes.filter(n => n.type === 'persona');
  personas.forEach(p => {
    const entries = allEntries.filter(e => e.persona === p.label);
    const latest = entries[entries.length - 1];
    const quote = latest ? latest.body.split('\n\n')[0].substring(0, 120) + '...' : '';
    const c = pcMap[p.label] || { color: P_COLORS[0] };
    const card = document.createElement('div');
    card.className = 'persona-card';
    card.innerHTML = `
      <div class="pc-color" style="background:${c.color}"></div>
      <div class="pc-name">${p.label}</div>
      <div class="pc-role">${entries.length > 0 ? entries[0].era || '' : ''}</div>
      <div class="pc-quote">"${esc(quote)}"</div>
      <div class="pc-entries">${entries.length} entries</div>
    `;
    cards.appendChild(card);
  });

  const track = document.getElementById('timeline-track');
  track.innerHTML = '';
  const eventNodes = graph.nodes.filter(n => n.type === 'event').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  eventNodes.forEach((ev, i) => {
    const el = document.createElement('div');
    el.className = 'tl-event';
    el.innerHTML = `
      ${i < eventNodes.length - 1 ? '<div class="tl-line"></div>' : ''}
      <div class="tl-dot"></div>
      <div class="tl-date">${(ev.date || '').substring(0, 4)}</div>
      <div class="tl-name">${ev.label.length > 20 ? ev.label.substring(0, 18) + '...' : ev.label}</div>
    `;
    track.appendChild(el);
  });
}

/* ── navigation ── */

function setupNav() {
  document.getElementById('intro-enter').addEventListener('click', () => {
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('dash-enter').addEventListener('click', () => {
    document.getElementById('graph-section').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      if (!sim) renderGraph();
      document.getElementById('hud').classList.add('visible');
      document.getElementById('back-to-dash').classList.add('visible');
    }, 600);
  });
  document.getElementById('back-to-dash').addEventListener('click', () => {
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('hud').classList.remove('visible');
    document.getElementById('back-to-dash').classList.remove('visible');
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.target.id === 'graph-section' && e.isIntersecting) {
        if (!sim) renderGraph();
        document.getElementById('hud').classList.add('visible');
        document.getElementById('back-to-dash').classList.add('visible');
      }
      if (e.target.id === 'dashboard' && e.isIntersecting) {
        document.getElementById('hud').classList.remove('visible');
        document.getElementById('back-to-dash').classList.remove('visible');
      }
    });
  }, { threshold: 0.3 });
  observer.observe(document.getElementById('graph-section'));
  observer.observe(document.getElementById('dashboard'));

  document.getElementById('detail-close').onclick = () => document.getElementById('detail').classList.add('hidden');
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('detail').classList.add('hidden'); });
  setupSearch();
}

/* ── graph ── */

function renderGraph() {
  const svg = d3.select('#graph');
  svg.selectAll('*').remove();
  const { width, height } = svg.node().getBoundingClientRect();

  graph.nodes.forEach(n => {
    n._color = n.type === 'persona' ? (pcMap[n.label]?.color || P_COLORS[0]) : n.type === 'event' ? E_COLOR : n.type === 'entity' ? ENT_COLOR : ENTRY_COLOR;
    n._r = n.type === 'persona' ? 28 : n.type === 'event' ? 16 : n.type === 'entity' ? 4 : 6;
  });

  const defs = svg.append('defs');
  graph.nodes.filter(n => n.type === 'persona' || n.type === 'event').forEach(n => {
    const g = defs.append('radialGradient').attr('id', `grd-${css(n.id)}`);
    g.append('stop').attr('offset', '0%').attr('stop-color', n._color).attr('stop-opacity', 0.15);
    g.append('stop').attr('offset', '100%').attr('stop-color', n._color).attr('stop-opacity', 0);
  });

  const events = graph.nodes.filter(n => n.type === 'event').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  events.forEach((n, i) => {
    n.fx = 120 + (i / Math.max(1, events.length - 1)) * (width - 240);
    n.fy = height * 0.28 + Math.sin(i * 0.8) * 40;
  });

  sim = d3.forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.links).id(d => d.id).distance(d => {
      const s = d.source.type || 'entry'; return s === 'persona' ? 100 : s === 'event' ? 70 : 40;
    }).strength(d => (d.source.type || '') === 'persona' ? 0.3 : 0.15))
    .force('charge', d3.forceManyBody().strength(d => d.type === 'persona' ? -400 : d.type === 'event' ? -200 : d.type === 'entity' ? -15 : -40))
    .force('y', d3.forceY(d => d.type === 'event' ? height * 0.28 : d.type === 'persona' ? height * 0.72 : height * 0.5).strength(d => d.type === 'event' || d.type === 'persona' ? 0.12 : 0.02))
    .force('collision', d3.forceCollide().radius(d => d._r + 3))
    .alphaDecay(0.015).velocityDecay(0.4);

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', e => g.attr('transform', e.transform)));

  graph.nodes.filter(n => n.type === 'persona' || n.type === 'event').forEach(n => {
    g.append('circle').attr('r', n._r * 3).attr('fill', `url(#grd-${css(n.id)})`).attr('class', `aura aura-${css(n.id)}`);
  });

  const edges = g.append('g').selectAll('path').data(graph.links).join('path')
    .attr('class', 'edge').attr('fill', 'none').attr('stroke-linecap', 'round')
    .attr('stroke', d => { const s = graph.nodes.find(n => n.id === (d.source.id || d.source)); return s ? s._color : '#1a1a22'; })
    .attr('stroke-width', d => d.type === 'wrote' ? 1.2 : 0.5)
    .attr('opacity', d => d.type === 'wrote' ? 0.12 : 0.06);

  const nodeGroups = g.append('g').selectAll('g').data(graph.nodes).join('g')
    .attr('class', d => `node-group node-${d.type}`).attr('cursor', d => d.type === 'entity' ? 'default' : 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.1).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); if (d.type !== 'event') { d.fx = null; d.fy = null; } })
    )
    .on('mouseenter', (_, d) => focusNode(d))
    .on('mouseleave', () => unfocusNode())
    .on('click', (_, d) => { if (d.type !== 'entity') showDetail(d); });

  nodeGroups.append('circle').attr('r', d => d._r).attr('fill', d => d._color)
    .attr('opacity', d => d.type === 'entity' ? 0.3 : d.type === 'entry' ? 0.4 : 0.7);

  nodeGroups.filter(d => d.type === 'persona').append('text')
    .attr('class', 'node-label').attr('dy', d => d._r + 16).attr('text-anchor', 'middle')
    .attr('fill', d => d._color).attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 11).attr('font-weight', 500)
    .text(d => d.label);

  nodeGroups.filter(d => d.type === 'event').each(function(d) {
    d3.select(this).append('text').attr('class', 'node-label').attr('dy', -d._r - 18).attr('text-anchor', 'middle')
      .attr('fill', '#333').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 8).text(d.date || '');
    d3.select(this).append('text').attr('class', 'node-label').attr('dy', -d._r - 6).attr('text-anchor', 'middle')
      .attr('fill', E_COLOR).attr('opacity', 0.5).attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9)
      .text(d.label.length > 28 ? d.label.substring(0, 26) + '...' : d.label);
  });

  sim.on('tick', () => {
    edges.attr('d', d => {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
      return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
    });
    nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
    g.selectAll('.aura').each(function() {
      const id = [...this.classList].find(c => c.startsWith('aura-'))?.slice(5);
      const n = graph.nodes.find(nd => css(nd.id) === id);
      if (n) d3.select(this).attr('cx', n.x).attr('cy', n.y);
    });
  });

  let t = 0;
  (function breathe() {
    t += 0.008;
    d3.selectAll('.node-persona').select('circle').attr('r', d => d._r + Math.sin(t + (d.x || 0) * 0.01) * 1.5);
    requestAnimationFrame(breathe);
  })();
}

function focusNode(node) {
  const neighbors = new Set([node.id]);
  graph.links.forEach(l => {
    const s = l.source.id || l.source, t = l.target.id || l.target;
    if (s === node.id) neighbors.add(t);
    if (t === node.id) neighbors.add(s);
  });
  d3.select('#graph g').classed('graph-focused', true);
  d3.selectAll('.node-group').classed('dimmed', d => !neighbors.has(d.id)).classed('lit', d => neighbors.has(d.id));
  d3.selectAll('.node-label').classed('dimmed', d => !neighbors.has(d.id)).classed('lit', d => neighbors.has(d.id));
  d3.selectAll('.edge').each(function(d) {
    const s = d.source.id || d.source, t = d.target.id || d.target;
    const connected = s === node.id || t === node.id;
    d3.select(this).classed('dimmed', !connected).classed('lit', connected);
  });
}

function unfocusNode() {
  d3.select('#graph g').classed('graph-focused', false);
  d3.selectAll('.node-group, .node-label, .edge').classed('dimmed', false).classed('lit', false);
}

function showDetail(node) {
  const inner = document.getElementById('detail-inner');
  if (node.type === 'entry' && node._entry) {
    const e = node._entry;
    const body = e.body.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('');
    const ents = (e.entities || []).map(x => `<span class="d-entity">${x}</span>`).join('');
    inner.innerHTML = `<div class="d-type" style="color:${pcMap[e.persona]?.color || '#888'}">diary entry</div>
      <div class="d-title">${e.persona}</div><div class="d-meta">${e.event_date} / ${e.event_title}</div>
      <div class="d-body">${body}</div>${ents ? `<div class="d-entities">${ents}</div>` : ''}`;
  } else if (node.type === 'persona') {
    const entries = allEntries.filter(e => e.persona === node.label);
    inner.innerHTML = `<div class="d-type" style="color:${node._color}">persona</div>
      <div class="d-title">${node.label}</div><div class="d-meta">${entries.length} diary entries</div>
      <div class="d-entries">${entries.map(e => `<div class="d-entry-item" onclick="openEntry('${e.file}')">
        <div class="d-entry-meta">${e.event_date} / ${e.event_title}</div>
        <div class="d-entry-excerpt">${esc(e.body.substring(0, 180))}...</div></div>`).join('')}</div>`;
  } else if (node.type === 'event') {
    const entries = allEntries.filter(e => e.event_title === node.label);
    inner.innerHTML = `<div class="d-type" style="color:${E_COLOR}">historical event</div>
      <div class="d-title">${node.label}</div><div class="d-meta">${node.date || ''} / ${entries.length} reactions</div>
      <div class="d-entries">${entries.map(e => `<div class="d-entry-item" onclick="openEntry('${e.file}')">
        <div class="d-entry-meta" style="color:${pcMap[e.persona]?.color || '#555'}">${e.persona}</div>
        <div class="d-entry-excerpt">${esc(e.body.substring(0, 180))}...</div></div>`).join('')}</div>`;
  }
  document.getElementById('detail').classList.remove('hidden');
}

function openEntry(file) {
  const node = graph.nodes.find(n => n.id === file);
  if (node) showDetail(node);
}

function setupSearch() {
  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    if (!q) { unfocusNode(); return; }
    const matches = new Set();
    graph.nodes.forEach(n => { if (n.label.toLowerCase().includes(q)) matches.add(n.id); });
    d3.selectAll('.node-group').attr('opacity', d => !matches.size || matches.has(d.id) ? 1 : 0.06);
    d3.selectAll('.edge').attr('opacity', d => {
      const s = d.source.id, t = d.target.id;
      return matches.has(s) || matches.has(t) ? 0.3 : 0.02;
    });
  });
}

function css(id) { return String(id).replace(/[^a-zA-Z0-9]/g, '_'); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

init();
