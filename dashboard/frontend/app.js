const PERSONA_CLASSES = {};
const PERSONA_NAMES = ['p1', 'p2', 'p3'];
const HEAVY_EVENTS = new Set([
  'jfk assassinated', 'kennedy assassinated', 'mlk assassinated',
  'bloody sunday', 'detroit riots', 'cuban missile crisis',
]);

let allEntries = [];

async function init() {
  const graph = await (await fetch('/graph')).json();
  const personas = graph.nodes.filter(n => n.type === 'persona');
  personas.forEach((p, i) => { PERSONA_CLASSES[p.label] = PERSONA_NAMES[i % 3]; });

  const entryNodes = graph.nodes.filter(n => n.type === 'entry');
  const fetches = entryNodes.map(n =>
    fetch(`/entry/${encodeURIComponent(n.id)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  );
  allEntries = (await Promise.all(fetches)).filter(Boolean);

  build();
  observe();
}

function era(date) {
  const y = parseInt(date, 10);
  if (y <= 1963) return 'early';
  if (y <= 1966) return 'mid';
  return 'late';
}

function weight(title) {
  const t = title.toLowerCase();
  return HEAVY_EVENTS.has(t) || t.includes('assassin') || t.includes('riot') || t.includes('bloody') ? 'heavy' : 'normal';
}

function build() {
  const container = document.getElementById('scroll-container');
  const byEvent = {};
  allEntries.forEach(e => {
    const key = `${e.event_date}|${e.event_title}`;
    if (!byEvent[key]) byEvent[key] = { date: e.event_date, title: e.event_title, entries: [] };
    byEvent[key].entries.push(e);
  });

  const events = Object.values(byEvent).sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) {
    container.innerHTML = '<div class="spacer"><div class="spacer-year">no entries yet</div></div>';
    return;
  }

  let lastYear = '';

  events.forEach((event, i) => {
    const year = event.date.substring(0, 4);
    if (year !== lastYear) {
      container.appendChild(yearSpacer(year));
      lastYear = year;
    }

    const e = era(event.date);
    const w = weight(event.title);

    const moment = el('div', `moment`, { 'data-era': e, 'data-weight': w });
    moment.innerHTML = `
      <div class="moment-date">${event.date}</div>
      <div class="moment-title">${event.title}</div>
    `;
    container.appendChild(moment);

    event.entries.forEach(entry => {
      const cls = PERSONA_CLASSES[entry.persona] || 'p1';
      const paragraphs = entry.body.split('\n\n').map(p => `<p>${esc(p.trim())}</p>`).join('');
      const entities = (entry.entities || []).slice(0, 8).join('  /  ');

      const section = el('div', 'voice-section', { 'data-era': e, 'data-weight': w });
      section.innerHTML = `
        <div class="voice-who" style="color: var(--${cls})">${entry.persona}</div>
        <div class="voice-body">${paragraphs}</div>
        ${entities ? `<div class="voice-entities">${entities}</div>` : ''}
      `;
      container.appendChild(section);

      if (entry !== event.entries[event.entries.length - 1]) {
        container.appendChild(el('div', '', { style: 'height: 6vh' }));
      }
    });

    if (i < events.length - 1) {
      container.appendChild(el('div', '', { style: 'height: 12vh' }));
      container.appendChild(rule());
      container.appendChild(el('div', '', { style: 'height: 12vh' }));
    }
  });

  const ending = el('div', 'ending');
  ending.innerHTML = `
    <div class="ending-count">${allEntries.length}</div>
    <div class="ending-line">voices across a decade</div>
  `;
  container.appendChild(ending);
}

function observe() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.moment, .voice-section, .spacer-year, .ending').forEach(el => io.observe(el));
}

function yearSpacer(year) {
  const s = el('div', 'spacer');
  const y = el('div', 'spacer-year');
  y.textContent = year;
  s.appendChild(y);
  return s;
}

function rule() {
  return el('div', 'voice-rule');
}

function el(tag, className, attrs) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

document.documentElement.style.setProperty('--p1', '#8b9bb5');
document.documentElement.style.setProperty('--p2', '#b5a07a');
document.documentElement.style.setProperty('--p3', '#7aaa8e');

init();
