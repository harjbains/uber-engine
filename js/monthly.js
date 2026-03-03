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

  function renderShiftHistory(shifts) {

    if (shifts.length === 0) {
      shiftsContainer.innerHTML = "<p>No shifts this month</p>";
      return;
    }

    shiftsContainer.innerHTML = shifts.map(shift => {

      const miles = shift.odo_start && shift.odo_end
        ? shift.odo_end - shift.odo_start
        : 0;

      const gross = Number(shift.gross || 0) + Number(shift.tips || 0);

      return `
        <div class="data-grid">
          <div>${formatUKDate(shift.date)}</div>
          <div class="text-right">${shift.odo_start || ""}</div>
          <div class="text-right">${shift.odo_end || ""}</div>
          <div class="text-right">${miles}</div>
          <div class="text-right">£${formatMoney(gross)}</div>
          <button class="btn-sm" data-id="${shift.id}">Del</button>
        </div>
      `;
    }).join("");

    attachDeleteListeners();
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

function formatUKDate(dateStr) {
  const d = new Date(dateStr);

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}