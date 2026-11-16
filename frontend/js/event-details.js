document.addEventListener('DOMContentLoaded', async () => {
  renderChrome('events');
  const id = new URLSearchParams(window.location.search).get('id');
  const root = document.getElementById('event-content');
  if (!id) {
    root.innerHTML = `<div class="empty-state"><p>No event specified.</p></div>`;
    return;
  }

  let data;
  try {
    data = await Api.get(`/events/${id}`);
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><div class="glyph">🎪</div><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const { event: ev, myRegistration, isFavorite } = data;
  document.getElementById('crumb-title').textContent = ev.title;
  document.title = `${ev.title} — Evently`;

  const seatsLeft = Math.max(0, ev.capacity - ev.registeredCount);
  const pctFull = ev.capacity ? Math.min(100, Math.round((ev.registeredCount / ev.capacity) * 100)) : 0;
  const isFinished = ev.liveStatus === 'completed';

  root.innerHTML = `
    <div class="details-grid">
      <div>
        ${ev.image ? `<img class="details-hero-img" src="${ev.image}" alt="${escapeHtml(ev.title)}" />` : `<div class="details-hero-img" style="display:grid;place-items:center;font-size:3rem;">🎫</div>`}
        <div style="margin-top:20px;">
          <span class="pill pill-${ev.liveStatus}">${statusLabel(ev.liveStatus)}</span>
          <h1 style="margin-top:12px;">${escapeHtml(ev.title)}</h1>
          <div class="meta-row">
            <span>📅 ${formatDateLong(ev.startDate)}${ev.startDate !== ev.endDate ? ` – ${formatDateLong(ev.endDate)}` : ''}</span>
            <span>⏰ ${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}</span>
            <span>📍 ${escapeHtml(ev.venue)}, ${escapeHtml(ev.location)}</span>
          </div>
        </div>

        <div class="detail-block">
          <h2>About this event</h2>
          <p style="white-space:pre-wrap; max-width:none;">${escapeHtml(ev.description)}</p>
        </div>

        ${
          ev.highlights?.length
            ? `<div class="detail-block"><h2>Event highlights</h2><ul class="highlight-list">${ev.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>`
            : ''
        }

        ${
          ev.schedule?.length
            ? `<div class="detail-block"><h2>Schedule</h2>${ev.schedule.map((s) => `<div class="schedule-item"><span class="time">${escapeHtml(s.time || '')}</span><div><b>${escapeHtml(s.title)}</b>${s.details ? `<p style="margin:2px 0 0;">${escapeHtml(s.details)}</p>` : ''}</div></div>`).join('')}</div>`
            : ''
        }

        <div class="detail-block">
          <h2>Organizer</h2>
          <p>${escapeHtml(ev.organizerName || ev.organizerId?.name || 'Evently organizer')}</p>
        </div>

        <div class="detail-block" id="feedback-block">
          <h2>Feedback</h2>
          <div id="feedback-summary" style="margin-bottom:14px;">Loading reviews…</div>
          <div id="feedback-form-slot"></div>
          <div id="feedback-list"></div>
        </div>
      </div>

      <aside class="booking-panel" id="booking-panel">
        <div class="price">${ev.fee > 0 ? currency(ev.fee) : 'Free'}</div>
        <p style="margin:4px 0 0; font-size:0.85rem;">Registration fee</p>
        <div class="seats-bar"><div style="width:${pctFull}%;"></div></div>
        <p style="font-size:0.85rem; margin-bottom:16px;">${seatsLeft} / ${ev.capacity} seats available</p>
        <div id="booking-action"></div>
        <button class="btn btn-outline btn-block" id="fav-btn" style="margin-top:10px;">
          ${isFavorite ? '♥ Saved to favorites' : '♡ Save to favorites'}
        </button>
      </aside>
    </div>
  `;

  renderBookingAction(ev, myRegistration, isFinished, seatsLeft);
  setupFavorite(ev._id, isFavorite);
  loadFeedback(ev._id, ev, myRegistration);
});

function renderBookingAction(ev, myRegistration, isFinished, seatsLeft) {
  const slot = document.getElementById('booking-action');
  if (!Auth.isLoggedIn()) {
    slot.innerHTML = `<a href="login.html?next=event-details.html%3Fid%3D${ev._id}" class="btn btn-primary btn-block">Log in to register</a>`;
    return;
  }
  const user = Auth.getUser();
  if (user.role !== 'user') {
    slot.innerHTML = `<p style="font-size:0.85rem;">Organizer and admin accounts can't register for events. Use a participant account to book a seat.</p>`;
    return;
  }
  if (myRegistration && !['cancelled', 'rejected'].includes(myRegistration.status)) {
    let extra = '';
    if (['pending', 'failed'].includes(myRegistration.paymentStatus)) {
      extra = `<a class="btn btn-primary btn-block" href="registration.html?id=${myRegistration._id}" style="margin-top:10px;">Pay ${currency(ev.fee)} and upload proof</a>`;
    }
    slot.innerHTML = `
      <div class="pill pill-${myRegistration.status}" style="margin-bottom:10px;">You're ${statusLabel(myRegistration.status).toLowerCase()}</div>
      <a href="registration.html?id=${myRegistration._id || ''}" class="btn btn-outline btn-block">View my registration</a>
      ${extra}
    `;
    return;
  }
  if (isFinished) {
    slot.innerHTML = `<p style="font-size:0.85rem;">This event has ended.</p>`;
    return;
  }
  if (!ev.canRegister) {
    slot.innerHTML = `<button class="btn btn-primary btn-block" disabled>${seatsLeft <= 0 ? 'Event full' : 'Registration closed'}</button>`;
    return;
  }
  slot.innerHTML = `<button class="btn btn-primary btn-block" id="register-btn">Register now</button>`;
  document.getElementById('register-btn').addEventListener('click', () => openRegisterModal(ev));
}

function openRegisterModal(ev) {
  const user = Auth.getUser();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h2 style="margin:0;">Register for ${escapeHtml(ev.title)}</h2><button class="modal-close" id="close-modal">&times;</button></div>
      <p class="sub" style="margin-bottom:18px;">${ev.fee > 0 ? `Fee: ${currency(ev.fee)}, payable after you submit this form.` : 'This event is free to attend.'}</p>
      <form id="reg-form">
        <div class="field"><label>Full name</label><input id="r-name" value="${escapeHtml(user.name)}" required /></div>
        <div class="field-row">
          <div class="field"><label>Email</label><input id="r-email" type="email" value="${escapeHtml(user.email)}" required /></div>
          <div class="field"><label>Phone</label><input id="r-phone" value="${escapeHtml(user.phone || '')}" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Organization / College</label><input id="r-org" value="${escapeHtml(user.organization || '')}" /></div>
          <div class="field"><label>Designation</label><input id="r-desig" /></div>
        </div>
        <div class="field"><label>Address</label><input id="r-address" /></div>
        <div class="field"><label>Anything else the organizer should know</label><textarea id="r-extra" rows="2"></textarea></div>
        <div id="reg-error" class="form-error-banner hidden"></div>
        <button type="submit" class="btn btn-primary btn-block" id="reg-submit">Confirm registration</button>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#close-modal').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => e.target === backdrop && backdrop.remove());

  backdrop.querySelector('#reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('reg-submit');
    btn.disabled = true;
    btn.textContent = 'Registering…';
    const errBox = document.getElementById('reg-error');
    errBox.classList.add('hidden');
    try {
      const { registration, requiresPayment } = await Api.post('/registrations', {
        eventId: ev._id,
        fullName: document.getElementById('r-name').value.trim(),
        email: document.getElementById('r-email').value.trim(),
        phone: document.getElementById('r-phone').value.trim(),
        organization: document.getElementById('r-org').value.trim(),
        designation: document.getElementById('r-desig').value.trim(),
        address: document.getElementById('r-address').value.trim(),
        extra: document.getElementById('r-extra').value.trim(),
      });
      backdrop.remove();
      if (requiresPayment) {
        toast('Registration saved. Scan the organizer QR and upload your payment screenshot.', 'success');
      } else {
        toast('You are registered!', 'success');
      }
      window.location.href = `registration.html?id=${registration._id}`;
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Confirm registration';
    }
  });
}

function setupFavorite(eventId, isFavorite) {
  const btn = document.getElementById('fav-btn');
  let fav = isFavorite;
  btn.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) return (window.location.href = `login.html?next=event-details.html%3Fid%3D${eventId}`);
    try {
      if (fav) {
        await Api.del(`/favorites/${eventId}`);
        fav = false;
        btn.textContent = '♡ Save to favorites';
      } else {
        await Api.post(`/favorites/${eventId}`);
        fav = true;
        btn.textContent = '♥ Saved to favorites';
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function loadFeedback(eventId, ev, myRegistration) {
  const summaryEl = document.getElementById('feedback-summary');
  const listEl = document.getElementById('feedback-list');
  const formSlot = document.getElementById('feedback-form-slot');
  try {
    const { feedback, average, count } = await Api.get(`/feedback/event/${eventId}`);
    summaryEl.innerHTML = count
      ? `<span class="stars">${'★'.repeat(Math.round(average))}${'☆'.repeat(5 - Math.round(average))}</span> ${average.toFixed(1)} out of 5 · ${count} review${count === 1 ? '' : 's'}`
      : `No reviews yet.`;
    listEl.innerHTML = feedback
      .map(
        (f) => `<div class="review-item"><div class="stars">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div><p style="margin:4px 0 0;"><b>${escapeHtml(f.userId?.name || 'Attendee')}</b> — ${escapeHtml(f.comment || '')}</p></div>`
      )
      .join('');
  } catch {
    summaryEl.textContent = 'Could not load reviews.';
  }

  const canReview = Auth.isLoggedIn() && myRegistration?.status === 'attended' && (ev.liveStatus === 'completed' || ev.status === 'completed');
  if (canReview) {
    formSlot.innerHTML = `
      <form id="feedback-form" style="border:1.5px dashed var(--line); border-radius:10px; padding:16px; margin-bottom:18px;">
        <label style="font-weight:600; font-size:0.86rem; display:block; margin-bottom:8px;">Rate your experience</label>
        <div class="star-input" id="star-input">${[1, 2, 3, 4, 5].map((n) => `<span data-n="${n}">★</span>`).join('')}</div>
        <input type="hidden" id="rating-value" value="0" />
        <div class="field" style="margin-top:12px;"><textarea id="fb-comment" rows="2" placeholder="Share a few words about the event…"></textarea></div>
        <button type="submit" class="btn btn-primary btn-sm">Submit review</button>
      </form>`;
    const stars = formSlot.querySelectorAll('#star-input span');
    stars.forEach((s) =>
      s.addEventListener('click', () => {
        const n = Number(s.dataset.n);
        document.getElementById('rating-value').value = n;
        stars.forEach((st) => st.classList.toggle('active', Number(st.dataset.n) <= n));
      })
    );
    formSlot.querySelector('#feedback-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const rating = Number(document.getElementById('rating-value').value);
      if (!rating) return toast('Choose a star rating first', 'error');
      try {
        await Api.post('/feedback', { eventId, rating, comment: document.getElementById('fb-comment').value.trim() });
        toast('Thanks for your feedback!', 'success');
        loadFeedback(eventId, ev, myRegistration);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } else {
    let reason = 'Feedback is available after the event has ended for participants registered with this account.';
    if (!Auth.isLoggedIn()) reason = 'Sign in with the participant account you used to register. You can leave feedback after the event has ended.';
    else if (Auth.getUser()?.role !== 'user') reason = 'Sign in with a participant account to leave feedback.';
    else if (!myRegistration) reason = 'Feedback is available after the event has ended, for participants registered with this account.';
    else if (myRegistration.status !== 'attended') reason = 'Your attendance must be marked Present before you can leave feedback.';
    else if (ev.liveStatus !== 'completed' && ev.status !== 'completed') reason = 'Feedback opens after the event has ended.';
    formSlot.innerHTML = `<p class="hint">${escapeHtml(reason)}</p>`;
  }
}
