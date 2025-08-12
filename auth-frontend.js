// auth-frontend.js — ESM login/register flows
// <script type="module" src="auth-frontend.js"></script>

import { apiRequest, setToken, clearToken } from './api-utils.js';
import { showNotification } from './ui-notify.js';

function qs(id) { return document.getElementById(id); }
function setBusy(btn, busy, labelNormal, labelBusy) {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.textContent = busy ? labelBusy : labelNormal;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = qs('login-form');
  const registerForm = qs('register-form');

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type="submit"]');
      setBusy(btn, true, 'Register', 'Loading…');

      const email = registerForm.email?.value?.trim();
      const password = registerForm.password?.value || '';

      try {
        if (!email || !password) throw new Error('Email and password are required');
        await apiRequest('/api/register', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        showNotification('Registration successful. Please log in.', 'success');
        setTimeout(() => (window.location.href = 'login.html'), 1000);
      } catch (err) {
        showNotification(err.message || 'Registration failed', 'error');
      } finally {
        setBusy(btn, false, 'Register', 'Loading…');
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type="submit"]');
      setBusy(btn, true, 'Login', 'Loading…');

      const email = loginForm.email?.value?.trim();
      const password = loginForm.password?.value || '';

      try {
        if (!email || !password) throw new Error('Email and password are required');
        const data = await apiRequest('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        if (data?.token) {
          setToken(data.token);
          showNotification('Login successful. Redirecting…', 'success');
          setTimeout(() => (window.location.href = 'index.html'), 600);
        } else {
          throw new Error('No token received from server');
        }
      } catch (err) {
        clearToken();
        showNotification(err.message || 'Login failed', 'error');
      } finally {
        setBusy(btn, false, 'Login', 'Loading…');
      }
    });
  }
}); 