/**
 * Shared chrome: top nav (with notifications + user menu) and footer.
 * Call renderChrome('events') near the top of each page's init script.
 */
function navLink(href, label, active) {
  return `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
}

function roleLinks(page) {
  const u = Auth.getUser();
  if (!u) return '';
  if (u.role === 'admin') return navLink('admin.html', 'Admin', page === 'admin');
  if (u.role === 'organizer') return navLink('dashboard.html', 'Dashboard', page === 'dashboard');
  return '';
}

function renderChrome(page) {
  const header = document.getElementById('app-header');
  const loggedIn = Auth.isLoggedIn();
  const user = Auth.getUser();

  if (header) {
    header.innerHTML = `
      <nav class="nav">
        <div class="wrap">
          <a href="index.html" class="brand">Event<em>ly</em></a>
          <div class="nav-links">
            ${navLink('index.html', 'Home', page === 'home')}
            ${navLink('events.html', 'Explore events', page === 'events')}
            ${loggedIn ? navLink('my-events.html', 'My events', page === 'my-events') : ''}
            ${roleLinks(page)}
          </div>
          <div class="nav-right">
            ${
              loggedIn
                ? `
              <button class="icon-btn" id="notif-btn" aria-label="Notifications" aria-haspopup="true">
                🔔<span class="badge-dot hidden" id="notif-count">0</span>
              </button>
              <div class="user-menu">
                <button class="user-chip" id="user-menu-btn" aria-haspopup="true">
                  <span class="avatar">${escapeHtml((user.name || '?')[0].toUpperCase())}</span>
                  <span>${escapeHtml((user.name || '').split(' ')[0])}</span>
                </button>
              </div>`
                : `
              <a href="login.html" class="btn btn-ghost btn-sm">Log in</a>
              <a href="register.html" class="btn btn-primary btn-sm">Sign up</a>`
            }
            <button class="icon-btn mobile-toggle" id="mobile-toggle" aria-label="Menu">☰</button>
          </div>
        </div>
      </nav>
      <div class="wrap hidden" id="mobile-menu" style="padding:12px 24px; display:flex; flex-direction:column; gap:4px; border-bottom:1.5px solid var(--line);">
        <a href="index.html">Home</a>
        <a href="events.html">Explore events</a>
        ${loggedIn ? '<a href="my-events.html">My events</a>' : ''}
        ${loggedIn && user.role === 'organizer' ? '<a href="dashboard.html">Dashboard</a>' : ''}
        ${loggedIn && user.role === 'admin' ? '<a href="admin.html">Admin</a>' : ''}
        ${loggedIn ? '<a href="profile.html">Profile</a>' : ''}
      </div>
    `;

    document.getElementById('mobile-toggle')?.addEventListener('click', () => {
      document.getElementById('mobile-menu').classList.toggle('hidden');
    });

    if (loggedIn) {
      setupUserMenu(user);
      setupNotifications();
    }
  }

  const footer = document.getElementById('app-footer');
  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div class="wrap">
          <p>© ${new Date().getFullYear()} Evently — discover, register, experience.</p>
          <p>Smart Event Management System</p>
        </div>
      </footer>
    `;
  }
}

function setupUserMenu(user) {
  const btn = document.getElementById('user-menu-btn');
  const menu = document.querySelector('.user-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = menu.querySelector('.dropdown');
    if (existing) return existing.remove();
    const dd = document.createElement('div');
    dd.className = 'dropdown';
    dd.innerHTML = `
      <a href="profile.html">My profile</a>
      <a href="my-events.html">My registrations</a>
      ${user.role !== 'user' ? `<a href="${user.role === 'admin' ? 'admin.html' : 'dashboard.html'}">${user.role === 'admin' ? 'Admin panel' : 'Organizer dashboard'}</a>` : ''}
      <hr />
      <button id="logout-btn">Log out</button>
    `;
    menu.appendChild(dd);
    dd.querySelector('#logout-btn').addEventListener('click', () => {
      Auth.clear();
      window.location.href = 'index.html';
    });
  });
  document.addEventListener('click', () => menu.querySelector('.dropdown')?.remove());
}

async function setupNotifications() {
  const btn = document.getElementById('notif-btn');
  if (!btn) return;
  try {
    const { notifications, unreadCount } = await Api.get('/notifications?unread=true');
    const countEl = document.getElementById('notif-count');
    if (unreadCount > 0) {
      countEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
      countEl.classList.remove('hidden');
    }
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const existing = document.querySelector('.notif-dropdown');
      if (existing) return existing.remove();
      const dd = document.createElement('div');
      dd.className = 'dropdown notif-dropdown';
      dd.style.right = '0';
      const { notifications: latest } = await Api.get('/notifications');
      dd.innerHTML = latest.length
        ? `<div class="notif-panel">${latest
            .map(
              (n) => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <span class="dot" style="${n.read ? 'background:var(--line)' : ''}"></span>
            <div class="body">
              <b>${escapeHtml(n.title)}</b>
              <span>${escapeHtml(n.message)}</span>
              <time>${new Date(n.createdAt).toLocaleString()}</time>
            </div>
          </div>`
            )
            .join('')}</div><hr/><button id="mark-all-read">Mark all as read</button>`
        : `<div style="padding:16px; text-align:center; color:var(--slate); font-size:0.88rem;">No notifications yet</div>`;
      btn.parentElement.style.position = 'relative';
      btn.after(dd);
      dd.querySelector('#mark-all-read')?.addEventListener('click', async () => {
        await Api.put('/notifications/read-all');
        countEl.classList.add('hidden');
        dd.remove();
      });
    });
  } catch {
    /* notifications are non-critical; fail silently */
  }
}

// Redirects to login if not authenticated; optionally restricts to given roles.
function requireAuth(roles) {
  if (!Auth.isLoggedIn()) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.pathname.split('/').pop())}`;
    return false;
  }
  if (roles && !roles.includes(Auth.getUser().role)) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  const mm = document.getElementById('mobile-menu');
  if (mm) mm.addEventListener('click', (e) => { if (e.target.tagName === 'A') mm.classList.add('hidden'); });
});

