import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";

const APP_VERSION = "v0.6.6";

document.getElementById("app-version").textContent = APP_VERSION;

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initShifts();
  initFuel();
  initMonthly();
  initVersion();
});