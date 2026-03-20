import { initMonthly, loadMonthly } from "./monthly.js";
import { initExpenses, loadExpenses } from "./expenses.js";
import { initFuel, loadFuelLogs } from "./fuel.js";
import { initShifts, loadShifts } from "./shifts.js";
import { initVersion, APP_VERSION } from "./version.js";

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {
  initVersion(APP_VERSION);

  setDefaultDates();
  bindTabs();

  initShifts();
  initFuel();
  await initExpenses();
  initMonthly();
});

/* ================= DEFAULT DATES ================= */

function getTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function setDefaultDates() {
  const today = getTodayLocal();

  const shiftDate = document.getElementById("shift_date");
  if (shiftDate && !shiftDate.value) shiftDate.value = today;

  const fuelDate = document.getElementById("fuel_date");
  if (fuelDate && !fuelDate.value) fuelDate.value = today;

  const expenseDate = document.getElementById("expense_date");
  if (expenseDate && !expenseDate.value) expenseDate.value = today;
}

/* ================= TAB SWITCH ================= */

function bindTabs() {
  const buttons = document.querySelectorAll(".tab-button");

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab-content").forEach((tab) => {
        tab.classList.remove("active");
      });

      document.querySelectorAll(".tab-button").forEach((button) => {
        button.classList.remove("active");
      });

      const target = document.getElementById(btn.dataset.tab);

      if (target) {
        target.classList.add("active");
        btn.classList.add("active");
      }

      const tab = btn.dataset.tab;

      if (tab === "shift_tab") await loadShifts();
      if (tab === "fuel_tab") await loadFuelLogs();
      if (tab === "expenses_tab") await loadExpenses();
      if (tab === "month_tab") await loadMonthly();
    });
  });
}