import { supabaseClient } from "./supabase.js";

/* ================= INIT ================= */

export function initMonthly() {
  const picker = document.getElementById("month_picker");
  const currentMonth = getCurrentMonth();

  if (picker && !picker.value) {
    picker.value = currentMonth;
  }

  if (picker) {
    picker.addEventListener("change", () => loadMonthly(picker.value));
  }

  loadMonthly(picker?.value || currentMonth);
}

/* ================= LOAD ================= */

export async function loadMonthly(forceYm) {
  const picker = document.getElementById("month_picker");

  const yyyyMm = forceYm || picker?.value || getCurrentMonth();

  if (!yyyyMm) {
    console.error("No month available");
    return renderMonthlyError("No month selected");
  }

  const { startDate, nextDate } = monthRange(yyyyMm);

  /* -------- SHIFTS -------- */
  const { data: shifts, error: shiftsErr } = await supabaseClient
    .from("shifts")
    .select("id,date,gross,tips,odo_start,odo_end")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (shiftsErr) {
    console.error("Error loading shifts:", shiftsErr);
    return renderMonthlyError("Error loading shifts");
  }

  /* -------- FUEL -------- */
  const { data: fuelLogs, error: fuelErr } = await supabaseClient
    .from("fuel_logs")
    .select("id,date,cost")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (fuelErr) {
    console.error("Error loading fuel:", fuelErr);
    return renderMonthlyError("Error loading fuel");
  }

  /* -------- EXPENSES -------- */
  const { data: expenses, error: expErr } = await supabaseClient
    .from("expenses")
    .select("id,date,amount")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (expErr) {
    console.error("Error loading expenses:", expErr);
    return renderMonthlyError("Error loading expenses");
  }

  /* -------- TAX YEAR MILEAGE -------- */
  const monthStart = new Date(`${startDate}T00:00:00Z`);
  const taxYearStart = taxYearStartForUK(monthStart);
  const taxYearStartStr = taxYearStart.toISOString().slice(0, 10);

  const { data: priorShifts, error: priorErr } = await supabaseClient
    .from("shifts")
    .select("odo_start,odo_end,date")
    .gte("date", taxYearStartStr)
    .lt("date", startDate);

  if (priorErr) {
    console.error("Error loading prior tax year mileage:", priorErr);
    return renderMonthlyError("Error loading prior mileage");
  }

  /* -------- AGGREGATION -------- */

  const shiftCount = shifts?.length || 0;

  const grossTotal = sumNum(shifts || [], "gross");
  const tipsTotal = sumNum(shifts || [], "tips");
  const incomeTotal = grossTotal + tipsTotal;

  const milesTotal = sumShiftMiles(shifts || []);
  const milesBeforeThisMonth = sumShiftMiles(priorShifts || []);
  const totalYtdMiles = milesBeforeThisMonth + milesTotal;

  const fuelTotal = sumNum(fuelLogs || [], "cost");
  const expenseTotal = sumNum(expenses || [], "amount");

  // Operational performance
  const grossProfit = incomeTotal - fuelTotal - expenseTotal;
  const incomePerMile = safeDiv(incomeTotal, milesTotal);

  // Tax set-aside basis using stepped HMRC mileage rates
  const mileageBreakdown = hmrcMileageBreakdown(milesTotal, milesBeforeThisMonth);
  const hmrcAllowance = mileageBreakdown.allowance;
  const hmrcRateLabel = mileageBreakdown.rateLabel;

  const taxableBasis = Math.max(0, incomeTotal - hmrcAllowance);
  const taxSetAside = taxableBasis * 0.2;

  // What remains after real costs and monthly tax provisioning
  const netPay = grossProfit - taxSetAside;

  /* -------- RENDER -------- */

  renderMonthlySummary({
    shiftCount,
    incomeTotal,
    milesTotal,
    totalYtdMiles,
    incomePerMile,
    fuelTotal,
    expenseTotal,
    grossProfit,
    hmrcAllowance,
    hmrcRateLabel,
    taxableBasis,
    taxSetAside,
    netPay
  });
}

