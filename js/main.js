import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";
import { CONFIG } from "./config.js";

const APP_VERSION = "v0.7.4 – rollback before service worker";

/* ================= PULL TO REFRESH ================= */


/* ================= APP START ================= */

document.addEventListener("DOMContentLoaded", () => {
      console.log(
    `Uber Engine v${CONFIG.VERSION} – ${CONFIG.RELEASE}`
  );

  initTabs();
  initShifts();
  initFuel();
  initMonthly();
  initVersion(APP_VERSION);

  //initPullToRefresh();

});