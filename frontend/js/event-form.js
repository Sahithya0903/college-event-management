/**
 * Shared create/edit event modal, used by the organizer dashboard and the admin panel.
 * openEventModal(existingEvent | null, onSaved)
 */
async function openEventModal(existingEvent, onSaved) {
  let categories = [];
  try {
    ({ categories } = await Api.get('/categories'));
  } catch {
    toast('Could not load categories', 'error');
    return;
  }
  if (!categories.length) {
    toast('No categories exist yet. Ask an admin to add one first.', 'error');
    return;
  }

  const ev = existingEvent || {};
  const schedule = ev.schedule && ev.schedule.length ? ev.schedule : [];
  const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const certificateLayout = ['classic', 'modern', 'minimal', 'custom'].includes(ev.certificateLayout) ? ev.certificateLayout : 'classic';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-head">
        <h2 style="margin:0;">${existingEvent ? 'Edit event' : 'Create event'}</h2>
        <button class="modal-close" id="close-modal">&times;</button>
      </div>
      <div id="event-form-error" class="form-error-banner hidden"></div>
      <form id="event-form">
        <div class="field"><label>Event name</label><input id="f-title" required value="${escapeHtml(ev.title || '')}" /></div>
        <div class="field"><label>Description</label><textarea id="f-desc" rows="4" required>${escapeHtml(ev.description || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Category</label>
            <select id="f-category" required>${categories.map((c) => `<option value="${c._id}" ${ev.category?._id === c._id ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Event image</label><input id="f-image" type="file" accept="image/png,image/jpeg,image/webp" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Start date</label><input id="f-start-date" type="date" required value="${toInputDate(ev.startDate)}" /></div>
          <div class="field"><label>End date</label><input id="f-end-date" type="date" required value="${toInputDate(ev.endDate)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Start time</label><input id="f-start-time" type="time" required value="${ev.startTime || '09:00'}" /></div>
          <div class="field"><label>End time</label><input id="f-end-time" type="time" required value="${ev.endTime || '17:00'}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Venue</label><input id="f-venue" required value="${escapeHtml(ev.venue || '')}" /></div>
          <div class="field"><label>Location / City</label><input id="f-location" required value="${escapeHtml(ev.location || '')}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Registration fee (₹, 0 for free)</label><input id="f-fee" type="number" min="0" value="${ev.fee ?? 0}" /></div>
          <div class="field"><label>Maximum participants</label><input id="f-capacity" type="number" min="1" required value="${ev.capacity ?? 100}" /></div>
        </div>
        <div class="field"><label style="display:flex;gap:8px;align-items:center;font-weight:500;"><input id="f-is-competition" type="checkbox" ${ev.isCompetition ? 'checked' : ''} /> This is a competition event</label><p class="hint">After it ends, you can assign first, second, and third place and issue winner certificates.</p></div>
        <div class="field" id="payment-qr-field" ${Number(ev.fee || 0) > 0 ? '' : 'hidden'}>
          <label for="f-payment-qr">Organizer payment QR code (required for paid events)</label>
          <input id="f-payment-qr" type="file" accept="image/png,image/jpeg,image/webp" />
          <p class="hint">Upload the UPI/payment QR participants should scan. JPG, PNG or WebP, up to 2 MB.</p>
          ${ev.paymentQr ? '<p class="hint">A payment QR is already saved. Upload a new one to replace it.</p><label style="display:flex;gap:8px;align-items:center;font-weight:500;"><input id="f-remove-payment-qr" type="checkbox" /> Remove saved payment QR</label>' : ''}
        </div>
        <div class="field"><label>Registration deadline (optional)</label><input id="f-deadline" type="date" value="${toInputDate(ev.registrationDeadline)}" /></div>
        <div class="field"><label>Highlights (one per line, optional)</label><textarea id="f-highlights" rows="3">${(ev.highlights || []).join('\n')}</textarea></div>

        <fieldset>
          <legend>Schedule (optional)</legend>
          <div id="schedule-rows"></div>
          <button type="button" class="btn btn-outline btn-sm" id="add-schedule-row">+ Add schedule item</button>
        </fieldset>

        <fieldset>
          <legend>Certificate design</legend>
          <p class="hint">Choose a built-in design or upload your own certificate background. Leave clear space in the middle for the attendee and event details.</p>
          <div class="field-row">
            <div class="field"><label for="f-certificate-layout">Layout</label>
              <select id="f-certificate-layout">
                <option value="classic" ${certificateLayout === 'classic' ? 'selected' : ''}>Classic frame</option>
                <option value="modern" ${certificateLayout === 'modern' ? 'selected' : ''}>Modern side panel</option>
                <option value="minimal" ${certificateLayout === 'minimal' ? 'selected' : ''}>Minimal</option>
                <option value="custom" ${certificateLayout === 'custom' ? 'selected' : ''}>My uploaded background</option>
              </select>
            </div>
            <div class="field"><label for="f-certificate-accent">Accent color</label><input id="f-certificate-accent" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(ev.certificateAccent || '') ? ev.certificateAccent : '#3D3BF3'}" /></div>
          </div>
          <div class="field"><label for="f-certificate-title">Certificate heading</label><input id="f-certificate-title" maxlength="100" value="${escapeHtml(ev.certificateTitle || 'Certificate of Participation')}" /></div>
          <div class="field"><label for="f-certificate-message">Certificate message</label><input id="f-certificate-message" maxlength="300" value="${escapeHtml(ev.certificateMessage || 'for successfully participating in')}" /><p class="hint">This line appears between the participant's name and the event name.</p></div>
          <div class="field"><label for="f-certificate-background">Upload your certificate background (optional)</label><input id="f-certificate-background" type="file" accept="image/png,image/jpeg,image/webp" />
            <p class="hint">JPG, PNG or WebP, up to 2 MB. Use a landscape A4 design with clear space in the middle for names and event details. For a full custom layout, select “My uploaded background”.</p>
            ${ev.certificateBackground ? '<p class="hint">A background is already saved. Upload another image to replace it.</p><label style="display:flex;gap:8px;align-items:center;font-weight:500;"><input id="f-remove-certificate-background" type="checkbox" /> Remove saved background</label>' : ''}
          </div>
        </fieldset>

        <div class="field"><label>Visibility</label>
          <select id="f-status">
            <option value="draft" ${ev.status === 'draft' || !ev.status ? 'selected' : ''}>Draft (not visible to attendees)</option>
            <option value="published" ${ev.status === 'published' ? 'selected' : ''}>Published — registration opens per deadline</option>
            <option value="registration_closed" ${ev.status === 'registration_closed' ? 'selected' : ''}>Registration closed</option>
            ${existingEvent ? `<option value="cancelled" ${ev.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>` : ''}
          </select>
          <p class="hint">Published events open registration automatically until the deadline (or the event start, if none is set).</p>
        </div>

        <button type="submit" class="btn btn-primary btn-block" id="event-submit">${existingEvent ? 'Save changes' : 'Create event'}</button>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#close-modal').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => e.target === backdrop && backdrop.remove());

  const rowsEl = backdrop.querySelector('#schedule-rows');
  const addRow = (item = {}) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.style.alignItems = 'center';
    row.innerHTML = `
      <input placeholder="Time e.g. 10:00" style="max-width:110px;" class="sch-time" value="${escapeHtml(item.time || '')}" />
      <input placeholder="Title e.g. Keynote" class="sch-title" value="${escapeHtml(item.title || '')}" />
      <button type="button" class="btn btn-danger btn-sm remove-row">Remove</button>`;
    row.querySelector('.remove-row').addEventListener('click', () => row.remove());
    rowsEl.appendChild(row);
  };
  schedule.forEach(addRow);
  backdrop.querySelector('#add-schedule-row').addEventListener('click', () => addRow());
  backdrop.querySelector('#f-certificate-background').addEventListener('change', (e) => {
    if (e.target.files[0]) backdrop.querySelector('#f-certificate-layout').value = 'custom';
  });
  const feeInput = backdrop.querySelector('#f-fee');
  const paymentQrField = backdrop.querySelector('#payment-qr-field');
  feeInput.addEventListener('input', () => {
    paymentQrField.hidden = Number(feeInput.value || 0) <= 0;
  });

  backdrop.querySelector('#event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('event-submit');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const errBox = document.getElementById('event-form-error');
    errBox.classList.add('hidden');

    const scheduleData = [...rowsEl.querySelectorAll('.field-row')]
      .map((r) => ({ time: r.querySelector('.sch-time').value.trim(), title: r.querySelector('.sch-title').value.trim() }))
      .filter((s) => s.title);

    const fd = new FormData();
    fd.set('title', document.getElementById('f-title').value.trim());
    fd.set('description', document.getElementById('f-desc').value.trim());
    fd.set('category', document.getElementById('f-category').value);
    fd.set('startDate', document.getElementById('f-start-date').value);
    fd.set('endDate', document.getElementById('f-end-date').value);
    fd.set('startTime', document.getElementById('f-start-time').value);
    fd.set('endTime', document.getElementById('f-end-time').value);
    fd.set('venue', document.getElementById('f-venue').value.trim());
    fd.set('location', document.getElementById('f-location').value.trim());
    fd.set('fee', document.getElementById('f-fee').value || '0');
    fd.set('capacity', document.getElementById('f-capacity').value);
    fd.set('isCompetition', document.getElementById('f-is-competition').checked ? 'true' : 'false');
    const deadline = document.getElementById('f-deadline').value;
    if (deadline) fd.set('registrationDeadline', deadline);
    fd.set('highlights', document.getElementById('f-highlights').value);
    fd.set('schedule', JSON.stringify(scheduleData));
    fd.set('status', document.getElementById('f-status').value);
    fd.set('certificateLayout', document.getElementById('f-certificate-layout').value);
    fd.set('certificateAccent', document.getElementById('f-certificate-accent').value);
    fd.set('certificateTitle', document.getElementById('f-certificate-title').value.trim());
    fd.set('certificateMessage', document.getElementById('f-certificate-message').value.trim());
    const imageFile = document.getElementById('f-image').files[0];
    if (imageFile) fd.set('image', imageFile);
    const certificateBackground = document.getElementById('f-certificate-background').files[0];
    if (certificateBackground) fd.set('certificateBackground', certificateBackground);
    if (document.getElementById('f-remove-certificate-background')?.checked) fd.set('removeCertificateBackground', 'true');
    const paymentQr = document.getElementById('f-payment-qr').files[0];
    if (paymentQr) fd.set('paymentQr', paymentQr);
    if (document.getElementById('f-remove-payment-qr')?.checked) fd.set('removePaymentQr', 'true');

    try {
      if (existingEvent) {
        await Api.put(`/events/${existingEvent._id}`, fd, { isForm: true });
        toast('Event updated', 'success');
      } else {
        await Api.post('/events', fd, { isForm: true });
        toast('Event created', 'success');
      }
      backdrop.remove();
      onSaved && onSaved();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = existingEvent ? 'Save changes' : 'Create event';
    }
  });
}
