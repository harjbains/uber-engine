import { initTabs } from "./tabs.js";
import { loadMonthlyDashboard } from "./monthly.js";
import { initShiftForm, loadShifts } from "./shifts.js";
import { CONFIG } from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {

  console.log(`Uber Engine v${CONFIG.VERSION} starting`);

  initTabs();

  initShiftForm();

  await loadShifts();

  await loadMonthlyDashboard();

  const versionEl = document.getElementById("app-version");

  if(versionEl){
    versionEl.textContent = `Version ${CONFIG.VERSION}`;
  }

});