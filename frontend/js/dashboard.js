document.addEventListener('DOMContentLoaded', () => {
  renderChrome('dashboard');
  if (!requireAuth(['organizer', 'admin'])) return;

  const nav = document.getElementById('dash-nav');
  const content = document.getElementById('dash-content');
  let section = 'events';
  let myEvents = [];

  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      nav.querySelectorAll('a').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      section = a.dataset.section;
      renderSection();
    })
  );

  async function ensureEvents() {
    const { events } = await Api.get('/events/mine');
    myEvents = events;
    return events;
  }

  async function renderSection() {
    content.innerHTML = '<div class="spinner"></div>';
    try {
      if (section === 'events') return renderEvents();
      if (section === 'participants') return renderParticipants();
      if (section === 'attendance') return renderAttendance();
      if (section === 'feedback') return renderFeedback();
      if (section === 'certificates') return renderCertificates();
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function renderEvents() {
    await ensureEvents();
    content.innerHTML = `
      <div class="panel-head" style="margin-bottom:18px;">
        <h2 style="font-family:var(--font-display); margin:0;">My events (${myEvents.length})</h2>
        <button class="btn btn-primary" id="new-event-btn">+ Create event</button>
      </div>
      ${
        myEvents.length
          ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Seats</th><th>Status</th><th></th></tr></thead><tbody>
              ${myEvents
                .map(
                  (ev) => `<tr>
                <td class="wrap-text"><b>${escapeHtml(ev.title)}</b></td>
                <td>${formatDate(ev.startDate)}</td>
                <td>${ev.registeredCount}/${ev.capacity}</td>
                <td><span class="pill pill-${ev.status}">${statusLabel(ev.status)}</span></td>
                <td style="display:flex; gap:6px;">
                  <a class="btn btn-outline btn-sm" href="event-details.html?id=${ev._id}">View</a>
                  <button class="btn btn-outline btn-sm" data-edit="${ev._id}">Edit</button>
                  <button class="btn btn-danger btn-sm" data-delete="${ev._id}">Delete</button>
                </td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>`
          : `<div class="empty-state"><div class="glyph">🎪</div><p>You haven't created any events yet.</p></div>`
      }
    `;
    document.getElementById('new-event-btn').addEventListener('click', () => openEventModal(null, renderEvents));
    content.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const ev = myEvents.find((e) => e._id === b.dataset.edit);
        openEventModal(ev, renderEvents);
      })
    );
    content.querySelectorAll('[data-delete]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this event? This cannot be undone.')) return;
        try {
          await Api.del(`/events/${b.dataset.delete}`);
          toast('Event deleted', 'success');
          renderEvents();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  function eventPicker(events, onPick, emptyMsg) {
    if (!events.length) return `<div class="empty-state"><p>${emptyMsg}</p></div>`;
    return `<div class="field" style="max-width:420px;"><label>Choose an event</label>
      <select id="event-picker">${events.map((e) => `<option value="${e._id}">${escapeHtml(e.title)}</option>`).join('')}</select>
    </div><div id="picker-result"></div>`;
  }

  async function renderParticipants() {
    await ensureEvents();
    content.innerHTML = `<div class="panel"><h2 style="font-size:1.15rem;">Participants</h2>${eventPicker(myEvents, null, 'Create an event first to see its participants.')}</div>`;
    const select = document.getElementById('event-picker');
    if (!select) return;
    const load = () => loadParticipants(select.value);
    select.addEventListener('change', load);
    load();
  }

  async function loadParticipants(eventId) {
    const result = document.getElementById('picker-result');
    result.innerHTML = '<div class="spinner"></div>';
    const [{ registrations }] = await Promise.all([Api.get(`/registrations/event/${eventId}`)]);
    if (!registrations.length) {
      result.innerHTML = `<div class="empty-state"><p>No one has registered yet.</p></div>`;
      return;
    }
    result.innerHTML = `
      <div style="display:flex; justify-content:flex-end; margin:10px 0;">
        <a class="btn btn-outline btn-sm" href="/api/registrations/event/${eventId}/export" target="_blank">Export CSV</a>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Payment</th><th>Payment proof / actions</th></tr></thead><tbody>
      ${registrations
        .map(
          (r) => `<tr>
        <td class="wrap-text"><b>${escapeHtml(r.fullName)}</b><br/><span style="color:var(--slate); font-size:0.8rem;">${escapeHtml(r.registrationId)}</span></td>
        <td class="wrap-text">${escapeHtml(r.email)}<br/>${escapeHtml(r.phone)}</td>
        <td><span class="pill pill-${r.status}">${statusLabel(r.status)}</span></td>
        <td><span class="pill pill-${r.paymentStatus}">${statusLabel(r.paymentStatus)}</span></td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          ${r.payment?.status === 'submitted' ? `<button class="btn btn-outline btn-sm" data-view-proof="${r.payment._id}">View screenshot</button><button class="btn btn-primary btn-sm" data-review-payment="${r.payment._id}" data-decision="approve">Approve payment</button><button class="btn btn-danger btn-sm" data-review-payment="${r.payment._id}" data-decision="reject">Reject proof</button>` : ''}
          ${['pending', 'confirmed'].includes(r.status) ? `<button class="btn btn-danger btn-sm" data-reject-registration="${r._id}">Reject registration</button>` : ''}
        </td>
      </tr>`
        )
        .join('')}
      </tbody></table></div>`;

    result.querySelectorAll('[data-view-proof]').forEach((b) =>
      b.addEventListener('click', async () => {
        const proofWindow = window.open('about:blank', '_blank');
        try {
          const response = await fetch(`/api/payments/${b.dataset.viewProof}/proof`, {
            headers: { Authorization: `Bearer ${Auth.getToken()}` },
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.message || 'Could not open payment screenshot');
          }
          const imageUrl = URL.createObjectURL(await response.blob());
          if (proofWindow) proofWindow.location.href = imageUrl;
          else window.location.href = imageUrl;
          setTimeout(() => URL.revokeObjectURL(imageUrl), 60_000);
        } catch (err) {
          proofWindow?.close();
          toast(err.message, 'error');
        }
      })
    );
    result.querySelectorAll('[data-review-payment]').forEach((b) =>
      b.addEventListener('click', async () => {
        const decision = b.dataset.decision;
        if (decision === 'reject' && !confirm('Reject this payment proof? The participant can submit a corrected screenshot.')) return;
        try {
          await Api.put(`/payments/${b.dataset.reviewPayment}/review`, { decision });
          toast(decision === 'approve' ? 'Payment approved; registration confirmed.' : 'Payment proof rejected.', 'success');
          loadParticipants(eventId);
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
    result.querySelectorAll('[data-reject-registration]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Reject this registration? Any payment will be refunded.')) return;
        try {
          await Api.put(`/registrations/${b.dataset.reject}/status`, { status: 'rejected' });
          toast('Registration rejected', 'success');
          loadParticipants(eventId);
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  async function renderAttendance() {
    await ensureEvents();
    content.innerHTML = `<div class="panel"><h2 style="font-size:1.15rem;">Attendance</h2>${eventPicker(myEvents, null, 'Create an event first to mark attendance.')}</div>`;
    const select = document.getElementById('event-picker');
    if (!select) return;
    const load = () => loadAttendance(select.value);
    select.addEventListener('change', load);
    load();
  }

  async function loadAttendance(eventId) {
    const result = document.getElementById('picker-result');
    result.innerHTML = '<div class="spinner"></div>';
    const { roster, stats } = await Api.get(`/attendance/event/${eventId}`);
    if (!roster.length) {
      result.innerHTML = `<div class="empty-state"><p>No confirmed registrations to mark attendance for yet.</p></div>`;
      return;
    }
    result.innerHTML = `
      <p style="margin:10px 0;">${stats.present} present · ${stats.absent + (stats.total - stats.present - stats.absent)} not yet marked present, of ${stats.total} confirmed</p>
      <div class="field" style="max-width:420px;margin:16px 0;">
        <label for="attendance-search">Search participant name</label>
        <input id="attendance-search" type="search" placeholder="Type a participant name" autocomplete="off">
      </div>
      <p id="attendance-search-empty" class="empty-state" hidden>No participants match that name.</p>
      <div class="table-wrap"><table><thead><tr><th>Participant</th><th>Attendance</th><th></th></tr></thead><tbody>
      ${roster
        .map(
          (r) => `<tr>
        <td class="wrap-text"><b>${escapeHtml(r.name)}</b></td>
        <td>${r.attendance ? `<span class="pill pill-${r.attendance}">${r.attendance === 'present' ? 'Present' : 'Absent'}</span>` : '<span class="pill pill-pending">Not marked</span>'}</td>
        <td style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm" data-mark="${r.registrationId}" data-status="present">Present</button>
          <button class="btn btn-outline btn-sm" data-mark="${r.registrationId}" data-status="absent">Absent</button>
        </td>
      </tr>`
        )
        .join('')}
      </tbody></table></div>`;
    const search = result.querySelector('#attendance-search');
    const rows = [...result.querySelectorAll('tbody tr')];
    const noMatches = result.querySelector('#attendance-search-empty');
    search.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase();
      let visibleCount = 0;
      rows.forEach((row) => {
        const name = row.querySelector('td')?.textContent.toLocaleLowerCase() || '';
        row.hidden = !name.includes(query);
        if (!row.hidden) visibleCount += 1;
      });
      noMatches.hidden = visibleCount > 0;
    });
    result.querySelectorAll('[data-mark]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await Api.post('/attendance', { registrationId: b.dataset.mark, status: b.dataset.status });
          loadAttendance(eventId);
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  async function renderCertificates() {
    await ensureEvents();
    const completed = myEvents.filter((e) => new Date(e.endDate) < new Date() || e.status === 'completed');
    content.innerHTML = `<div class="panel"><h2 style="font-size:1.15rem;">Certificates</h2>${eventPicker(completed, null, 'Certificates can be issued once one of your events has finished.')}</div>`;
    const select = document.getElementById('event-picker');
    if (!select) return;
    const load = () => loadCertificates(select.value);
    select.addEventListener('change', load);
    load();
  }

  async function loadCertificates(eventId) {
    const result = document.getElementById('picker-result');
    result.innerHTML = '<div class="spinner"></div>';
    const [{ certificates }, { registrations }] = await Promise.all([
      Api.get(`/certificates/event/${eventId}`),
      Api.get(`/registrations/event/${eventId}`),
    ]);
    const ev = myEvents.find((item) => String(item._id) === String(eventId));
    const eligible = registrations.filter((r) => ['confirmed', 'attended'].includes(r.status));
    const savedRank = (place) => ev?.rankings?.find((item) => item.place === place)?.registrationId;
    const optionList = (selected) => `<option value="">Choose a participant</option>${eligible.map((r) => {
      const accountName = r.userId?.name || r.fullName || 'Participant';
      return `<option value="${r._id}" ${String(selected || '') === String(r._id) ? 'selected' : ''}>${escapeHtml(accountName)}</option>`;
    }).join('')}`;
    const rankingPanel = ev?.isCompetition ? `
      <div class="panel" style="margin:0 0 18px;">
        <h3 style="margin-bottom:6px;">Competition winners</h3>
        <p>Choose three different registered participants, upload the winners’ certificate background, and confirm. Each participant receives a certificate showing their place.</p>
        ${ev.rankingCertificateBackground ? `<p><a href="${escapeHtml(ev.rankingCertificateBackground)}" target="_blank" rel="noopener">View saved winner certificate layout</a></p>` : ''}
        ${eligible.length < 3 ? '<div class="form-note-banner">At least three confirmed participants are needed to assign all three places.</div>' : `
        <form id="ranking-form">
          <div class="form-grid">
            <div class="field"><label for="rank-first">First place</label><select id="rank-first" required>${optionList(savedRank('First Place'))}</select></div>
            <div class="field"><label for="rank-second">Second place</label><select id="rank-second" required>${optionList(savedRank('Second Place'))}</select></div>
            <div class="field"><label for="rank-third">Third place</label><select id="rank-third" required>${optionList(savedRank('Third Place'))}</select></div>
            <div class="field"><label for="rank-layout">Winner certificate layout</label><input id="rank-layout" type="file" accept="image/png,image/jpeg,image/webp" ${ev.rankingCertificateBackground ? '' : 'required'}><p class="hint">Landscape certificate background, JPG/PNG/WebP, up to 2 MB. Leave the middle area clear for the winner’s name and place.</p></div>
          </div>
          <button class="btn btn-primary" type="submit">Confirm places and issue winner certificates</button>
        </form>`}
      </div>` : '';
    result.innerHTML = `
      ${rankingPanel}
      <div style="margin:10px 0;"><button class="btn btn-primary btn-sm" id="issue-all">Issue certificates to everyone marked present</button></div>
      ${
        certificates.length
          ? `<div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Certificate</th><th>Certificate ID</th><th>Issued</th></tr></thead><tbody>
          ${certificates.map((c) => `<tr><td>${escapeHtml(c.recipientName)}</td><td>${escapeHtml(c.awardPlace || 'Participation')}</td><td>${escapeHtml(c.certificateId)}</td><td>${formatDate(c.issuedAt)}</td></tr>`).join('')}
          </tbody></table></div>`
          : `<div class="empty-state"><p>No certificates issued yet.</p></div>`
      }
    `;
    document.getElementById('ranking-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const first = document.getElementById('rank-first').value;
      const second = document.getElementById('rank-second').value;
      const third = document.getElementById('rank-third').value;
      if (!first || !second || !third || new Set([first, second, third]).size !== 3) {
        toast('Choose three different participants for the three places.', 'error');
        return;
      }
      const button = e.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Confirming…';
      const formData = new FormData();
      formData.set('first', first);
      formData.set('second', second);
      formData.set('third', third);
      const layout = document.getElementById('rank-layout').files[0];
      if (layout) formData.set('rankingCertificateBackground', layout);
      try {
        const { count } = await Api.post(`/certificates/event/${eventId}/rankings`, formData, { isForm: true });
        toast(`Confirmed the winners and issued ${count} certificates.`, 'success');
        await ensureEvents();
        await loadCertificates(eventId);
      } catch (err) {
        toast(err.message, 'error');
        button.disabled = false;
        button.textContent = 'Confirm places and issue winner certificates';
      }
    });
    document.getElementById('issue-all').addEventListener('click', async () => {
      try {
        const { count } = await Api.post(`/certificates/event/${eventId}/issue`);
        toast(`Issued ${count} certificate(s)`, 'success');
        loadCertificates(eventId);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function renderFeedback() {
    await ensureEvents();
    content.innerHTML = `<div class="panel"><h2 style="font-size:1.15rem;">Participant feedback</h2><p>Read ratings and comments participants leave after your events finish.</p>${eventPicker(myEvents, null, 'Create an event first to receive participant feedback.')}</div>`;
    const select = document.getElementById('event-picker');
    if (!select) return;
    const load = () => loadFeedback(select.value, 1);
    select.addEventListener('change', load);
    load();
  }

  async function loadFeedback(eventId, page = 1, append = false) {
    const result = document.getElementById('picker-result');
    if (!result) return;
    if (!append) result.innerHTML = '<div class="spinner"></div>';
    try {
      const data = await Api.get(`/feedback/event/${eventId}/manage?page=${page}`);
      const cards = data.feedback.map((item) => `
        <article class="review-item" style="margin:12px 0;padding:16px;border:1px solid var(--line,#ddd);border-radius:12px;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <strong>${escapeHtml(item.userId?.name || 'Participant')}</strong>
            <span aria-label="${item.rating} out of 5 stars" style="color:#b77900;">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)} <span style="color:var(--slate);">${item.rating}/5</span></span>
          </div>
          <p style="margin:10px 0;white-space:pre-wrap;">${escapeHtml(item.comment || 'No written comment.')}</p>
          <small style="color:var(--slate);">${formatDate(item.createdAt)}</small>
        </article>`).join('');
      const summary = `<div class="panel" style="margin-top:16px;"><h3 style="margin:0 0 6px;">${data.count ? `${Number(data.average).toFixed(1)} / 5 average · ${data.count} ${data.count === 1 ? 'review' : 'reviews'}` : 'No feedback yet'}</h3>${data.count ? `<div id="feedback-cards">${append ? result.querySelector('#feedback-cards')?.innerHTML || '' : ''}${cards}</div>${data.page < data.pages ? `<button class="btn btn-outline" id="feedback-more" data-page="${data.page + 1}">Load more feedback</button>` : ''}` : '<p>Participants can leave feedback after the event has finished.</p>'}</div>`;
      if (append) {
        const oldCards = result.querySelector('#feedback-cards')?.innerHTML || '';
        result.innerHTML = `<div class="panel" style="margin-top:16px;"><h3 style="margin:0 0 6px;">${Number(data.average).toFixed(1)} / 5 average · ${data.count} ${data.count === 1 ? 'review' : 'reviews'}</h3><div id="feedback-cards">${oldCards}${cards}</div>${data.page < data.pages ? `<button class="btn btn-outline" id="feedback-more" data-page="${data.page + 1}">Load more feedback</button>` : ''}</div>`;
      } else {
        result.innerHTML = summary;
      }
      result.querySelector('#feedback-more')?.addEventListener('click', (e) => loadFeedback(eventId, Number(e.currentTarget.dataset.page), true));
    } catch (err) {
      result.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  renderSection();
});
