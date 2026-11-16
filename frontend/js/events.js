document.addEventListener('DOMContentLoaded', async () => {
  renderChrome('events');

  const form = document.getElementById('filter-form');
  const grid = document.getElementById('events-grid');
  const summary = document.getElementById('results-summary');
  const pagination = document.getElementById('pagination');
  const catSelect = document.getElementById('category');
  const params = new URLSearchParams(window.location.search);
  let currentPage = parseInt(params.get('page'), 10) || 1;

  try {
    const { categories } = await Api.get('/categories');
    catSelect.innerHTML += categories.map((c) => `<option value="${c.slug}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
  } catch { /* categories are optional for filtering */ }

  // Prefill from URL
  ['q', 'category', 'location', 'date', 'fee', 'sort'].forEach((k) => {
    if (params.get(k)) document.getElementById(k).value = params.get(k);
  });

  async function load(page = 1) {
    currentPage = page;
    grid.innerHTML = '<div class="spinner"></div>';
    const q = new URLSearchParams();
    ['q', 'category', 'location', 'date', 'fee', 'sort'].forEach((k) => {
      const v = document.getElementById(k).value.trim();
      if (v) q.set(k, v);
    });
    q.set('page', page);
    q.set('limit', 12);
    history.replaceState(null, '', `events.html?${q.toString()}`);

    try {
      const { events, total, pages } = await Api.get(`/events?${q.toString()}`);
      summary.textContent = total ? `${total} event${total === 1 ? '' : 's'} found` : '';
      grid.innerHTML = events.length
        ? events.map(renderTicketCard).join('')
        : `<div class="empty-state" style="grid-column:1/-1;"><div class="glyph">🔍</div><p>No events match your filters. Try widening your search.</p></div>`;
      renderPagination(pages, page);
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  function renderPagination(pages, page) {
    if (pages <= 1) return (pagination.innerHTML = '');
    let html = `<button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹</button>`;
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
        html += `<button class="${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
      } else if (Math.abs(i - page) === 2) {
        html += `<span style="align-self:center;">…</span>`;
      }
    }
    html += `<button ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">›</button>`;
    pagination.innerHTML = html;
    pagination.querySelectorAll('button[data-page]').forEach((b) =>
      b.addEventListener('click', () => {
        load(parseInt(b.dataset.page, 10));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
    );
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    load(1);
  });

  load(currentPage);
});
