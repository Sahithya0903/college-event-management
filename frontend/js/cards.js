// Shared "ticket stub" event card renderer, used on the home page, explore page, and favorites list.
function renderTicketCard(ev) {
  const seatsLeft = Math.max(0, ev.capacity - ev.registeredCount);
  return `
  <article class="ticket">
    <a href="event-details.html?id=${ev._id}">
      <div class="ticket-media">
        ${ev.image ? `<img src="${ev.image}" alt="${escapeHtml(ev.title)}" />` : `<div style="display:grid;place-items:center;height:100%;font-size:2.4rem;">🎫</div>`}
        <span class="ticket-cat">${ev.category?.icon || '🎫'} ${escapeHtml(ev.category?.name || 'Event')}</span>
      </div>
    </a>
    <div class="ticket-perf"></div>
    <div class="ticket-body">
      <a href="event-details.html?id=${ev._id}"><h3>${escapeHtml(ev.title)}</h3></a>
      <div class="ticket-meta">
        <span>📅 ${formatDate(ev.startDate)}</span>
        <span>📍 ${escapeHtml(ev.location)}</span>
        <span>🪑 ${seatsLeft} seats left</span>
      </div>
      <div class="ticket-foot">
        <span class="ticket-price ${ev.fee > 0 ? '' : 'free'}">${ev.fee > 0 ? currency(ev.fee) : 'Free'}</span>
        <a href="event-details.html?id=${ev._id}" class="btn btn-outline btn-sm">Details</a>
      </div>
    </div>
  </article>`;
}
