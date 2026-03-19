import { initMonthly, loadMonthly } from "./monthly.js";
import { initExpenses, loadExpenses } from "./expenses.js";
import { initFuel, loadFuel } from "./fuel.js";
import { initShifts, loadShifts } from "./shifts.js";

import { initVersion, APP_VERSION } from "./version.js";

initVersion(APP_VERSION);


/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", () => {

  setDefaultDates();

  initShifts();
  initFuel();
  initExpenses();
  initMonthly();

});

/* ================= DEFAULT DATES ================= */

function setDefaultDates() {
  const today = new Date().toISOString().split("T")[0];

const shiftDate = document.getElementById("shift_date");
if (shiftDate) shiftDate.value = today;

const fuelDate = document.getElementById("fuel_date");
if (fuelDate) fuelDate.value = today;

const expenseDate = document.getElementById("expense-date");
if (expenseDate) expenseDate.value = today;
}

/* ================= TAB SWITCH ================= */

document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", async () => {

    document.querySelectorAll(".tab-content").forEach(tab => {
      tab.classList.remove("active");
    });

    document.querySelectorAll(".tab-button").forEach(b => {
      b.classList.remove("active");
    });

    const target = document.getElementById(btn.dataset.tab);

    if (target) {
      target.classList.add("active");
      btn.classList.add("active");
    }

    const tab = btn.dataset.tab;

    if (tab === "shift_tab") await loadShifts();
    if (tab === "fuel_tab") await loadFuel();
    if (tab === "expenses_tab") await loadExpenses();
    if (tab === "month_tab") await loadMonthly();

  });
});