import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";

const APP_VERSION = "v0.7.4 – rollback before service worker";

/* ================= PULL TO REFRESH ================= */

function initPullToRefresh() {

  let startY = 0;
  let pulling = false;

  const indicator = document.getElementById("refresh-indicator");

  window.addEventListener("touchstart", (e) => {

    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }

  }, { passive: true });

  window.addEventListener("touchmove", (e) => {

    if (!pulling) return;

    const y = e.touches[0].clientY;
    const diff = y - startY;

    if (diff > 90) {

      pulling = false;

      if (indicator) indicator.classList.add("show");

      setTimeout(() => {

        const url = new URL(window.location.href);
        url.searchParams.set("v", Date.now().toString());

        window.location.replace(url.toString());

      }, 300);

    }

  }, { passive: true });

  window.addEventListener("touchend", () => {
    pulling = false;
  }, { passive: true });

}

/* ================= APP START ================= */

document.addEventListener("DOMContentLoaded", () => {

  initTabs();
  initShifts();
  initFuel();
  initMonthly();
  initVersion(APP_VERSION);

  initPullToRefresh();

});