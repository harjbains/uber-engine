import { CONFIG } from "./config.js";

export function initVersion() {

  const versionEl = document.getElementById("version-number");

  if (!versionEl) return;

  versionEl.textContent = CONFIG.VERSION;

}