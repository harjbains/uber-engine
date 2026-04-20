import { supabaseClient } from "./supabase.js";
import { exportMonthlySummary } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { getRollingFuelPricePerLitre } from "./fuel.js";

const ids = {
  picker: "month_picker",
  summary: "month_summary",
  exportBtn: "export-month"
};

const DAILY_INSURANCE_DEFAULT = 10;
const TAX_RATE_DEFAULT = 0.20;

const DEFAULT_MPG = 32.5;
const DEFAULT_FUEL_PRICE_PER_LITRE = 1.70;
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

function getLitresPerMile(mpg = DEFAULT_MPG) {
  return LITRES_PER_UK_GALLON / mpg;
}

function calculateFuelCost(miles, pricePerLitre, mpg = DEFAULT_MPG) {
  const litresPerMile = getLitresPerMile(mpg);
  return miles * litresPerMile * pricePerLitre;
}

export async function loadMonthSummary() {
  const monthValue = el(ids.picker)?.value || currentMonthValue();
  const container = el(ids.summary);
  if (!container) return null;

  const { start, end } = monthDateRange(monthValue);

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

    getRollingFuelPricePerLitre(3, DEFAULT_FUEL_PRICE_PER_LITRE)
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
  const totalFuel = calculateFuelCost(totalMiles, fuelPrice);

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalTax = totalIncome * TAX_RATE_DEFAULT;
  const totalInsurance = distinctDatesWorked * DAILY_INSURANCE_DEFAULT;

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

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Sessions</div>
      <div class="summary-value">${formatInt(summary.sessionsWorked)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Days Worked</div>
      <div class="summary-value">${formatInt(summary.daysWorked)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Gross</div>
      <div class="summary-value">${formatMoney(summary.totalIncome)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Trips</div>
      <div class="summary-value">${formatInt(summary.totalTrips)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Miles</div>
      <div class="summary-value">${formatNumber(summary.totalMiles, 1)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Hours</div>
      <div class="summary-value">${formatNumber(summary.totalHours, 1)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Fuel (Est.)</div>
      <div class="summary-value">${formatMoney(summary.totalFuel)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Expenses</div>
      <div class="summary-value">${formatMoney(summary.totalExpenses)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Tax</div>
      <div class="summary-value">${formatMoney(summary.totalTax)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Insurance</div>
      <div class="summary-value">${formatMoney(summary.totalInsurance)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">True Retained</div>
      <div class="summary-value">${formatMoney(summary.totalTrueRetained)}</div>
    </div>

    <div class="summary-card">
      <div class="summary-label">Fuel Price</div>
      <div class="summary-value">${formatMoney(fuelPrice)}/L</div>
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

  loadMonthSummary();
}