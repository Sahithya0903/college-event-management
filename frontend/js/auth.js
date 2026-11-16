document.addEventListener('DOMContentLoaded', () => {
  renderChrome(document.getElementById('login-form') ? 'login' : 'register');

  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  const errorBox = document.getElementById('form-error');

  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  };

  const goAfterAuth = (user) => {
    if (next) return (window.location.href = next);
    if (user.role === 'admin') return (window.location.href = 'admin.html');
    if (user.role === 'organizer') return (window.location.href = 'dashboard.html');
    window.location.href = 'index.html';
  };

  // ---- Login ----
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('hidden');
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Logging in…';
      try {
        const { token, user } = await Api.post('/auth/login', {
          email: document.getElementById('email').value.trim(),
          password: document.getElementById('password').value,
        }, { auth: false });
        Auth.setSession(token, user);
        toast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
        goAfterAuth(user);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
    });
  }

  // ---- Register ----
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    let role = new URLSearchParams(window.location.search).get('role') === 'organizer' ? 'organizer' : 'user';
    const toggle = document.getElementById('role-toggle');
    const setRole = (r) => {
      role = r;
      toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.role === r));
      const organizationField = document.getElementById('organization-field');
      const organizationInput = document.getElementById('organization');
      organizationField.hidden = r !== 'user';
      organizationInput.required = r === 'user';
    };
    setRole(role);
    toggle.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setRole(b.dataset.role)));

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('hidden');
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Creating account…';
      try {
        const { token, user } = await Api.post('/auth/register', {
          name: document.getElementById('name').value.trim(),
          email: document.getElementById('email').value.trim(),
          phone: document.getElementById('phone').value.trim(),
          organization: document.getElementById('organization').value.trim(),
          password: document.getElementById('password').value,
          role,
        }, { auth: false });
        Auth.setSession(token, user);
        toast('Account created!', 'success');
        goAfterAuth(user);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    });
  }
});
