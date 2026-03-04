export function initVersion() {

  const el = document.getElementById("version_info");
  if (!el) return;

  const now = new Date();

  const buildDate = now.toLocaleDateString("en-GB");
  const buildTime = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });

  el.textContent = `v0.6.4 • Build ${buildDate} ${buildTime}`;
}