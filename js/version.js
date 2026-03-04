export function initVersion(version) {
  const el = document.getElementById("app-version");
  if (el) el.textContent = version;
}