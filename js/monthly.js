import { supabaseClient } from "./supabase.js";
import { exportMonthlySummary, exportMtdSummary } from "./googleSheets.js?v=2.3.19";
import { showStatus } from "./status.js";
import { getChargingTotalsForRange, getRollingFuelPricePerLitre } from "./fuel.js";
import {
  SETTINGS_UPDATED_EVENT,
  getFallbackFuelPrice,
  getFuelType,
  formatClockHours,
  getMpg,
  getSettings,
  getTaxRate,
  getVehicleExpenseMethod
} from "./settings.js?v=2.3.19";

const ids = {
  picker: "month_picker",
  summary: "month_summary",
  exportBtn: "export-month",
  exportMtdBtn: "export-mtd",
  weekStart: "uber_statement_week_start",
  weekEnd: "uber_statement_week_end",
  customerPayments: "uber_customer_payments",
  tips: "uber_tips",
  taxesThirdPartyFees: "uber_taxes_third_party_fees",
  serviceFee: "uber_service_fee",
  earnings: "uber_earnings",
  totalEarnings: "uber_total_earnings",
  saveUberWeeklyBtn: "save_uber_weekly",
  weeklyHistory: "uber_weekly_history"
};

const LITRES_PER_UK_GALLON = 4.546;
const UBER_WEEKLY_STORAGE_KEY = "uberEngineUberWeeklyStatements";
const SIMPLIFIED_CAR_MILE_RATE = 0.25;
const SIMPLIFIED_CAR_MILE_RATE_AFTER_THRESHOLD = 0.25;
const SIMPLIFIED_CAR_MILE_THRESHOLD = 0;

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

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function taxYearStartForDate(dateIso) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const taxYearStartYear = month > 4 || (month === 4 && day >= 6)
    ? year
    : year - 1;

  return `${taxYearStartYear}-04-06`;
}

function taxYearKeyForDate(dateIso) {
  return taxYearStartForDate(dateIso).slice(0, 4);
}

function calculateMileageClaimForMonth(days, monthStart, monthEnd) {
  const milesByTaxYear = new Map();
  const milesBeforeMonthByTaxYear = new Map();
  let mileageExpense = 0;
  let monthMiles = 0;

  const sortedDays = [...days]
    .filter((day) => day.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  sortedDays.forEach((day) => {
    const date = String(day.date);
    const miles = Number(day.business_miles || 0);
    const taxYearKey = taxYearKeyForDate(date);
    const milesBefore = milesByTaxYear.get(taxYearKey) || 0;
    const isInSelectedMonth = date >= monthStart && date <= monthEnd;

    if (date < monthStart) {
      milesBeforeMonthByTaxYear.set(taxYearKey, milesBefore + miles);
    }

    if (isInSelectedMonth) {
      const highRateMiles = Math.max(
        0,
        Math.min(miles, SIMPLIFIED_CAR_MILE_THRESHOLD - milesBefore)
      );
      const lowRateMiles = Math.max(0, miles - highRateMiles);

      mileageExpense +=
        highRateMiles * SIMPLIFIED_CAR_MILE_RATE +
        lowRateMiles * SIMPLIFIED_CAR_MILE_RATE_AFTER_THRESHOLD;
      monthMiles += miles;
    }

    milesByTaxYear.set(taxYearKey, milesBefore + miles);
  });

  const selectedTaxYearKey = taxYearKeyForDate(monthEnd);
  const taxYearMilesBeforeMonth = milesBeforeMonthByTaxYear.get(selectedTaxYearKey) || 0;
  const taxYearMilesAfterMonth = milesByTaxYear.get(selectedTaxYearKey) || 0;

  return {
    mileageExpense,
    monthMiles,
    taxYearMilesBeforeMonth,
    taxYearMilesAfterMonth,
    mileageRate: SIMPLIFIED_CAR_MILE_RATE,
    milesUntilLowerRate: Math.max(0, SIMPLIFIED_CAR_MILE_THRESHOLD - taxYearMilesAfterMonth)
  };
}

function getLitresPerMile(mpg) {
  return LITRES_PER_UK_GALLON / mpg;
}

function normaliseUberWeeklyStatement(statement = {}) {
  const customerPayments = toNumber(statement.customerPayments);
  const tips = toNumber(statement.tips);
  const taxesThirdPartyFees = toNumber(statement.taxesThirdPartyFees);
  const serviceFee = toNumber(statement.serviceFee);
  const earnings = toNumber(statement.earnings);
  const totalEarnings = toNumber(statement.totalEarnings);
  const id = statement.id || `${statement.weekEnd || "week"}:${Date.now()}`;

  return {
    id,
    weekStart: statement.weekStart || "",
    weekEnd: statement.weekEnd || "",
    customerPayments,
    tips,
    taxesThirdPartyFees,
    serviceFee,
    earnings,
    totalEarnings,
    createdAt: statement.createdAt || new Date().toISOString(),
    updatedAt: statement.updatedAt || new Date().toISOString()
  };
}

function readUberWeeklyStatements() {
  try {
    const raw = localStorage.getItem(UBER_WEEKLY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normaliseUberWeeklyStatement)
      : [];
  } catch (error) {
    console.warn("Unable to read Uber weekly statements:", error);
    return [];
  }
}

function writeUberWeeklyStatements(statements) {
  localStorage.setItem(
    UBER_WEEKLY_STORAGE_KEY,
    JSON.stringify(statements.map(normaliseUberWeeklyStatement))
  );
}

function getUberWeeklyStatementsForMonth(monthValue) {
  const { start, end } = monthDateRange(monthValue);

  return readUberWeeklyStatements()
    .filter((statement) => statement.weekEnd >= start && statement.weekEnd <= end)
    .sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));
}

