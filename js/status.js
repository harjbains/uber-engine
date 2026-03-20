let statusTimer = null;

export function showStatus(message, type = "info", autoHide = true) {
  const el = document.getElementById("sync-status");
  if (!el) return;

  el.textContent = message;
  el.className = `sync-status ${type}`;

  if (statusTimer) clearTimeout(statusTimer);

  if (autoHide) {
    statusTimer = setTimeout(() => {
      el.className = "sync-status hidden";
      el.textContent = "";
    }, 2500);
  }
}

export function clearStatus() {
  const el = document.getElementById("sync-status");
  if (!el) return;

  if (statusTimer) clearTimeout(statusTimer);
  el.className = "sync-status hidden";
  el.textContent = "";
}