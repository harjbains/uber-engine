import { supabaseClient } from "./supabase.js";

/* ================= INIT ================= */

export function initMonthly() {
  const picker = document.getElementById("month_picker");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

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

  const yyyyMm =
    forceYm ||
    picker?.value ||
    (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();

  if (!yyyyMm) {
    console.error("No month available");
    return;
  }

  const { startDate, nextDate } = monthRange(yyyyMm);

  console.log("Month range:", startDate, nextDate);

  /* -------- SHIFTS -------- */
  const { data: shifts, error: shiftsErr } = await supabaseClient
    .from("shifts")
    .select("id,date,gross,tips,odo_start,odo_end")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (shiftsErr) {
    console.error(shiftsErr);
    return renderMonthlyError("Error loading shifts");
  }

  console.log("SHIFTS:", shifts);

  /* -------- FUEL -------- */
  const { data: fuelLogs, error: fuelErr } = await supabaseClient
    .from("fuel_logs")
    .select("id,date,cost")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (fuelErr) {
    console.error(fuelErr);
    return renderMonthlyError("Error loading fuel");
  }

  /* -------- EXPENSES -------- */
  const { data: expenses, error: expErr } = await supabaseClient
    .from("expenses")
    .select("id,date,amount")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (expErr) {
    console.error(expErr);
    return renderMonthlyError("Error loading expenses");
  }

  /* -------- AGGREGATION -------- */

  const shiftCount = shifts?.length || 0;

  const grossTotal = sumNum(shifts || [], "gross");
  const tipsTotal = sumNum(shifts || [], "tips");
  const incomeTotal = grossTotal + tipsTotal;

  const milesTotal = (shifts || []).reduce((acc, s) => {
    const a = Number(s.odo_start);
    const b = Number(s.odo_end);
    return Number.isFinite(a) && Number.isFinite(b) && b >= a
      ? acc + (b - a)
      : acc;
  }, 0);

  const fuelTotal = sumNum(fuelLogs || [], "cost");
  const expenseTotal = sumNum(expenses || [], "amount");

  const profit = incomeTotal - fuelTotal - expenseTotal;

  const incomePerMile = safeDiv(incomeTotal, milesTotal);

  /* -------- TAX YEAR -------- */

  const monthStart = new Date(startDate + "T00:00:00Z");
  const taxYearStart = taxYearStartForUK(monthStart);
  const taxYearStartStr = taxYearStart.toISOString().slice(0, 10);

  const { data: priorShifts } = await supabaseClient
    .from("shifts")
    .select("odo_start,odo_end,date")
    .gte("date", taxYearStartStr)
    .lt("date", startDate);

  const milesBeforeThisMonth = (priorShifts || []).reduce((acc, s) => {
    const a = Number(s.odo_start);
    const b = Number(s.odo_end);
    return Number.isFinite(a) && Number.isFinite(b) && b >= a
      ? acc + (b - a)
      : acc;
  }, 0);

  const hmrcAllowance = hmrcMileageAllowance(milesTotal, milesBeforeThisMonth);

  const totalYtdMiles = milesBeforeThisMonth + milesTotal;

  let hmrcLabel = "HMRC Allowance (45p)";

  if (totalYtdMiles > 10000 && milesBeforeThisMonth >= 10000) {
    hmrcLabel = "HMRC Allowance (25p)";
  } else if (totalYtdMiles > 10000) {
    hmrcLabel = "HMRC Allowance (45p & 25p)";
  }

  const taxableProfit = Math.max(0, incomeTotal - hmrcAllowance);
  const tax = taxableProfit * 0.2;

  const takeHome = profit - tax;

  /* -------- RENDER -------- */

  renderMonthlySummary({
    shiftCount,
    incomeTotal,
    milesTotal,
    incomePerMile,
    fuelTotal,
    expenseTotal,
    profit,
    hmrcAllowance,
    hmrcLabel,
    taxableProfit,
    tax,
    takeHome
  });
}

/* ================= RENDER ================= */

function renderMonthlySummary(m) {
  const el = document.getElementById("month_summary");
  if (!el) return;

  el.innerHTML =
    '<div class="summary-section">' +
      '<h3>Performance</h3>' +
      '<div class="summary-grid">' +

        summaryItem("Shifts", m.shiftCount) +
        summaryItem("Total Income", money(m.incomeTotal)) +
        summaryItem("Miles", Number(m.milesTotal || 0).toFixed(0)) +
        summaryItem("£/mile", "£" + Number(m.incomePerMile || 0).toFixed(2)) +
        summaryItem("Fuel Cost", money(m.fuelTotal)) +
        summaryItem("Expenses", money(m.expenseTotal)) +

        summaryItemHighlight("Gross Profit", money(m.profit)) +
        summaryItemTax("Estimated Tax (20%)", money(m.tax)) +
        summaryItemNet("Net Pay", money(m.takeHome)) +

      '</div>' +
    '</div>';
}

function renderMonthlyError(msg) {
  const el = document.getElementById("month_summary");
  if (el) el.innerHTML = "<div>" + msg + "</div>";
}

/* ================= HELPERS ================= */

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

function safeDiv(a, b) {
  return b > 0 ? a / b : 0;
}

function money(n) {
  return "£" + (Number(n) || 0).toFixed(2);
}

function taxYearStartForUK(dateObj) {
  const y = dateObj.getUTCFullYear();
  const start = new Date(Date.UTC(y, 3, 6));
  return dateObj >= start ? start : new Date(Date.UTC(y - 1, 3, 6));
}

function hmrcMileageAllowance(milesThisMonth, milesBeforeThisMonth) {
  const remaining = Math.max(0, 10000 - milesBeforeThisMonth);
  const at45 = Math.min(milesThisMonth, remaining);
  const at25 = Math.max(0, milesThisMonth - at45);
  return at45 * 0.45 + at25 * 0.25;
}

function summaryItem(label, value) {
  return `<div class="summary-card"><span>${label}</span><span>${value}</span></div>`;
}

function summaryItemHighlight(label, value) {
  return `<div class="summary-card highlight"><span>${label}</span><span>${value}</span></div>`;
}

function summaryItemTax(label, value) {
  return `<div class="summary-card tax"><span>${label}</span><span>${value}</span></div>`;
}

function summaryItemNet(label, value) {
  return `<div class="summary-card net"><span>${label}</span><span>${value}</span></div>`;
}