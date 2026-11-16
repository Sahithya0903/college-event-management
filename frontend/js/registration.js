document.addEventListener('DOMContentLoaded', async () => {
  renderChrome('my-events');
  if (!requireAuth()) return;

  const id = new URLSearchParams(window.location.search).get('id');
  const root = document.getElementById('reg-content');
  if (!id) {
    root.innerHTML = `<div class="empty-state"><p>No registration specified.</p></div>`;
    return;
  }
  await load(id, root);
});

async function load(id, root) {
  let reg;
  try {
    ({ registration: reg } = await Api.get(`/registrations/${id}`));
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }
  const ev = reg.eventId;

  let certificate = null;
  try {
    const { certificates } = await Api.get('/certificates/my');
    certificate = certificates.find((c) => String(c.eventId?._id || c.eventId) === String(ev._id));
  } catch { /* non-critical */ }

  root.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <p style="font-size:0.8rem; color:var(--slate-light); margin-bottom:4px;">Registration ID</p>
          <h2 style="margin:0; font-family:var(--font-body); font-size:1.1rem;">${escapeHtml(reg.registrationId)}</h2>
        </div>
        <span class="pill pill-${reg.status}">${statusLabel(reg.status)}</span>
      </div>
      <h3 style="margin-bottom:4px;"><a href="event-details.html?id=${ev._id}">${escapeHtml(ev.title)}</a></h3>
      <p style="margin-bottom:16px;">📅 ${formatDateLong(ev.startDate)} · ⏰ ${formatTime(ev.startTime)} · 📍 ${escapeHtml(ev.venue)}, ${escapeHtml(ev.location)}</p>

      <div class="ticket-perf" style="margin:0 0 16px;"></div>

      ${ev.fee > 0 && ['pending', 'failed'].includes(reg.paymentStatus) ? `
        <div class="form-note-banner" style="text-align:center;margin-bottom:18px;">
          <h3 style="margin:0 0 8px;">Pay the organizer directly</h3>
          <p>Pay ${currency(ev.fee)} using this organizer payment QR code, then upload a screenshot so the organizer can review it.</p>
          ${ev.paymentQr ? `<img src="${escapeHtml(ev.paymentQr)}" alt="Organizer payment QR code" style="width:240px;max-height:280px;object-fit:contain;margin:0 auto 12px;background:#fff;">` : '<p>The organizer has not added a payment QR yet. Please contact the organizer.</p>'}
          ${ev.paymentQr ? `<form id="payment-proof-form" style="text-align:left;max-width:420px;margin:0 auto;">
            <div class="field"><label for="payment-proof">Payment screenshot</label><input id="payment-proof" name="proof" type="file" accept="image/png,image/jpeg,image/webp" required><p class="hint">JPG, PNG or WebP, up to 5 MB.</p></div>
            <div class="field"><label for="payment-reference">UPI transaction reference (optional)</label><input id="payment-reference" maxlength="100" placeholder="Reference number from your payment app"></div>
            <div id="payment-proof-error" class="form-error-banner hidden"></div>
            <button class="btn btn-primary btn-block" type="submit" id="submit-payment-proof">Upload screenshot</button>
          </form>` : ''}
        </div>` : ''}
      ${reg.paymentStatus === 'submitted' ? `<div class="form-note-banner" style="margin-bottom:18px;"><b>Payment proof submitted.</b> The organizer will review your screenshot. Your registration will be confirmed after approval.</div>` : ''}
      ${reg.paymentStatus === 'paid' ? `<div class="form-note-banner" style="margin-bottom:18px;">Payment approved. Your seat is confirmed.</div>` : ''}

      <div class="meta-row" style="margin-bottom:20px;">
        <span>Payment: <span class="pill pill-${reg.paymentStatus}">${statusLabel(reg.paymentStatus)}</span></span>
        <span>Attendance: <span class="pill pill-${reg.status === 'attended' ? 'attended' : reg.status === 'no_show' ? 'no_show' : 'pending'}">${reg.status === 'attended' ? 'Present' : reg.status === 'no_show' ? 'Absent' : 'Pending'}</span></span>
      </div>

      <div id="reg-actions" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
    </div>

    <div class="panel">
      <h3 style="margin-bottom:10px;">Registration details</h3>
      <table style="min-width:0;">
        <tbody>
          <tr><td>Name</td><td>${escapeHtml(reg.fullName)}</td></tr>
          <tr><td>Email</td><td>${escapeHtml(reg.email)}</td></tr>
          <tr><td>Phone</td><td>${escapeHtml(reg.phone)}</td></tr>
          ${reg.organization ? `<tr><td>Organization</td><td>${escapeHtml(reg.organization)}</td></tr>` : ''}
          <tr><td>Registered on</td><td>${formatDateLong(reg.registeredAt)}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('payment-proof-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = document.getElementById('submit-payment-proof');
    const error = document.getElementById('payment-proof-error');
    error.classList.add('hidden');
    button.disabled = true;
    button.textContent = 'Uploading…';
    const formData = new FormData();
    formData.set('registrationId', reg._id);
    formData.set('proof', document.getElementById('payment-proof').files[0]);
    formData.set('providerReference', document.getElementById('payment-reference').value.trim());
    try {
      await Api.post('/payments/submit-proof', formData, { isForm: true });
      toast('Payment screenshot sent to the organizer for review.', 'success');
      await load(reg._id, root);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      button.disabled = false;
      button.textContent = 'Upload screenshot';
    }
  });

  const actions = document.getElementById('reg-actions');
  if (certificate) {
    actions.innerHTML += `<a class="btn btn-outline" href="${certificate.certificateUrl}" target="_blank" rel="noopener">Download ${escapeHtml(certificate.awardPlace ? `${certificate.awardPlace} winner` : 'participation')} certificate</a>`;
  } else if (reg.status === 'attended') {
    actions.innerHTML += `<button class="btn btn-outline" id="cert-btn">Get certificate</button>`;
    actions.querySelector('#cert-btn').addEventListener('click', async () => {
      try {
        await Api.post(`/certificates/event/${ev._id}/mine`);
        toast('Certificate generated!', 'success');
        load(reg._id, root);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
  if (!['cancelled', 'rejected', 'attended'].includes(reg.status)) {
    actions.innerHTML += `<button class="btn btn-danger" id="cancel-btn">Cancel registration</button>`;
    actions.querySelector('#cancel-btn').addEventListener('click', async () => {
      if (!confirm('Cancel this registration? Any fee you paid will be refunded.')) return;
      try {
        await Api.put(`/registrations/${reg._id}/cancel`);
        toast('Registration cancelled', 'success');
        load(reg._id, root);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

