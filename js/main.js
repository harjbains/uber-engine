import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initShifts();
  initFuel();
  initMonthly();
  initVersion();
});