/* ================= RENDER ================= */

function renderMonthlySummary(m) {
  const el = document.getElementById("month_summary");
  if (!el) return;

  el.innerHTML = `
    <div class="summary-section">
      <h3>Performance</h3>
      <div class="summary-grid">
        ${summaryItem("Shifts", m.shiftCount)}
        ${summaryItem("Total Income", money(m.incomeTotal))}
        ${summaryItem("Miles", Number(m.milesTotal || 0).toFixed(0))}
        ${summaryItem("£ / Mile", money(m.incomePerMile))}
        ${summaryItem("Fuel Cost", money(m.fuelTotal))}
        ${summaryItem("Expenses", money(m.expenseTotal))}
        ${summaryItemHighlight("Gross Profit", money(m.grossProfit))}
      </div>
    </div>

    <div class="summary-section">
      <h3>Tax Provision</h3>
      <div class="summary-grid">
        ${summaryItem("Tax Year Miles", Number(m.totalYtdMiles || 0).toFixed(0))}
        ${summaryItem("HMRC Rate", m.hmrcRateLabel)}
        ${summaryItem("HMRC Allowance", money(m.hmrcAllowance))}
        ${summaryItem("Taxable Basis", money(m.taxableBasis))}
        ${summaryItemTax("Tax Set-Aside", money(m.taxSetAside))}
        ${summaryItemNet("Net Pay", money(m.netPay))}
      </div>
    </div>
  `;
}

function renderMonthlyError(msg) {
  const el = document.getElementById("month_summary");
  if (!el) return;

  el.innerHTML = `<div class="history-empty">${msg}</div>`;
}

/* ================= HELPERS ================= */

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);

  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    nextDate: next.toISOString().slice(0, 10)
  };
}

function sumNum(rows, key) {
  return rows.reduce((acc, r) => {
    const n = Number(r[key]);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
}

function sumShiftMiles(rows) {
  return rows.reduce((acc, s) => {
    const a = Number(s.odo_start);
    const b = Number(s.odo_end);

    return Number.isFinite(a) && Number.isFinite(b) && b >= a
      ? acc + (b - a)
      : acc;
  }, 0);
}

function safeDiv(a, b) {
  return b > 0 ? a / b : 0;
}

function money(n) {
  return `£${(Number(n) || 0).toFixed(2)}`;
}

function taxYearStartForUK(dateObj) {
  const y = dateObj.getUTCFullYear();
  const start = new Date(Date.UTC(y, 3, 6));
  return dateObj >= start ? start : new Date(Date.UTC(y - 1, 3, 6));
}

function hmrcMileageBreakdown(milesThisMonth, milesBeforeThisMonth) {
  const remainingAt45p = Math.max(0, 10000 - milesBeforeThisMonth);
  const milesAt45p = Math.min(milesThisMonth, remainingAt45p);
  const milesAt25p = Math.max(0, milesThisMonth - milesAt45p);

  const allowance = (milesAt45p * 0.45) + (milesAt25p * 0.25);

  let rateLabel = "45p";
  if (milesAt45p > 0 && milesAt25p > 0) {
    rateLabel = "45p & 25p";
  } else if (milesAt25p > 0 && milesAt45p === 0) {
    rateLabel = "25p";
  }

  return {
    milesAt45p,
    milesAt25p,
    allowance,
    rateLabel
  };
}

function summaryItem(label, value) {
  return `
    <div class="summary-card">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
    </div>
  `;
}

function summaryItemHighlight(label, value) {
  return `
    <div class="summary-card highlight">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
    </div>
  `;
}

function summaryItemTax(label, value) {
  return `
    <div class="summary-card tax">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
    </div>
  `;
}

function summaryItemNet(label, value) {
  return `
    <div class="summary-card net">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
    </div>
  `;
}