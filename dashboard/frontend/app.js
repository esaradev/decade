const PERSONA_COLORS = {};
const PALETTE = ['p1', 'p2', 'p3', 'p1', 'p2', 'p3'];
let allEntries = [];
let graphData = null;

async function init() {
  const resp = await fetch('/graph');
  graphData = resp.ok ? await resp.json() : { nodes: [], links: [], stats: {} };

  const personas = graphData.nodes.filter(n => n.type === 'persona');
  personas.forEach((p, i) => { PERSONA_COLORS[p.label] = PALETTE[i % PALETTE.length]; });

  const entryNodes = graphData.nodes.filter(n => n.type === 'entry');
  for (const node of entryNodes) {
    try {
      const r = await fetch(`/entry/${encodeURIComponent(node.id)}`);
      if (r.ok) allEntries.push(await r.json());
    } catch (e) { /* skip */ }
  }

  const events = [...new Set(allEntries.map(e => e.event_date))].sort();
  const decade = events.length > 0 ? events[0].substring(0, 3) + '0s' : '';
  document.getElementById('decade-label').textContent = decade ? `${decade}` : 'decade';

  renderTimeline(events);

  document.getElementById('overlay-close').addEventListener('click', closeOverlay);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });
}

function renderTimeline(eventDates) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';

  const byEvent = {};
  allEntries.forEach(e => {
    const key = `${e.event_date}|${e.event_title}`;
    if (!byEvent[key]) byEvent[key] = { date: e.event_date, title: e.event_title, entries: [] };
    byEvent[key].entries.push(e);
  });

  const events = Object.values(byEvent).sort((a, b) => a.date.localeCompare(b.date));

  events.forEach(event => {
    const block = document.createElement('div');
    block.className = 'event-block';
    block.innerHTML = `
      <div class="event-header">
        <span class="event-date">${event.date}</span>
        <span class="event-title">${event.title}</span>
      </div>
    `;

    const voices = document.createElement('div');
    voices.className = 'voices';

    event.entries.forEach(entry => {
      const cls = PERSONA_COLORS[entry.persona] || 'p1';
      const excerpt = entry.body.split('\n\n').slice(0, 2).join('\n\n');
      const entities = (entry.entities || []).slice(0, 6);
      const card = document.createElement('div');
      card.className = 'voice';
      card.dataset.file = entry.file;
      card.dataset.persona = entry.persona;
      card.innerHTML = `
        <div class="voice-name ${cls}">${entry.persona}</div>
        <div class="voice-excerpt">${excerpt}</div>
        ${entities.length ? `<div class="voice-entities">${entities.map(e =>
          `<span data-entity="${e}">${e}</span>`
        ).join(' / ')}</div>` : ''}
      `;
      card.addEventListener('click', () => openEntry(entry));
      voices.appendChild(card);
    });

    block.appendChild(voices);
    timeline.appendChild(block);
  });

  timeline.addEventListener('mouseenter', handleEntityHover, true);
  timeline.addEventListener('mouseleave', handleEntityLeave, true);
}

function handleEntityHover(e) {
  const span = e.target.closest('.voice-entities span');
  if (!span) return;
  const entity = span.dataset.entity;
  if (!entity) return;

  const matching = new Set();
  allEntries.forEach(entry => {
    if ((entry.entities || []).some(ent => ent.toLowerCase() === entity.toLowerCase())) {
      matching.add(entry.file);
    }
  });

  document.getElementById('timeline').classList.add('entity-highlight');
  document.querySelectorAll('.voice').forEach(v => {
    if (matching.has(v.dataset.file)) {
      v.classList.add('highlighted');
    } else {
      v.classList.remove('highlighted');
    }
  });
}

function handleEntityLeave(e) {
  const span = e.target.closest('.voice-entities span');
  if (span) return;
  document.getElementById('timeline').classList.remove('entity-highlight');
  document.querySelectorAll('.voice').forEach(v => v.classList.remove('highlighted'));
}

function openEntry(entry) {
  const cls = PERSONA_COLORS[entry.persona] || 'p1';
  const paragraphs = entry.body.split('\n\n').map(p => `<p>${p.trim()}</p>`).join('');
  const entities = entry.entities || [];
  const content = document.getElementById('overlay-content');
  content.innerHTML = `
    <div class="full-persona ${cls}">${entry.persona}</div>
    <div class="full-event">${entry.event_date}</div>
    <div class="full-title">${entry.event_title}</div>
    <div class="full-body">${paragraphs}</div>
    ${entities.length ? `
      <div class="full-entities">
        <div class="full-entities-label">entities</div>
        <div class="full-entities-list">
          ${entities.map(e => `<span class="full-entity" data-entity="${e}">${e}</span>`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  content.querySelectorAll('.full-entity').forEach(el => {
    el.addEventListener('click', () => {
      closeOverlay();
      setTimeout(() => highlightEntity(el.dataset.entity), 350);
    });
  });

  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('overlay').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeOverlay() {
  document.getElementById('overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function highlightEntity(entity) {
  const matching = new Set();
  allEntries.forEach(entry => {
    if ((entry.entities || []).some(e => e.toLowerCase() === entity.toLowerCase())) {
      matching.add(entry.file);
    }
  });

  document.getElementById('timeline').classList.add('entity-highlight');
  document.querySelectorAll('.voice').forEach(v => {
    v.classList.toggle('highlighted', matching.has(v.dataset.file));
  });

  const first = document.querySelector('.voice.highlighted');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });

  setTimeout(() => {
    document.getElementById('timeline').classList.remove('entity-highlight');
    document.querySelectorAll('.voice').forEach(v => v.classList.remove('highlighted'));
  }, 3000);
}

init();
