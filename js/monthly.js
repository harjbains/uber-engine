import { supabaseClient } from "./supabase.js";

let currentMonth = new Date();

export async function initMonthly() {
  renderMonthView();
}

async function renderMonthView() {

  const monthSection = document.getElementById("month");
  if (!monthSection) return;

  monthSection.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const startStr = monthStart.toISOString().split("T")[0];
  const endStr = monthEnd.toISOString().split("T")[0];

  const { data: shifts } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", startStr)
    .lte("date", endStr)
    .order("date", { ascending: true });

  monthSection.innerHTML = `
  <div class="card">
    <div class="month-nav">
      <button id="prev-month">←</button>
      <strong>
        ${monthStart.toLocaleString("default", { month: "long" })} ${year}
      </strong>
      <button id="next-month">→</button>
    </div>
    <div id="month-shift-list"></div>
  </div>

  <div class="card" id="month-summary"></div>
`;

  renderShiftList(shifts);
  renderMonthSummary(shifts);

  document.getElementById("prev-month").onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderMonthView();
  };

  document.getElementById("next-month").onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderMonthView();
  };
}

function renderShiftList(shifts) {

  const container = document.getElementById("month-shift-list");
  if (!container) return;

  container.innerHTML = "";

  shifts?.forEach(shift => {

    const miles = shift.odo_end - shift.odo_start;
    const gross = Number(shift.gross) + Number(shift.tips || 0);

    const row = document.createElement("div");

    row.innerHTML = `
      <p>
        ${shift.date} |
        ${shift.start_time}-${shift.end_time} |
        ${miles} miles |
        £${gross.toFixed(2)}
      </p>
    `;

    container.appendChild(row);
  });
}

async function renderMonthSummary(shifts) {

  const container = document.getElementById("month-summary");
  if (!container) return;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const startStr = monthStart.toISOString().split("T")[0];
  const endStr = monthEnd.toISOString().split("T")[0];

  const { data: fuel } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", startStr)
    .lte("date", endStr);

  const totalGross = shifts?.reduce(
    (sum, s) => sum + Number(s.gross) + Number(s.tips || 0),
    0
  ) || 0;

  const totalMiles = shifts?.reduce(
    (sum, s) => {
      const start = Number(s.odo_start);
      const end = Number(s.odo_end);
      if (!start || !end || end <= start) return sum;
      return sum + (end - start);
    },
    0
  ) || 0;

  const totalFuel = fuel?.reduce(
    (sum, f) => sum + Number(f.total_cost),
    0
  ) || 0;

  const allowance = calculateAllowanceFromMiles(totalMiles);

  const taxableProfit = totalGross - allowance;
  const trueNet = (totalGross - totalFuel) - (taxableProfit * 0.15);

  container.innerHTML = `
    <p><strong>Total Gross:</strong> £${totalGross.toFixed(2)}</p>
    <p><strong>Total Miles:</strong> ${totalMiles}</p>
    <p><strong>Fuel:</strong> £${totalFuel.toFixed(2)}</p>
    <p><strong>Operational Net:</strong> £${(totalGross - totalFuel).toFixed(2)}</p>
    <hr>
    <p><strong>Mileage Allowance:</strong> £${allowance.toFixed(2)}</p>
    <p><strong>Taxable Profit:</strong> £${taxableProfit.toFixed(2)}</p>
    <p><strong>15% Allocation Target:</strong> £${(taxableProfit * 0.15).toFixed(2)}</p>
    <p class="highlight">True Retained: £${trueNet.toFixed(2)}</p>
  `;
}




async function getMonthlyData() {

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().split("T")[0];

  const { data: shifts } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", monthStartStr);

  const { data: fuel } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", monthStartStr);

  const gross = shifts?.reduce(
    (sum, s) => sum + Number(s.gross) + Number(s.tips || 0),
    0
  ) || 0;

  const miles = shifts?.reduce(
    (sum, s) => {
      const start = Number(s.odo_start);
      const end = Number(s.odo_end);
      if (!start || !end || end <= start) return sum;
      return sum + (end - start);
    },
    0
  ) || 0;

  const fuelTotal = fuel?.reduce(
    (sum, f) => sum + Number(f.total_cost),
    0
  ) || 0;

  const allowance = calculateAllowanceFromMiles(miles);

  return {
    gross,
    miles,
    fuel: fuelTotal,
    taxable: gross - allowance
  };
}

