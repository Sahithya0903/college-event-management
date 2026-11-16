document.addEventListener('DOMContentLoaded', () => {
  renderChrome('profile');
  if (!requireAuth()) return;

  const user = Auth.getUser();
  document.getElementById('p-name').value = user.name;
  document.getElementById('p-email').value = user.email;
  document.getElementById('p-phone').value = user.phone || '';
  document.getElementById('p-org').value = user.organization || '';
  document.getElementById('p-org').required = user.role === 'user';

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('profile-error');
    errBox.classList.add('hidden');
    try {
      const { user: updated } = await Api.put('/auth/me', {
        name: document.getElementById('p-name').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
        organization: document.getElementById('p-org').value.trim(),
      });
      Auth.updateUser(updated);
      toast('Profile updated', 'success');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('pw-error');
    errBox.classList.add('hidden');
    try {
      await Api.put('/auth/me/password', {
        currentPassword: document.getElementById('current-pw').value,
        newPassword: document.getElementById('new-pw').value,
      });
      toast('Password updated', 'success');
      e.target.reset();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });
});
