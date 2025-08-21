// ui-notify.js — shared notification helper
export function showNotification(message, type = 'info', ms = 2000) {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = message;
  el.className = `badge toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.className = `badge toast ${type}`;
  }, ms);
}
