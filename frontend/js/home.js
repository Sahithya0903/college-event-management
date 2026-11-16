document.addEventListener('DOMContentLoaded', async () => {
  renderChrome('home');

  // ---- categories ----
  const chipRow = document.getElementById('category-chips');
  try {
    const { categories } = await Api.get('/categories');
    chipRow.innerHTML = categories
      .map((c) => `<a class="chip" href="events.html?category=${c.slug}">${c.icon || '🎫'} ${escapeHtml(c.name)}</a>`)
      .join('') || '<p>No categories yet.</p>';
  } catch {
    chipRow.innerHTML = '<p>Could not load categories.</p>';
  }

  // ---- featured / popular events ----
  const grid = document.getElementById('featured-grid');
  try {
    const { events } = await Api.get('/events?sort=popular&limit=6');
    if (!events.length) {
      grid.innerHTML = `<div class="empty-state"><div class="glyph">🎪</div><p>No events published yet. Check back soon!</p></div>`;
    } else {
      grid.innerHTML = events.map(renderTicketCard).join('');
      fillHero(events[0]);
    }
  } catch {
    grid.innerHTML = `<div class="empty-state"><p>Could not load events right now.</p></div>`;
  }
});

function fillHero(ev) {
  const d = new Date(ev.startDate);
  document.getElementById('hero-month').textContent = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  document.getElementById('hero-day').textContent = d.getUTCDate();
  document.getElementById('hero-title').textContent = ev.title;
  document.getElementById('hero-venue').textContent = `${ev.venue}, ${ev.location}`;
  document.getElementById('hero-fee').textContent = ev.fee > 0 ? currency(ev.fee) : 'Free';
  document.getElementById('hero-seats').textContent = `${Math.max(0, ev.capacity - ev.registeredCount)} / ${ev.capacity}`;
  document.getElementById('hero-link').href = `event-details.html?id=${ev._id}`;
}

