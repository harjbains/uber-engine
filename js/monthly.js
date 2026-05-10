import { supabaseClient } from "./supabase.js";
import { exportMonthlySummary } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { getRollingFuelPricePerLitre } from "./fuel.js";
import {
  SETTINGS_UPDATED_EVENT,
  getFallbackFuelPrice,
  getMpg,
  getSettings,
  getTaxRate
} from "./settings.js?v=2.2.0";

const ids = {
  picker: "month_picker",
  summary: "month_summary",
  exportBtn: "export-month"
};

const LITRES_PER_UK_GALLON = 4.546;

function el(id) {
  return document.getElementById(id);
}

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value, dp = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(dp);
}

function formatInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return String(Math.round(n));
}

function pct(value, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, (Number(value || 0) / total) * 100);
}

function currentMonthValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthDateRange(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function getLitresPerMile(mpg) {
  return LITRES_PER_UK_GALLON / mpg;
}

function calculateFuelCost(miles, pricePerLitre, mpg) {
  const litresPerMile = getLitresPerMile(mpg);
  return miles * litresPerMile * pricePerLitre;
}

export async function loadMonthSummary() {
  const monthValue = el(ids.picker)?.value || currentMonthValue();
  const container = el(ids.summary);
  if (!container) return null;

  const { start, end } = monthDateRange(monthValue);
  const settings = getSettings();

  const [daysRes, expenseRes, fuelPrice] = await Promise.all([
    supabaseClient
      .from("days")
      .select("*")
      .gte("date", start)
      .lte("date", end),

    supabaseClient
      .from("expenses")
      .select("date,amount")
      .gte("date", start)
      .lte("date", end),

    getRollingFuelPricePerLitre(3, getFallbackFuelPrice(settings))
  ]);

  if (daysRes.error || expenseRes.error) {
    console.error("Month summary load error:", daysRes.error || expenseRes.error);
    container.innerHTML = `<div class="error-state">Unable to load month summary.</div>`;
    showStatus("Unable to load month summary.", "error", false);
    return null;
  }

  const days = daysRes.data || [];
  const expenses = expenseRes.data || [];

  const totalIncome = days.reduce((sum, d) => sum + Number(d.gross || 0), 0);
  const totalTrips = days.reduce((sum, d) => sum + Number(d.trips || 0), 0);
  const totalMiles = days.reduce((sum, d) => sum + Number(d.business_miles || 0), 0);
  const totalHours = days.reduce((sum, d) => sum + Number(d.hours_worked || 0), 0);

  const sessionsWorked = days.length;
  const distinctDatesWorked = new Set(days.map(d => d.date)).size;

  // ✅ NEW: estimated fuel instead of fuel_logs
  const totalFuel = calculateFuelCost(totalMiles, fuelPrice, getMpg(settings));

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalTax = totalIncome * getTaxRate(settings);
  const totalInsurance = Number(settings.insuranceMonthly || 0);

  const totalTrueRetained =
    totalIncome -
    totalFuel -
    totalExpenses -
    totalTax -
    totalInsurance;

  const summary = {
    month: monthValue,
    sessionsWorked,
    daysWorked: distinctDatesWorked,
    totalIncome,
    totalTrips,
    totalMiles,
    totalHours,
    totalFuel,
    totalExpenses,
    totalTax,
    totalInsurance,
    totalTrueRetained,
    avgPerTrip: totalTrips > 0 ? totalIncome / totalTrips : 0,
    avgPerMile: totalMiles > 0 ? totalIncome / totalMiles : 0,
    avgPerWorkedDay: distinctDatesWorked > 0 ? totalIncome / distinctDatesWorked : 0,
    avgPerHour: totalHours > 0 ? totalIncome / totalHours : 0
  };

  const retainedPct = pct(summary.totalTrueRetained, summary.totalIncome);
  const fuelPct = pct(summary.totalFuel, summary.totalIncome);
  const taxPct = pct(summary.totalTax, summary.totalIncome);
  const expensePct = pct(summary.totalExpenses + summary.totalInsurance, summary.totalIncome);

  container.innerHTML = `
    <div class="month-dashboard">
      <div class="month-hero">
        <div class="month-retained">
          <div class="summary-label">True Retained</div>
          <div class="month-retained__value">${formatMoney(summary.totalTrueRetained)}</div>
          <div class="month-retained__sub">${formatNumber(retainedPct, 0)}% of gross</div>
        </div>

        <div
          class="month-donut"
          style="--retained:${retainedPct}; --fuel:${fuelPct}; --tax:${taxPct}; --expenses:${expensePct};"
          aria-label="Monthly earnings breakdown"
        >
          <div>
            <span>Gross</span>
            <strong>${formatMoney(summary.totalIncome)}</strong>
          </div>
        </div>
      </div>

      <div class="month-breakdown">
        <div class="month-breakdown-item month-breakdown-item--retained">
          <span>Retained</span>
          <strong>${formatMoney(summary.totalTrueRetained)}</strong>
        </div>
        <div class="month-breakdown-item month-breakdown-item--fuel">
          <span>Fuel Est.</span>
          <strong>${formatMoney(summary.totalFuel)}</strong>
        </div>
        <div class="month-breakdown-item month-breakdown-item--tax">
          <span>Tax</span>
          <strong>${formatMoney(summary.totalTax)}</strong>
        </div>
        <div class="month-breakdown-item month-breakdown-item--expenses">
          <span>Costs</span>
          <strong>${formatMoney(summary.totalExpenses + summary.totalInsurance)}</strong>
        </div>
      </div>

      <div class="month-metrics">
        <div class="summary-card">
          <div class="summary-label">Days</div>
          <div class="summary-value">${formatInt(summary.daysWorked)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Sessions</div>
          <div class="summary-value">${formatInt(summary.sessionsWorked)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Miles</div>
          <div class="summary-value">${formatNumber(summary.totalMiles, 0)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Fuel / Mile</div>
          <div class="summary-value">${formatMoney(summary.totalMiles > 0 ? summary.totalFuel / summary.totalMiles : 0)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Avg / Day</div>
          <div class="summary-value">${formatMoney(summary.avgPerWorkedDay)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Fuel Price</div>
          <div class="summary-value">${formatMoney(fuelPrice)}/L</div>
        </div>
      </div>
    </div>
  `;

  return summary;
}

async function handleExportMonth() {
  try {
    showStatus("Exporting month summary...", "info", false);
    const summary = await loadMonthSummary();

    if (!summary) {
      showStatus("No month summary to export.", "error");
      return;
    }

    await exportMonthlySummary(summary);
    showStatus("Month summary exported successfully.", "success");
  } catch (error) {
    console.error("Export month failed:", error);
    showStatus("Failed to export month summary.", "error", false);
  }
}

export function initMonthly() {
  const picker = el(ids.picker);
  const exportBtn = el(ids.exportBtn);

  if (picker && !picker.value) {
    picker.value = currentMonthValue();
  }

  picker?.addEventListener("change", loadMonthSummary);
  exportBtn?.addEventListener("click", handleExportMonth);
  window.addEventListener(SETTINGS_UPDATED_EVENT, loadMonthSummary);

  loadMonthSummary();
}
