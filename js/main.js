import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";

const APP_VERSION = "v0.7.4 – rollback before service worker";

/* ================= PULL TO REFRESH ================= */


/* ================= APP START ================= */

document.addEventListener("DOMContentLoaded", () => {

  initTabs();
  initShifts();
  initFuel();
  initMonthly();
  initVersion(APP_VERSION);

  //initPullToRefresh();

});