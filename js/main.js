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

function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

/* ================= SHIFT RENDER ================= */

function renderShifts(shifts) {
  const container = document.getElementById("shiftList");
  container.innerHTML = "";

  shifts.forEach(shift => {
    const profitClass =
      shift.profit >= 0 ? "profit-positive" : "profit-negative";

    const row = document.createElement("div");
    row.className = "data-grid";

    row.innerHTML = `
      <div class="row-top">
        <span class="row-date">${formatShortDate(shift.date)}</span>
        <span class="row-total">£${shift.net.toFixed(2)}</span>
      </div>

      <div class="row-bottom">
        <div class="row-figures">
          <span>£${shift.income.toFixed(2)}</span>
          <span>£${shift.fuel.toFixed(2)}</span>
          <span class="${profitClass}">£${shift.profit.toFixed(2)}</span>
        </div>
        <button class="btn-sm" data-id="${shift.id}">✕</button>
      </div>
    `;

    container.appendChild(row);
  });
}

/* ================= FUEL RENDER ================= */

function renderFuel(fuelEntries) {
  const container = document.getElementById("fuelList");
  container.innerHTML = "";

  fuelEntries.forEach(entry => {
    const row = document.createElement("div");
    row.className = "fuel-grid";

    row.innerHTML = `
      <div class="row-top">
        <span class="row-date">${formatShortDate(entry.date)}</span>
        <span class="row-total">£${entry.cost.toFixed(2)}</span>
      </div>

      <div class="row-bottom">
        <div class="row-figures">
          <span>${entry.litres}L</span>
          <span>${entry.miles}mi</span>
        </div>
        <button class="btn-sm" data-id="${entry.id}">✕</button>
      </div>
    `;

    container.appendChild(row);
  });
}