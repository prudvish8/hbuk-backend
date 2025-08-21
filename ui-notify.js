// ui-notify.js
// Write lightweight, fade-out confirmations to the same green pill area.
// No browser alerts, ever.

export function showNotification(message, type = 'success', ms = 1800) {
  // Prefer the commit pill area; fall back to an optional #notif
  const el =
    document.getElementById('commitNotice') ||
    document.getElementById('notif');

  if (!el) return; // no popups

  // base class must be "notif" (your CSS already styles .notif, .success, .error, .show)
  el.className = `notif ${type}`;
  el.textContent = message;

  // show then fade
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.remove('show');
    el.textContent = '';
  }, ms);
}
