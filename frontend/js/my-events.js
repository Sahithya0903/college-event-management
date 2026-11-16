document.addEventListener('DOMContentLoaded', () => {
  renderChrome('my-events');
  if (!requireAuth()) return;

  const tabs = document.getElementById('tabs');
  const content = document.getElementById('tab-content');
  let active = 'registrations';

  tabs.querySelectorAll('.chip').forEach((btn) =>
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      active = btn.dataset.tab;
      renderTab(active, content);
    })
  );

  renderTab(active, content);
});

async function renderTab(tab, content) {
  content.innerHTML = '<div class="spinner"></div>';
  try {
    if (tab === 'registrations') return renderRegistrations(content);
    if (tab === 'favorites') return renderFavorites(content);
    if (tab === 'certificates') return renderCertificates(content);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function renderRegistrations(content) {
  const { registrations } = await Api.get('/registrations/my');
  if (!registrations.length) {
    content.innerHTML = `<div class="empty-state"><div class="glyph">🎫</div><p>You haven't registered for any events yet.</p><a href="events.html" class="btn btn-primary" style="margin-top:12px;">Explore events</a></div>`;
    return;
  }
  content.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Payment</th><th></th></tr></thead>
    <tbody>${registrations
      .map((r) => {
        const ev = r.eventId;
        if (!ev) return '';
        return `<tr>
          <td class="wrap-text"><a href="event-details.html?id=${ev._id}"><b>${escapeHtml(ev.title)}</b></a></td>
          <td>${formatDate(ev.startDate)}</td>
          <td><span class="pill pill-${r.status}">${statusLabel(r.status)}</span></td>
          <td><span class="pill pill-${r.paymentStatus}">${statusLabel(r.paymentStatus)}</span></td>
          <td><a class="btn btn-outline btn-sm" href="registration.html?id=${r._id}">View</a></td>
        </tr>`;
      })
      .join('')}</tbody>
  </table></div>`;
}

async function renderFavorites(content) {
  const { favorites } = await Api.get('/favorites');
  if (!favorites.length) {
    content.innerHTML = `<div class="empty-state"><div class="glyph">♡</div><p>No favorites saved yet. Tap the heart on any event to save it here.</p></div>`;
    return;
  }
  content.innerHTML = `<div class="card-grid">${favorites.map((f) => renderTicketCard(f.eventId)).join('')}</div>`;
}

async function renderCertificates(content) {
  const [{ certificates }, { registrations }] = await Promise.all([
    Api.get('/certificates/my'),
    Api.get('/registrations/my'),
  ]);
  const certificateEvents = new Set(certificates.map((c) => String(c.eventId?._id || c.eventId)));
  const attendedWithoutCertificate = registrations.filter((r) =>
    r.status === 'attended' && r.eventId && !certificateEvents.has(String(r.eventId._id))
  );
  if (!certificates.length) {
    content.innerHTML = `${attendedWithoutCertificate.length ? `<div class="panel"><h2 style="font-size:1.1rem;">Participation certificates</h2><p>Your attendance is recorded. After each event ends, you can generate your certificate here if it has not appeared automatically.</p>${attendedWithoutCertificate.map((r) => `<p>${escapeHtml(r.eventId.title)} <button class="btn btn-primary btn-sm" data-generate-certificate="${r.eventId._id}">Get certificate</button></p>`).join('')}</div>` : ''}<div class="empty-state"><div class="glyph">🎓</div><p>Participation certificates appear after attendance is marked and the event has ended. Competition winner certificates appear after the organizer confirms the results.</p></div>`;
    bindCertificateButtons(content);
    return;
  }
  content.innerHTML = `${attendedWithoutCertificate.length ? `<div class="panel"><h2 style="font-size:1.1rem;">Certificates ready to generate</h2><p>These events have your attendance recorded. After an event ends, use the button if its certificate has not appeared automatically.</p>${attendedWithoutCertificate.map((r) => `<p>${escapeHtml(r.eventId.title)} <button class="btn btn-primary btn-sm" data-generate-certificate="${r.eventId._id}">Get certificate</button></p>`).join('')}</div>` : ''}<div class="table-wrap"><table>
    <thead><tr><th>Event</th><th>Award</th><th>Certificate ID</th><th>Issued</th><th></th></tr></thead>
    <tbody>${certificates
      .map(
        (c) => `<tr>
          <td class="wrap-text">${escapeHtml(c.eventId?.title || 'Event')}</td>
          <td>${escapeHtml(c.awardPlace || 'Participation')}</td>
          <td>${escapeHtml(c.certificateId)}</td>
          <td>${formatDate(c.issuedAt)}</td>
          <td><a class="btn btn-outline btn-sm" href="${c.certificateUrl}" target="_blank" rel="noopener">Download PDF</a></td>
        </tr>`
      )
      .join('')}</tbody>
  </table></div>`;
  bindCertificateButtons(content);
}

function bindCertificateButtons(content) {
  content.querySelectorAll('[data-generate-certificate]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Generating…';
    try {
      await Api.post(`/certificates/event/${button.dataset.generateCertificate}/mine`, {});
      toast('Your participation certificate is ready.', 'success');
      renderCertificates(content);
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
      button.textContent = 'Get certificate';
    }
  }));
}
