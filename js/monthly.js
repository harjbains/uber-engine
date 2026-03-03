import { supabaseClient } from "./supabase.js";

export function initMonthly() {

  const summaryContainer = document.getElementById("month_summary");
  const shiftsContainer = document.getElementById("month_shifts");

  if (!summaryContainer || !shiftsContainer) return;

  const currentMonth = new Date();
  loadMonth(currentMonth);

  async function loadMonth(dateObj) {

    const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    const end = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const { data: shifts, error } = await supabaseClient
      .from("shifts")
      .select("*")
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date", { ascending: false });

    if (error) {
      console.error("Monthly fetch error:", error);
      return;
    }

    renderMonth(shifts || []);
  }

  function renderMonth(shifts) {

    let grossTotal = 0;
    let milesTotal = 0;

    shifts.forEach(shift => {
      grossTotal += Number(shift.gross || 0) + Number(shift.tips || 0);

      if (shift.odo_start && shift.odo_end) {
        milesTotal += (shift.odo_end - shift.odo_start);
      }
    });

    const mileageAllowance = calculateMileageAllowance(milesTotal);
    const taxableProfit = grossTotal - mileageAllowance;
    const taxBuffer = taxableProfit > 0 ? taxableProfit * 0.15 : 0;

    renderSummary({
      grossTotal,
      milesTotal,
      mileageAllowance,
      taxableProfit,
      taxBuffer
    });

    renderShiftHistory(shifts);
  }

  function renderSummary(data) {

    summaryContainer.innerHTML = `
      <div class="summary-item">
        <strong>Gross</strong>
        <span class="text-right">£${formatMoney(data.grossTotal)}</span>
      </div>

      <div class="summary-item">
        <strong>Miles</strong>
        <span class="text-right">${data.milesTotal}</span>
      </div>

      <div class="summary-item">
        <strong>Allowance</strong>
        <span class="text-right">£${formatMoney(data.mileageAllowance)}</span>
      </div>

      <div class="summary-item">
        <strong>Taxable</strong>
        <span class="text-right">£${formatMoney(data.taxableProfit)}</span>
      </div>

      <div class="summary-item">
        <strong>15% Buffer</strong>
        <span class="text-right">£${formatMoney(data.taxBuffer)}</span>
      </div>
    `;
  }

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

  function attachDeleteListeners() {

    const buttons = shiftsContainer.querySelectorAll("button");

    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {

        if (!confirm("Delete this shift?")) return;

        const id = btn.dataset.id;

        await supabaseClient
          .from("shifts")
          .delete()
          .eq("id", id);

        loadMonth(currentMonth);
      });
    });
  }

  function calculateMileageAllowance(miles) {

    if (miles <= 10000) {
      return miles * 0.45;
    }

    return (10000 * 0.45) + ((miles - 10000) * 0.25);
  }

  function formatMoney(num) {
    return Number(num || 0).toFixed(2);
  }

}

function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}