function buildUberStatementTotals(statements) {
  const totals = statements.reduce(
    (acc, statement) => {
      acc.customerPayments += statement.customerPayments;
      acc.tips += statement.tips;
      acc.taxesThirdPartyFees += statement.taxesThirdPartyFees;
      acc.serviceFee += statement.serviceFee;
      acc.earnings += statement.earnings;
      acc.totalEarnings += statement.totalEarnings;
      return acc;
    },
    {
      customerPayments: 0,
      tips: 0,
      taxesThirdPartyFees: 0,
      serviceFee: 0,
      earnings: 0,
      totalEarnings: 0
    }
  );

  totals.statementCount = statements.length;
  return totals;
}

function clearUberWeeklyForm() {
  [
    ids.weekStart,
    ids.weekEnd,
    ids.customerPayments,
    ids.tips,
    ids.taxesThirdPartyFees,
    ids.serviceFee,
    ids.earnings,
    ids.totalEarnings
  ].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });
}

function readUberWeeklyForm() {
  return normaliseUberWeeklyStatement({
    id: el(ids.weekEnd)?.value || undefined,
    weekStart: el(ids.weekStart)?.value || "",
    weekEnd: el(ids.weekEnd)?.value || "",
    customerPayments: el(ids.customerPayments)?.value,
    tips: el(ids.tips)?.value,
    taxesThirdPartyFees: el(ids.taxesThirdPartyFees)?.value,
    serviceFee: el(ids.serviceFee)?.value,
    earnings: el(ids.earnings)?.value,
    totalEarnings: el(ids.totalEarnings)?.value
  });
}

function validateUberWeeklyStatement(statement) {
  if (!statement.weekStart) return "Please enter the statement week start.";
  if (!statement.weekEnd) return "Please enter the statement week end.";
  if (statement.weekEnd < statement.weekStart) return "Week end must be after week start.";
  if (statement.totalEarnings <= 0) return "Please enter total earnings from the Uber statement.";
  return null;
}

