/**
 * Tiny fetch wrapper shared by every page.
 * Talks to the same origin the frontend is served from, so no base URL is needed
 * whether you open it via the Express server or a separate static host that proxies /api.
 */
const API_BASE = '/api';

const Auth = {
  getToken: () => localStorage.getItem('evently_token'),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('evently_user') || 'null');
    } catch {
      return null;
    }
  },
  setSession: (token, user) => {
    localStorage.setItem('evently_token', token);
    localStorage.setItem('evently_user', JSON.stringify(user));
  },
  updateUser: (user) => localStorage.setItem('evently_user', JSON.stringify(user)),
  clear: () => {
    localStorage.removeItem('evently_token');
    localStorage.removeItem('evently_user');
  },
  isLoggedIn: () => !!Auth.getToken(),
  hasRole: (...roles) => {
    const u = Auth.getUser();
    return !!u && roles.includes(u.role);
  },
};

async function apiRequest(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth && Auth.getToken()) headers.Authorization = `Bearer ${Auth.getToken()}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (res.status === 401 && auth) {
    Auth.clear();
  }
  if (!res.ok) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data;
}

const Api = {
  get: (path) => apiRequest(path, { method: 'GET' }),
  post: (path, body, opts = {}) => apiRequest(path, { method: 'POST', body, ...opts }),
  put: (path, body, opts = {}) => apiRequest(path, { method: 'PUT', body, ...opts }),
  del: (path) => apiRequest(path, { method: 'DELETE' }),
};

// ---------- small shared UI helpers ----------
function toast(message, kind = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => el.remove(), 250);
  }, 3800);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatDateLong(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function currency(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

const STATUS_LABEL = {
  draft: 'Draft',
  published: 'Published',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pending: 'Pending',
  submitted: 'Awaiting review',
  failed: 'Payment rejected',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  attended: 'Attended',
  no_show: 'No show',
  paid: 'Paid',
  not_required: 'Free',
  failed: 'Failed',
  refunded: 'Refunded',
  successful: 'Successful',
  active: 'Active',
  blocked: 'Blocked',
};
function statusLabel(s) {
  return STATUS_LABEL[s] || s;
}