async function getTaxYearData() {

  const taxYearStart = getTaxYearStart();
  const taxYearStartStr = taxYearStart.toISOString().split("T")[0];

  const { data: shifts } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", taxYearStartStr)
    .order("date", { ascending: true });

  let cumulativeMiles = 0;
  let totalAllowance = 0;
  let gross = 0;

  shifts?.forEach(shift => {

    const start = Number(shift.odo_start);
    const end = Number(shift.odo_end);
    if (!start || !end || end <= start) return;

    const miles = end - start;

    gross += Number(shift.gross) + Number(shift.tips || 0);

    let allowance = 0;

    if (cumulativeMiles < 10000) {

      const remaining = 10000 - cumulativeMiles;
      const at45 = Math.min(miles, remaining);
      const at25 = miles - at45;

      allowance = (at45 * 0.45) + (at25 * 0.25);

    } else {

      allowance = miles * 0.25;
    }

    cumulativeMiles += miles;
    totalAllowance += allowance;
  });

  return {
    gross,
    miles: cumulativeMiles,
    allowance: totalAllowance,
    taxable: gross - totalAllowance
  };
}

async function loadMonthlyStats() {

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().split("T")[0];

  const { data: fuelData } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", monthStartStr);

  const { data: shiftData } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", monthStartStr);

  const totalFuel = fuelData?.reduce((sum, f) => sum + Number(f.total_cost), 0) || 0;

  const totalMiles = shiftData?.reduce(
    (sum, s) => sum + (s.odo_end - s.odo_start),
    0
  ) || 0;

  const totalGross = shiftData?.reduce(
    (sum, s) => sum + Number(s.gross) + Number(s.tips || 0),
    0
  ) || 0;

  const monthSection = document.getElementById("month");
monthSection.innerHTML = "";

  if (!monthSection) return;

  monthSection.innerHTML += `
    <div>
      <p>Gross: £${totalGross.toFixed(2)}</p>
      <p>Miles: ${totalMiles}</p>
      <p>Fuel: £${totalFuel.toFixed(2)}</p>
      <p>Net (before tax): £${(totalGross - totalFuel).toFixed(2)}</p>
    </div>
  `;
}



async function calculateMileageAllowance() {

  const taxYearStart = getTaxYearStart();
  const taxYearStartStr = taxYearStart.toISOString().split("T")[0];

  const { data: shiftData } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", taxYearStartStr)
    .order("date", { ascending: true });

  if (!shiftData) return;

  let cumulativeMiles = 0;
  let totalAllowance = 0;

  shiftData.forEach(shift => {

    const start = Number(shift.odo_start);
const end = Number(shift.odo_end);

if (!start || !end || end <= start) return;

const miles = end - start;

    let shiftAllowance = 0;

    if (cumulativeMiles < 10000) {

      const remainingAt45 = 10000 - cumulativeMiles;
      const milesAt45 = Math.min(miles, remainingAt45);
      const milesAt25 = miles - milesAt45;

      shiftAllowance =
        (milesAt45 * 0.45) +
        (milesAt25 * 0.25);

    } else {

      shiftAllowance = miles * 0.25;

    }

    cumulativeMiles += miles;
    totalAllowance += shiftAllowance;
  });

  const taxableProfit = totalGross - allowanceData.totalAllowance;

const taxAt15 = taxableProfit * 0.15;

monthSection.innerHTML += `
  <div>
    <p><strong>Taxable Profit:</strong> £${taxableProfit.toFixed(2)}</p>
    <p><strong>15% Allocation Target:</strong> £${taxAt15.toFixed(2)}</p>
  </div>
`;

  return {
    cumulativeMiles,
    totalAllowance
  };
}

function getTaxYearStart() {

  const now = new Date();
  const year = now.getFullYear();
  const april6 = new Date(year, 3, 6);

  return now >= april6
    ? april6
    : new Date(year - 1, 3, 6);
}

function calculateAllowanceFromMiles(miles) {

  if (miles <= 10000) {
    return miles * 0.45;
  }

  return (10000 * 0.45) + ((miles - 10000) * 0.25);
}