function renderUberWeeklyHistory(statements) {
  const container = el(ids.weeklyHistory);
  if (!container) return;

  if (!statements.length) {
    container.innerHTML = `<div class="history-empty">No Uber weekly statements saved for this month.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${statements.map((statement) => `
        <div class="history-card">
          <div class="history-card__header">
            <div>
              <div class="history-card__title">
                ${escapeHtml(statement.weekStart)} - ${escapeHtml(statement.weekEnd)}
              </div>
            </div>
            <div class="history-card__actions">
              <div class="history-card__pill">Uber</div>
              <button
                type="button"
                class="history-card__delete"
                data-delete-uber-week="${escapeHtml(statement.id)}"
                aria-label="Delete Uber statement ending ${escapeHtml(statement.weekEnd)}"
              >
                Delete
              </button>
            </div>
          </div>

          <div class="history-card__grid history-card__grid--3x2">
            <div class="history-item">
              <span class="history-item__label">Customer</span>
              <span class="history-item__value">${formatMoney(statement.customerPayments)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Fees</span>
              <span class="history-item__value">${formatMoney(statement.serviceFee)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">3rd Party</span>
              <span class="history-item__value">${formatMoney(statement.taxesThirdPartyFees)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Earnings</span>
              <span class="history-item__value">${formatMoney(statement.earnings)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Tips</span>
              <span class="history-item__value">${formatMoney(statement.tips)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Total</span>
              <span class="history-item__value history-item__value--strong">${formatMoney(statement.totalEarnings)}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function calculateFuelCost(miles, pricePerLitre, mpg) {
  const litresPerMile = getLitresPerMile(mpg);
  return miles * litresPerMile * pricePerLitre;
}

function calculateVehicleEnergyCost(miles, pricePerLitre, settings = getSettings()) {
  const safeMiles = Number(miles || 0);

  if (getFuelType(settings) === "ev") {
    return 0;
  }

  return calculateFuelCost(safeMiles, pricePerLitre, getMpg(settings));
}

function getVehicleEnergyLabels(settings = getSettings(), fuelPrice = null) {
  if (getFuelType(settings) === "ev") {
    return {
      estimate: "Charging",
      rate: "Avg p/kWh",
      rateValue: "-",
      perMile: "Charge / Mile"
    };
  }

  const safeFuelPrice = Number.isFinite(Number(fuelPrice)) && Number(fuelPrice) > 0
    ? Number(fuelPrice)
    : getFallbackFuelPrice(settings);

  return {
    estimate: "Fuel Est.",
    rate: "Fuel Price",
    rateValue: `${formatMoney(safeFuelPrice)}/L`,
    perMile: "Fuel / Mile"
  };
}

export async function loadMonthSummary() {
  const monthValue = el(ids.picker)?.value || currentMonthValue();
  const container = el(ids.summary);
  if (!container) return null;

  const uberWeeklyStatements = getUberWeeklyStatementsForMonth(monthValue);
  const uberStatement = buildUberStatementTotals(uberWeeklyStatements);
  renderUberWeeklyHistory(uberWeeklyStatements);

  const { start, end } = monthDateRange(monthValue);
  const settings = getSettings();
  const mileageClaimStart = taxYearStartForDate(start);
  const fuelPricePromise = getFuelType(settings) === "ev"
    ? Promise.resolve(getFallbackFuelPrice(settings))
    : getRollingFuelPricePerLitre(3, getFallbackFuelPrice(settings));
  const chargingTotalsPromise = getFuelType(settings) === "ev"
    ? getChargingTotalsForRange(start, end)
    : Promise.resolve(null);

  const [daysRes, mileageDaysRes, expenseRes, fuelPrice, chargingTotals] = await Promise.all([
    supabaseClient
      .from("days")
      .select("*")
      .gte("date", start)
      .lte("date", end),

    supabaseClient
      .from("days")
      .select("date,business_miles")
      .gte("date", mileageClaimStart)
      .lte("date", end),

    supabaseClient
      .from("expenses")
      .select("date,amount")
      .gte("date", start)
      .lte("date", end),

    fuelPricePromise,
    chargingTotalsPromise
  ]);

  if (daysRes.error || mileageDaysRes.error || expenseRes.error) {
    console.error("Month summary load error:", daysRes.error || mileageDaysRes.error || expenseRes.error);
    container.innerHTML = `<div class="error-state">Unable to load month summary.</div>`;
    showStatus("Unable to load month summary.", "error", false);
    return null;
  }

  const days = daysRes.data || [];
  const mileageDays = mileageDaysRes.data || [];
  const expenses = expenseRes.data || [];

  const totalIncome = days.reduce((sum, d) => sum + Number(d.gross || 0), 0);
  const totalTrips = days.reduce((sum, d) => sum + Number(d.trips || 0), 0);
  const totalMiles = days.reduce((sum, d) => sum + Number(d.business_miles || 0), 0);
  const totalHours = days.reduce((sum, d) => sum + Number(d.hours_worked || 0), 0);

  const sessionsWorked = days.length;
  const distinctDatesWorked = new Set(days.map(d => d.date)).size;

  const totalFuel = getFuelType(settings) === "ev"
    ? Number(chargingTotals?.cost || 0)
    : calculateVehicleEnergyCost(totalMiles, fuelPrice, settings);
  const vehicleEnergyLabels = getVehicleEnergyLabels(settings, fuelPrice);
  if (getFuelType(settings) === "ev") {
    vehicleEnergyLabels.rateValue = `${formatNumber(chargingTotals?.averagePencePerKwh || 0, 1)}p`;
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalTax = totalIncome * getTaxRate(settings);
  const totalInsurance = Number(settings.insuranceMonthly || 0);
  const uberTotalEarnings = uberStatement.totalEarnings;
  const incomeBase = uberTotalEarnings > 0 ? uberTotalEarnings : totalIncome;
  const totalCosts = totalExpenses + totalInsurance;
  const vehicleExpenseMethod = getVehicleExpenseMethod(settings);
  const mileageClaim = calculateMileageClaimForMonth(mileageDays, start, end);

  const totalTrueRetained =
    incomeBase -
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
    totalKwh: chargingTotals?.kwh || 0,
    averagePencePerKwh: chargingTotals?.averagePencePerKwh || 0,
    homeChargingCost: chargingTotals?.homeCost || 0,
    publicChargingCost: chargingTotals?.publicCost || 0,
    superchargerCost: chargingTotals?.superchargerCost || 0,
    homeChargingPercent: chargingTotals?.homePercent || 0,
    publicChargingPercent: chargingTotals?.publicPercent || 0,
    superchargerPercent: chargingTotals?.superchargerPercent || 0,
    totalExpenses,
    totalCosts,
    totalTax,
    totalInsurance,
    mileageExpense: mileageClaim.mileageExpense,
    mileageRate: mileageClaim.mileageRate,
    taxYearMilesBeforeMonth: mileageClaim.taxYearMilesBeforeMonth,
    taxYearMilesAfterMonth: mileageClaim.taxYearMilesAfterMonth,
    milesUntilLowerRate: mileageClaim.milesUntilLowerRate,
    totalTrueRetained,
    incomeBase,
    vehicleExpenseMethod,
    uberStatement,
    uberWeeklyStatements,
    avgPerTrip: totalTrips > 0 ? totalIncome / totalTrips : 0,
    avgPerMile: totalMiles > 0 ? totalIncome / totalMiles : 0,
    avgPerWorkedDay: distinctDatesWorked > 0 ? totalIncome / distinctDatesWorked : 0,
    avgPerHour: totalHours > 0 ? totalIncome / totalHours : 0
  };

  const retainedPct = pct(summary.totalTrueRetained, summary.totalIncome);

  container.innerHTML = `
    <div class="month-dashboard">
      <section class="month-section month-section--net">
        <div class="month-section__header">
          <h4>Net Income</h4>
          <span>${formatNumber(pct(summary.totalTrueRetained, summary.incomeBase), 0)}% retained</span>
        </div>

        <div class="month-section-grid">
          <div class="summary-card summary-card--primary">
            <div class="summary-label">Uber Total</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.totalEarnings)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Costs</div>
            <div class="summary-value">${formatMoney(summary.totalCosts)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">${vehicleEnergyLabels.estimate}</div>
            <div class="summary-value">${formatMoney(summary.totalFuel)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Tax Est.</div>
            <div class="summary-value">${formatMoney(summary.totalTax)}</div>
          </div>
          <div class="summary-card summary-card--retained">
            <div class="summary-label">Net Retained</div>
            <div class="summary-value">${formatMoney(summary.totalTrueRetained)}</div>
          </div>
        </div>
      </section>

      <section class="month-section">
        <div class="month-section__header">
          <h4>Tax Summary</h4>
          <span>${formatInt(summary.uberStatement.statementCount)} statements</span>
        </div>

        <div class="month-section-grid">
          <div class="summary-card">
            <div class="summary-label">Customer Payments</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.customerPayments)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Taxes & Fees</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.taxesThirdPartyFees)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Uber Service Fee</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.serviceFee)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Earnings</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.earnings)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Tips</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.tips)}</div>
          </div>
          <div class="summary-card summary-card--primary">
            <div class="summary-label">Total Earnings</div>
            <div class="summary-value">${formatMoney(summary.uberStatement.totalEarnings)}</div>
          </div>
        </div>
      </section>

      <section class="month-section">
        <div class="month-section__header">
          <h4>Performance</h4>
          <span>${formatMoney(summary.totalIncome - summary.uberStatement.totalEarnings)} log diff</span>
        </div>

        <div class="month-section-grid">
          <div class="summary-card">
            <div class="summary-label">Sessions</div>
            <div class="summary-value">${formatInt(summary.sessionsWorked)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Hours</div>
            <div class="summary-value">${formatClockHours(summary.totalHours)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Per Hour</div>
            <div class="summary-value">${formatMoney(summary.avgPerHour)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Miles</div>
            <div class="summary-value">${formatNumber(summary.totalMiles, 0)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">${vehicleEnergyLabels.rate}</div>
            <div class="summary-value">${vehicleEnergyLabels.rateValue}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">${vehicleEnergyLabels.perMile}</div>
            <div class="summary-value">${formatMoney(summary.totalMiles > 0 ? summary.totalFuel / summary.totalMiles : 0)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Mileage Claim</div>
            <div class="summary-value">${formatMoney(summary.mileageExpense)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Mileage Rate</div>
            <div class="summary-value">${formatMoney(summary.mileageRate)}/mi</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Vehicle Method</div>
            <div class="summary-value">${summary.vehicleExpenseMethod === "actual" ? "Actual" : "Mileage"}</div>
          </div>
        </div>
      </section>
      ${getFuelType(settings) === "ev" ? `
        <section class="month-section">
          <div class="month-section__header">
            <h4>Charging Sources</h4>
            <span>${formatNumber(summary.totalKwh, 1)} kWh</span>
          </div>

          <div class="month-section-grid">
            <div class="summary-card summary-card--primary">
              <div class="summary-label">Total kWh</div>
              <div class="summary-value">${formatNumber(summary.totalKwh, 1)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Home</div>
              <div class="summary-value">${formatMoney(summary.homeChargingCost)}</div>
              <div class="summary-sub">${formatNumber(summary.homeChargingPercent, 0)}%</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Public</div>
              <div class="summary-value">${formatMoney(summary.publicChargingCost)}</div>
              <div class="summary-sub">${formatNumber(summary.publicChargingPercent, 0)}%</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Supercharger</div>
              <div class="summary-value">${formatMoney(summary.superchargerCost)}</div>
              <div class="summary-sub">${formatNumber(summary.superchargerPercent, 0)}%</div>
            </div>
          </div>
        </section>
      ` : ""}
    </div>
  `;

  return summary;
}

async function handleSaveUberWeekly() {
  const statement = readUberWeeklyForm();
  const validationError = validateUberWeeklyStatement(statement);

  if (validationError) {
    showStatus(validationError, "error");
    return;
  }

  const statements = readUberWeeklyStatements();
  const existingIndex = statements.findIndex((item) => item.id === statement.id);

  if (existingIndex >= 0) {
    statements[existingIndex] = {
      ...statements[existingIndex],
      ...statement,
      createdAt: statements[existingIndex].createdAt,
      updatedAt: new Date().toISOString()
    };
  } else {
    statements.push(statement);
  }

  writeUberWeeklyStatements(statements);
  clearUberWeeklyForm();
  showStatus("Uber weekly statement saved.", "success");
  await loadMonthSummary();
}

async function deleteUberWeeklyStatement(statementId) {
  const statements = readUberWeeklyStatements();
  const statement = statements.find((item) => item.id === statementId);
  const label = statement ? `${statement.weekStart} - ${statement.weekEnd}` : "this Uber statement";

  if (!window.confirm(`Delete ${label}?`)) return;

  writeUberWeeklyStatements(statements.filter((item) => item.id !== statementId));
  showStatus("Uber weekly statement deleted.", "success");
  await loadMonthSummary();
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
    showStatus(`Failed to export month summary: ${error.message}`, "error", false);
  }
}

async function handleExportMtd() {
  try {
    showStatus("Exporting MTD summary...", "info", false);
    const summary = await loadMonthSummary();

    if (!summary) {
      showStatus("No MTD summary to export.", "error");
      return;
    }

    await exportMtdSummary(summary);
    showStatus("MTD summary exported successfully.", "success");
  } catch (error) {
    console.error("Export MTD failed:", error);
    showStatus(`Failed to export MTD summary: ${error.message}`, "error", false);
  }
}

export function initMonthly() {
  const picker = el(ids.picker);
  const exportBtn = el(ids.exportBtn);
  const exportMtdBtn = el(ids.exportMtdBtn);
  const saveUberWeeklyBtn = el(ids.saveUberWeeklyBtn);

  if (picker && !picker.value) {
    picker.value = currentMonthValue();
  }

  picker?.addEventListener("change", loadMonthSummary);
  exportBtn?.addEventListener("click", handleExportMonth);
  exportMtdBtn?.addEventListener("click", handleExportMtd);
  saveUberWeeklyBtn?.addEventListener("click", handleSaveUberWeekly);
  el(ids.weeklyHistory)?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-uber-week]");
    if (!button) return;

    await deleteUberWeeklyStatement(button.dataset.deleteUberWeek);
  });
  window.addEventListener(SETTINGS_UPDATED_EVENT, loadMonthSummary);

  loadMonthSummary();
}
