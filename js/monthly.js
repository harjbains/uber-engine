import { supabaseClient } from "./supabase.js";

export function initMonthly() {
  const picker = document.getElementById("month_picker");

  // Default to current month (YYYY-MM)
  if (picker && !picker.value) {
    const now = new Date();
    picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const initialYm = picker?.value || (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  if (picker) {
    picker.addEventListener("change", () => loadMonthly(picker.value));
  }

  loadMonthly(initialYm);
}

async function loadMonthly(yyyyMm) {
  const { startDate, nextDate } = monthRange(yyyyMm);

  // -------- Shifts (this month) --------
  const { data: shifts, error: shiftsErr } = await supabaseClient
    .from("shifts")
    .select("id,date,gross,tips,odo_start,odo_end")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (shiftsErr) {
    console.error(shiftsErr);
    renderMonthlyError("Could not load shifts for this month.");
    return;
  }

  // -------- Fuel logs (this month) --------
  const { data: fuelLogs, error: fuelErr } = await supabaseClient
    .from("fuel_logs")
    .select("id,date,total_cost")
    .gte("date", startDate)
    .lt("date", nextDate);

  if (fuelErr) {
    console.error(fuelErr);
    renderMonthlyError("Could not load fuel logs for this month.");
    return;
  }

  // -------- Aggregate (this month) --------
  const shiftCount = shifts.length;

  const grossTotal = sumNum(shifts, "gross");
  const tipsTotal = sumNum(shifts, "tips");
  const incomeTotal = grossTotal + tipsTotal;

  const milesTotal = shifts.reduce((acc, s) => {
    const a = Number(s.odo_start);
    const b = Number(s.odo_end);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return acc + (b - a);
    return acc;
  }, 0);

  const fuelStops = fuelLogs.length;
  const fuelTotal = sumNum(fuelLogs, "total_cost");

  const profit = incomeTotal - fuelTotal;

  const incomePerMile = safeDiv(incomeTotal, milesTotal);
  const fuelPerMile = safeDiv(fuelTotal, milesTotal);

  // -------- HMRC Mileage Allowance (tax year aware) --------
  // UK tax year starts 6 April. We need miles driven earlier in the tax year BEFORE this month.
  const monthStart = new Date(`${startDate}T00:00:00Z`);
  const taxYearStart = taxYearStartForUK(monthStart);
  const taxYearStartStr = taxYearStart.toISOString().slice(0, 10);

  const { data: priorShifts, error: priorErr } = await supabaseClient
    .from("shifts")
    .select("odo_start,odo_end,date")
    .gte("date", taxYearStartStr)
    .lt("date", startDate);

  let milesBeforeThisMonth = 0;

  if (priorErr) {
    // Don’t fail the whole month dashboard; just log it.
    console.error(priorErr);
  } else if (priorShifts?.length) {
    milesBeforeThisMonth = priorShifts.reduce((acc, s) => {
      const a = Number(s.odo_start);
      const b = Number(s.odo_end);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return acc + (b - a);
      return acc;
    }, 0);
  }

  const hmrcAllowance = hmrcMileageAllowance(milesTotal, milesBeforeThisMonth);

  // Simple tax buffer for now (tune later): 25% of profit, never negative
  const taxBuffer = Math.max(0, profit * 0.25);

  renderMonthlySummary({
    yyyyMm,
    shiftCount,
    grossTotal,
    tipsTotal,
    incomeTotal,
    milesTotal,
    fuelStops,
    fuelTotal,
    profit,
    incomePerMile,
    fuelPerMile,
    hmrcAllowance,
    taxBuffer,
    milesBeforeThisMonth,
    taxYearStartStr
  });
}

function renderMonthlySummary(m) {
  const el = document.getElementById("month_summary");
  if (!el) return;

  el.innerHTML = `
    ${summaryItem("Month", m.yyyyMm)}
    ${summaryItem("Shifts", m.shiftCount)}
    ${summaryItem("Gross", money(m.grossTotal))}
    ${summaryItem("Tips", money(m.tipsTotal))}
    ${summaryItem("Total Income", money(m.incomeTotal))}
    ${summaryItem("Miles", `${Number(m.milesTotal || 0).toFixed(0)}`)}
    ${summaryItem("£/mile", `£${Number(m.incomePerMile || 0).toFixed(2)}`)}
    ${summaryItem("Fuel Stops", m.fuelStops)}
    ${summaryItem("Fuel Cost", money(m.fuelTotal))}
    ${summaryItem("Fuel £/mile", `£${Number(m.fuelPerMile || 0).toFixed(2)}`)}
    ${summaryItem("Profit", money(m.profit))}
    ${summaryItem("HMRC Allowance", money(m.hmrcAllowance))}
    ${summaryItem("Tax Buffer (25%)", money(m.taxBuffer))}
  `;
}

function renderMonthlyError(msg) {
  const el = document.getElementById("month_summary");
  if (el) el.innerHTML = `<div>${msg}</div>`;
}

function summaryItem(label, value) {
  return `
    <div class="summary-item">
      <strong>${label}</strong>
      <span>${value}</span>
    </div>
  `;
}

function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    nextDate: next.toISOString().slice(0, 10),
  };
}

function sumNum(rows, key) {
  return rows.reduce((acc, r) => {
    const n = Number(r?.[key]);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
}

function safeDiv(a, b) {
  const A = Number(a);
  const B = Number(b);
  if (!Number.isFinite(A) || !Number.isFinite(B) || B === 0) return 0;
  return A / B;
}

function money(n) {
  const x = Number(n) || 0;
  return `£${x.toFixed(2)}`;
}

function taxYearStartForUK(dateObj) {
  // UK tax year starts 6 April
  const y = dateObj.getUTCFullYear();
  const taxYearStartThisYear = new Date(Date.UTC(y, 3, 6)); // April = 3
  return dateObj >= taxYearStartThisYear
    ? taxYearStartThisYear
    : new Date(Date.UTC(y - 1, 3, 6));
}

function hmrcMileageAllowance(milesThisMonth, milesBeforeThisMonth) {
  // AMAP (cars/vans): 45p for first 10,000 miles in tax year, then 25p.
  const thisMonth = Math.max(0, Number(milesThisMonth) || 0);
  const before = Math.max(0, Number(milesBeforeThisMonth) || 0);

  const firstBandRemaining = Math.max(0, 10000 - before);

  const milesAt45 = Math.min(thisMonth, firstBandRemaining);
  const milesAt25 = Math.max(0, thisMonth - milesAt45);

  return milesAt45 * 0.45 + milesAt25 * 0.25;
}