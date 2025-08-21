// ui-notify.js — shared notification helper
export function showNotification(text, type = 'info') {
  console[type === 'error' ? 'error' : 'log']('[HBUK]', text);
  const el = document.getElementById('notif');
  if (el) {
    el.textContent = text;
    el.className = `notif ${type}`;
    el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  } else {
    // Fallback, avoid crashing if no DOM slot
    // eslint-disable-next-line no-alert
    alert(text);
  }
}
