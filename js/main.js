import { initVersion } from "./version.js";
import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";

document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  initTabs();
  initShifts();
  initFuel();
  initMonthly();
});