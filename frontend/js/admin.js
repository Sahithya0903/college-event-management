document.addEventListener('DOMContentLoaded', () => {
  renderChrome('admin');
  if (!requireAuth(['admin'])) return;

  const nav = document.getElementById('admin-nav');
  const content = document.getElementById('admin-content');
  let section = 'overview';

  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      nav.querySelectorAll('a').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      section = a.dataset.section;
      renderSection();
    })
  );

  async function renderSection() {
    content.innerHTML = '<div class="spinner"></div>';
    try {
      if (section === 'overview') return renderOverview();
      if (section === 'events') return renderAllEvents();
      if (section === 'registrations') return renderRegistrations();
      if (section === 'payments') return renderPayments();
      if (section === 'users') return renderUsers();
      if (section === 'categories') return renderCategories();
      if (section === 'venues') return renderVenues();
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function renderOverview() {
    const { stats, recentPayments } = await Api.get('/admin/dashboard');
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card accent"><div class="label">Total events</div><div class="value">${stats.totalEvents}</div></div>
        <div class="stat-card"><div class="label">Total users</div><div class="value">${stats.totalUsers}</div></div>
        <div class="stat-card"><div class="label">Registrations</div><div class="value">${stats.totalRegistrations}</div></div>
        <div class="stat-card accent"><div class="label">Revenue</div><div class="value">${currency(stats.revenue)}</div></div>
        <div class="stat-card"><div class="label">Upcoming events</div><div class="value">${stats.upcomingEvents}</div></div>
        <div class="stat-card"><div class="label">Completed events</div><div class="value">${stats.completedEvents}</div></div>
        <div class="stat-card"><div class="label">Pending registrations</div><div class="value">${stats.pendingRegistrations}</div></div>
        <div class="stat-card"><div class="label">Marked present</div><div class="value">${stats.attendance.present || 0}</div></div>
      </div>
      <div class="panel">
        <h2 style="font-size:1.1rem;">Recent payments</h2>
        ${
          recentPayments.length
            ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>User</th><th>Amount</th><th>Date</th></tr></thead><tbody>
            ${recentPayments.map((p) => `<tr><td>${escapeHtml(p.eventId?.title || '—')}</td><td>${escapeHtml(p.userId?.name || '—')}</td><td>${currency(p.amount)}</td><td>${formatDate(p.createdAt)}</td></tr>`).join('')}
            </tbody></table></div>`
            : `<p>No payments yet.</p>`
        }
      </div>
    `;
  }

  async function renderAllEvents() {
    const { events } = await Api.get('/events/mine');
    content.innerHTML = `
      <div class="panel-head" style="margin-bottom:18px;">
        <h2 style="font-family:var(--font-display); margin:0;">All events (${events.length})</h2>
        <button class="btn btn-primary" id="new-event-btn">+ Create event</button>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>Organizer</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>
      ${events
        .map(
          (ev) => `<tr>
        <td class="wrap-text"><b>${escapeHtml(ev.title)}</b></td>
        <td>${escapeHtml(ev.organizerId?.name || '—')}</td>
        <td>${formatDate(ev.startDate)}</td>
        <td><span class="pill pill-${ev.status}">${statusLabel(ev.status)}</span></td>
        <td style="display:flex; gap:6px;">
          <a class="btn btn-outline btn-sm" href="event-details.html?id=${ev._id}">View</a>
          <button class="btn btn-outline btn-sm" data-edit="${ev._id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${ev._id}">Delete</button>
        </td>
      </tr>`
        )
        .join('')}
      </tbody></table></div>
    `;
    document.getElementById('new-event-btn').addEventListener('click', () => openEventModal(null, renderAllEvents));
    content.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const ev = events.find((e) => e._id === b.dataset.edit);
        openEventModal(ev, renderAllEvents);
      })
    );
    content.querySelectorAll('[data-delete]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this event permanently?')) return;
        try {
          await Api.del(`/events/${b.dataset.delete}`);
          toast('Event deleted', 'success');
          renderAllEvents();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  async function renderUsers() {
    const { users } = await Api.get('/users');
    content.innerHTML = `
      <div class="panel-head" style="margin-bottom:18px;"><h2 style="font-family:var(--font-display); margin:0;">Users (${users.length})</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${users
        .map(
          (u) => `<tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>
          <select data-role="${u._id}" ${u._id === Auth.getUser()._id ? 'disabled' : ''}>
            ${['user', 'organizer', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </td>
        <td><span class="pill pill-${u.status}">${statusLabel(u.status)}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" data-toggle="${u._id}" data-current="${u.status}" ${u._id === Auth.getUser()._id ? 'disabled' : ''}>${u.status === 'active' ? 'Block' : 'Unblock'}</button>
        </td>
      </tr>`
        )
        .join('')}
      </tbody></table></div>
    `;
    content.querySelectorAll('[data-role]').forEach((sel) =>
      sel.addEventListener('change', async () => {
        try {
          await Api.put(`/users/${sel.dataset.role}`, { role: sel.value });
          toast('Role updated', 'success');
        } catch (err) {
          toast(err.message, 'error');
          renderUsers();
        }
      })
    );
    content.querySelectorAll('[data-toggle]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const next = btn.dataset.current === 'active' ? 'blocked' : 'active';
        try {
          await Api.put(`/users/${btn.dataset.toggle}`, { status: next });
          toast(next === 'blocked' ? 'User blocked' : 'User unblocked', 'success');
          renderUsers();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  async function renderCategories() {
    const { categories } = await Api.get('/categories');
    content.innerHTML = `
      <div class="panel">
        <h2 style="font-size:1.1rem;">Add category</h2>
        <form id="cat-form" class="field-row" style="align-items:flex-end;">
          <div class="field"><label>Icon (emoji)</label><input id="cat-icon" value="🎫" style="width:70px;" /></div>
          <div class="field" style="flex:2;"><label>Name</label><input id="cat-name" required /></div>
          <button class="btn btn-primary">Add</button>
        </form>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Icon</th><th>Name</th><th></th></tr></thead><tbody>
      ${categories.map((c) => `<tr><td>${c.icon}</td><td>${escapeHtml(c.name)}</td><td><button class="btn btn-danger btn-sm" data-del="${c._id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>
    `;
    document.getElementById('cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.post('/categories', { name: document.getElementById('cat-name').value.trim(), icon: document.getElementById('cat-icon').value.trim() });
        toast('Category added', 'success');
        renderCategories();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    content.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this category?')) return;
        try {
          await Api.del(`/categories/${b.dataset.del}`);
          toast('Category deleted', 'success');
          renderCategories();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  async function renderVenues() {
    const { venues } = await Api.get('/venues');
    content.innerHTML = `
      <div class="panel">
        <h2 style="font-size:1.1rem;">Add venue</h2>
        <form id="venue-form" class="field-row" style="align-items:flex-end; flex-wrap:wrap;">
          <div class="field"><label>Name</label><input id="v-name" required /></div>
          <div class="field"><label>City</label><input id="v-city" required /></div>
          <div class="field"><label>Capacity</label><input id="v-capacity" type="number" min="1" value="100" style="width:100px;" /></div>
          <button class="btn btn-primary">Add</button>
        </form>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>City</th><th>Capacity</th><th></th></tr></thead><tbody>
      ${venues.map((v) => `<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.city)}</td><td>${v.capacity}</td><td><button class="btn btn-danger btn-sm" data-del="${v._id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>
    `;
    document.getElementById('venue-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.post('/venues', {
          name: document.getElementById('v-name').value.trim(),
          city: document.getElementById('v-city').value.trim(),
          capacity: document.getElementById('v-capacity').value,
        });
        toast('Venue added', 'success');
        renderVenues();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    content.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this venue?')) return;
        try {
          await Api.del(`/venues/${b.dataset.del}`);
          toast('Venue deleted', 'success');
          renderVenues();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  }

  // ---------- Registrations & Payments (admin lists) ----------
  const listState = {
    registrations: { q: '', status: '', paymentStatus: '', eventId: '', page: 1 },
    payments: { q: '', status: '', eventId: '', page: 1 },
  };

  const qs = (obj) =>
    Object.entries(obj)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

  async function downloadCsv(path, filename) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${Auth.getToken()}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const options = (list, selected, allLabel) =>
    `<option value="">${allLabel}</option>` + list.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');

  const pager = (page, pages, total) => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
      <span style="font-size:0.85rem;">${total} record${total === 1 ? '' : 's'} · Page ${page} of ${pages}</span>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-outline btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
        <button class="btn btn-outline btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button>
      </div>
    </div>`;

  function bindListControls(key, rerender) {
    const st = listState[key];
    const apply = () => {
      st.q = document.getElementById('f-q').value.trim();
      st.status = document.getElementById('f-status').value;
      st.eventId = document.getElementById('f-event').value;
      const ps = document.getElementById('f-pay');
      if (ps) st.paymentStatus = ps.value;
      st.page = 1;
      rerender();
    };
    document.getElementById('f-form').addEventListener('submit', (e) => {
      e.preventDefault();
      apply();
    });
    ['f-status', 'f-event', 'f-pay'].forEach((id) => document.getElementById(id)?.addEventListener('change', apply));
    document.getElementById('f-clear').addEventListener('click', () => {
      Object.keys(st).forEach((k) => (st[k] = k === 'page' ? 1 : ''));
      rerender();
    });
    content.querySelectorAll('[data-page]').forEach((b) =>
      b.addEventListener('click', () => {
        st.page = Number(b.dataset.page);
        rerender();
      })
    );
  }

  async function renderRegistrations() {
    const st = listState.registrations;
    const [{ registrations, total, page, pages }, { events }] = await Promise.all([
      Api.get(`/admin/registrations?${qs(st)}`),
      Api.get('/events/mine'),
    ]);
    content.innerHTML = `
      <div class="panel-head" style="margin-bottom:14px;">
        <h2 style="font-family:var(--font-display); margin:0;">Registrations</h2>
        <button class="btn btn-outline" id="export-btn">Export CSV</button>
      </div>
      <form id="f-form" class="field-row" style="align-items:flex-end; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <div class="field" style="flex:2; min-width:180px;"><label>Search</label><input id="f-q" value="${escapeHtml(st.q)}" placeholder="Name, email, phone or reg. ID" /></div>
        <div class="field"><label>Event</label><select id="f-event">${options(events.map((e) => [e._id, escapeHtml(e.title)]), st.eventId, 'All events')}</select></div>
        <div class="field"><label>Status</label><select id="f-status">${options(['pending', 'confirmed', 'cancelled', 'rejected', 'attended', 'no_show'].map((s) => [s, statusLabel(s)]), st.status, 'All')}</select></div>
        <div class="field"><label>Payment</label><select id="f-pay">${options(['not_required', 'pending', 'paid', 'failed', 'refunded'].map((s) => [s, statusLabel(s)]), st.paymentStatus, 'All')}</select></div>
        <button class="btn btn-primary">Search</button>
        <button type="button" class="btn btn-outline" id="f-clear">Clear</button>
      </form>
      ${
        registrations.length
          ? `<div class="table-wrap"><table><thead><tr><th>Reg. ID</th><th>Participant</th><th>Event</th><th>Phone</th><th>Fee</th><th>Payment</th><th>Status</th><th>Registered</th></tr></thead><tbody>
          ${registrations
            .map(
              (r) => `<tr>
            <td>${escapeHtml(r.registrationId)}</td>
            <td class="wrap-text"><b>${escapeHtml(r.fullName)}</b><br /><span style="font-size:0.8rem;">${escapeHtml(r.email)}</span></td>
            <td class="wrap-text">${escapeHtml(r.eventId?.title || '—')}</td>
            <td>${escapeHtml(r.phone)}</td>
            <td>${r.eventId?.fee > 0 ? currency(r.eventId.fee) : 'Free'}</td>
            <td><span class="pill pill-${r.paymentStatus}">${statusLabel(r.paymentStatus)}</span></td>
            <td><span class="pill pill-${r.status}">${statusLabel(r.status)}</span></td>
            <td>${formatDate(r.registeredAt)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>${pager(page, pages, total)}`
          : `<div class="empty-state"><p>No registrations found.</p></div>`
      }
    `;
    bindListControls('registrations', renderRegistrations);
    document.getElementById('export-btn').addEventListener('click', () => downloadCsv(`/admin/registrations/export?${qs({ ...st, page: '' })}`, 'registrations.csv'));
  }

  async function renderPayments() {
    const st = listState.payments;
    const [{ payments, total, page, pages, summary }, { events }] = await Promise.all([
      Api.get(`/admin/payments?${qs(st)}`),
      Api.get('/events/mine'),
    ]);
    content.innerHTML = `
      <div class="panel-head" style="margin-bottom:14px;">
        <h2 style="font-family:var(--font-display); margin:0;">Payments</h2>
        <button class="btn btn-outline" id="export-btn">Export CSV</button>
      </div>
      <div class="stat-grid" style="margin-bottom:14px;">
        <div class="stat-card accent"><div class="label">Received</div><div class="value">${currency(summary.successful)}</div></div>
        <div class="stat-card"><div class="label">Pending</div><div class="value">${currency(summary.pending)}</div></div>
        <div class="stat-card"><div class="label">Proofs to review</div><div class="value">${currency(summary.submitted)}</div></div>
        <div class="stat-card"><div class="label">Failed</div><div class="value">${currency(summary.failed)}</div></div>
        <div class="stat-card"><div class="label">Refunded</div><div class="value">${currency(summary.refunded)}</div></div>
      </div>
      <form id="f-form" class="field-row" style="align-items:flex-end; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <div class="field" style="flex:2; min-width:180px;"><label>Search</label><input id="f-q" value="${escapeHtml(st.q)}" placeholder="Transaction ID, user name or email" /></div>
        <div class="field"><label>Event</label><select id="f-event">${options(events.map((e) => [e._id, escapeHtml(e.title)]), st.eventId, 'All events')}</select></div>
        <div class="field"><label>Status</label><select id="f-status">${options(['successful', 'pending', 'submitted', 'failed', 'refunded'].map((s) => [s, statusLabel(s)]), st.status, 'All')}</select></div>
        <button class="btn btn-primary">Search</button>
        <button type="button" class="btn btn-outline" id="f-clear">Clear</button>
      </form>
      ${
        payments.length
          ? `<div class="table-wrap"><table><thead><tr><th>Transaction</th><th>User</th><th>Event</th><th>Reg. ID</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
          ${payments
            .map(
              (p) => `<tr>
            <td>${escapeHtml(p.transactionId)}</td>
            <td class="wrap-text"><b>${escapeHtml(p.userId?.name || '—')}</b><br /><span style="font-size:0.8rem;">${escapeHtml(p.userId?.email || '')}</span></td>
            <td class="wrap-text">${escapeHtml(p.eventId?.title || '—')}</td>
            <td>${escapeHtml(p.registrationId?.registrationId || '—')}</td>
            <td>${currency(p.amount)}</td>
            <td><span class="pill pill-${p.status}">${statusLabel(p.status)}</span></td>
            <td>${formatDate(p.createdAt)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>${pager(page, pages, total)}`
          : `<div class="empty-state"><p>No payments found.</p></div>`
      }
    `;
    bindListControls('payments', renderPayments);
    document.getElementById('export-btn').addEventListener('click', () => downloadCsv(`/admin/payments/export?${qs({ ...st, page: '' })}`, 'payments.csv'));
  }

  renderSection();
});
