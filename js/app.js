// ================================
// VERSION
// ================================

import { initMonthly } from "./monthly.js";
initMonthly();

const APP_VERSION = "v1.1.0";
const APP_CHANGELOG = "Performance ready build";

const versionElement = document.getElementById("version-number");

if (versionElement) {
  versionElement.textContent = APP_VERSION + " – " + APP_CHANGELOG;
}



// ================================
// DATE
// ================================

function formatUKDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

const now = new Date();
const today = now.toISOString().split("T")[0];

// ================================
// SET DEFAULT DATES
// ================================

function setDefaultDates() {

  const shiftDate = el("shift_date");
  const fuelDate = el("fuel_date");
  const expenseDate = el("expense-date");

  if (shiftDate) shiftDate.value = today;
  if (fuelDate) fuelDate.value = today;
  if (expenseDate) expenseDate.value = today;

}

setDefaultDates();





function el(id) {
  return document.getElementById(id);
}


// ================================
// TAB SWITCHING
// ================================

document.querySelectorAll(".tab-button").forEach(btn => {

  btn.addEventListener("click", () => {

    document.querySelectorAll(".tab-content").forEach(tab => {
      tab.classList.remove("active");
    });

    document.querySelectorAll(".tab-button").forEach(b => {
      b.classList.remove("active");
    });

    const target = el(btn.dataset.tab);

    if (target) {
      target.classList.add("active");
      btn.classList.add("active");
    }

  });

});


// ================================
// TIME SELECTORS
// ================================

function populateTimeSelectors() {

  const hourSelectors = ["start_hour", "end_hour"];
  const minuteSelectors = ["start_min", "end_min"];

  hourSelectors.forEach(id => {

    const select = el(id);
    if (!select) return;

    select.innerHTML = "";

    for (let h = 0; h < 24; h++) {

      const hour = String(h).padStart(2, "0");

      const option = document.createElement("option");
      option.value = hour;
      option.textContent = hour;

      select.appendChild(option);

    }

  });

  minuteSelectors.forEach(id => {

    const select = el(id);
    if (!select) return;

    select.innerHTML = "";

    for (let m = 0; m < 60; m += 5) {

      const minute = String(m).padStart(2, "0");

      const option = document.createElement("option");
      option.value = minute;
      option.textContent = minute;

      select.appendChild(option);

    }

  });

}

populateTimeSelectors();


// ================================
// SHIFT SAVE
// ================================

el("save_shift")?.addEventListener("click", async () => {

  const shift = {

    date: el("shift_date")?.value || today,

    start_time:
      el("start_hour")?.value +
      ":" +
      el("start_min")?.value,

    end_time:
      el("end_hour")?.value +
      ":" +
      el("end_min")?.value,

    odo_start: parseInt(el("odo_start")?.value) || 0,
    odo_end: parseInt(el("odo_end")?.value) || 0,

    gross: parseFloat(el("gross")?.value) || 0,
    tips: parseFloat(el("tips")?.value) || 0

  };

  const { error } = await supabaseClient
    .from("shifts")
    .insert([shift]);

  if (error) {
    console.error("Shift save error:", error);
    return;
  }

  loadShiftHistory();

});


// ================================
// SHIFT HISTORY
// ================================

async function loadShiftHistory() {
  const { data, error } = await supabaseClient
    .from("shifts")
    .select("*")
    .order("date", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    return;
  }

  const container = el("shiftListShiftTab");
  if (!container) return;

  container.innerHTML = "";

  data.forEach(shift => {
    // Convert yyyy-mm-dd to dd-mm-yyyy
    const displayDate = shift.date 
      ? shift.date.split('-').reverse().join('/') 
      : "N/A";

    const miles = (shift.odo_end && shift.odo_start) 
      ? shift.odo_end - shift.odo_start 
      : 0;
      
    const gross = Number(shift.gross || 0) + Number(shift.tips || 0);

    const div = document.createElement("div");

    div.innerHTML = `
      <p>
        ${displayDate} | 
        ${shift.start_time} - ${shift.end_time} | 
        ${miles} miles | 
        £${gross.toFixed(2)}
      </p>
    `;

    container.appendChild(div);
  });
}

loadShiftHistory();


// ================================
// SAVE FUEL
// ================================

el("save_fuel")?.addEventListener("click", async () => {

  const fuelEntry = {

    date: el("fuel_date")?.value || today,
    station: el("fuel_station")?.value || null,

    litres: parseFloat(el("fuel_litres")?.value) || 0,
    cost: parseFloat(el("fuel_cost")?.value) || 0,
    miles: parseInt(el("fuel_miles")?.value) || 0

  };

  const { error } = await supabaseClient
    .from("fuel_logs")
    .insert([fuelEntry]);

  if (error) {
    console.error("Fuel save error:", error);
    return;
  }

  loadFuelHistory();

});


// ================================
// FUEL HISTORY
// ================================

async function loadFuelHistory() {

  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("date", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    return;
  }

  const container = el("fuel_history");
  if (!container) return;

  container.innerHTML = "";

  data.forEach(fuel => {

    const station =
      fuel.station ||
      fuel.station_name ||
      "Unknown";

    const cost =
      fuel.cost ??
      fuel.total_cost ??
      0;

    const litres =
      fuel.litres ??
      0;

    const miles =
      fuel.miles ??
      fuel.odometer ??
      0;

    const div = document.createElement("div");

    // Convert yyyy-mm-dd to dd-mm-yyyy
    const fuelDate = fuel.date 
      ? fuel.date.split('-').reverse().join('/') 
      : "N/A";

    div.innerHTML = `
      <p>
        ${fuelDate} |
        ${station} |
        £${Number(cost).toFixed(2)} |
        ${litres} L |
        ${miles} mi
      </p>
    `;

    container.appendChild(div);

  });

}

loadFuelHistory();

// ================================
// EXPENSE CATEGORIES
// ================================

async function loadExpenseCategories() {

  const { data, error } = await supabaseClient
    .from("expense_categories")
    .select("*")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("Category load error:", error);
    return;
  }

  const select = el("expense-category");

  if (!select) return;

  select.innerHTML = "";

  data.forEach(cat => {

    const option = document.createElement("option");

    option.value = cat.id;
    option.textContent = cat.name;

    select.appendChild(option);

  });

}

loadExpenseCategories();


// ================================
// SAVE EXPENSE
// ================================

el("save-expense")?.addEventListener("click", async () => {

  const expense = {

    date: el("expense-date")?.value || today,

    category_id: parseInt(el("expense-category")?.value),

    amount: parseFloat(el("expense-amount")?.value) || 0,

    notes: el("expense-notes")?.value || null

  };

  const { error } = await supabaseClient
    .from("expenses")
    .insert([expense]);

  if (error) {
    console.error("Expense save error:", error);
    return;
  }

  loadExpenseHistory();

});


// ================================
// EXPENSE HISTORY
// ================================

async function loadExpenseHistory() {

  const { data, error } = await supabaseClient
    .from("expenses")
    .select(`
      id,
      date,
      amount,
      notes,
      expense_categories(name)
    `)
    .order("date", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Expense history error:", error);
    return;
  }

  const container = el("expense-history");

  if (!container) return;

  container.innerHTML = "";

  data.forEach(exp => {

    const category = exp.expense_categories?.name || "Unknown";

    const div = document.createElement("div");

    // Convert yyyy-mm-dd to dd-mm-yyyy
    const expenseDate = exp.date 
      ? exp.date.split('-').reverse().join('/') 
      : "N/A";


    div.innerHTML = `
      <p>
        ${expenseDate} |
        ${category} |
        £${Number(exp.amount).toFixed(2)}
        ${exp.notes ? "| " + exp.notes : ""}
      </p>
    `;

    container.appendChild(div);

  });

}

loadExpenseHistory();

// ================================
// MONTH SUMMARY
// ================================

async function loadMonthSummary() {

  const monthInput = el("month_picker");

  if (!monthInput) return;

  const month = monthInput.value;

  if (!month) return;

  const start = month + "-01";

  const endDate = new Date(start);
  endDate.setMonth(endDate.getMonth() + 1);

  const end = endDate.toISOString().split("T")[0];


  const { data: shifts } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", start)
    .lt("date", end);


  const { data: fuel } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", start)
    .lt("date", end);


  const { data: expenses } = await supabaseClient
    .from("expenses")
    .select("*")
    .gte("date", start)
    .lt("date", end);


  const gross = shifts.reduce(
    (sum, s) => sum + Number(s.gross) + Number(s.tips || 0),
    0
  );

  const miles = shifts.reduce(
    (sum, s) => sum + (s.odo_end - s.odo_start),
    0
  );

  const fuelCost = fuel.reduce(
    (sum, f) => sum + Number(f.cost ?? f.total_cost ?? 0),
    0
  );

  const expenseCost = expenses.reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  const net = gross - fuelCost - expenseCost;


  const container = el("month_summary");

  container.innerHTML = `
    <p>Gross: £${gross.toFixed(2)}</p>
    <p>Miles: ${miles}</p>
    <p>Fuel: £${fuelCost.toFixed(2)}</p>
    <p>Expenses: £${expenseCost.toFixed(2)}</p>
    <p><strong>Net: £${net.toFixed(2)}</strong></p>
  `;

}

el("month_picker")?.addEventListener("change", loadMonthSummary);

// ================================
// DEFAULT MONTH
// ================================

const monthPicker = el("month_picker");

if (monthPicker) {

  const currentMonth =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0");

  monthPicker.value = currentMonth;

  //loadMonthSummary();

}

document
  .getElementById("export-month")
  .addEventListener("click", exportMonthData);

  async function exportMonthData() {
  const monthInput = document.querySelector('input[type="month"]').value;

  if (!monthInput) {
    alert("Please select a month first");
    return;
  }

  const startDate = `${monthInput}-01`;
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  const endDateStr = endDate.toISOString().split("T")[0];

  // FETCH DATA
  const { data: shifts } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", startDate)
    .lt("date", endDateStr);

  const { data: fuelLogs } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", startDate)
    .lt("date", endDateStr);

  const { data: expenses } = await supabaseClient
    .from("expenses")
    .select("*")
    .gte("date", startDate)
    .lt("date", endDateStr);

  // GROUP DATA BY DATE
  const dailyMap = {};

  // SHIFTS
  shifts.forEach(s => {
    const date = s.date;

    if (!dailyMap[date]) {
      dailyMap[date] = {
        miles: 0,
        gross: 0,
        fuel: 0,
        expenses: 0
      };
    }

    const miles = s.odo_end - s.odo_start;

    dailyMap[date].miles += miles;
    dailyMap[date].gross += Number(s.gross) + Number(s.tips || 0);
  });

  // FUEL
  fuelLogs.forEach(f => {
    const date = f.date;

    if (!dailyMap[date]) {
      dailyMap[date] = {
        miles: 0,
        gross: 0,
        fuel: 0,
        expenses: 0
      };
    }

    dailyMap[date].fuel += Number(f.cost);
  });

  // EXPENSES
  expenses.forEach(e => {
    const date = e.date;

    if (!dailyMap[date]) {
      dailyMap[date] = {
        miles: 0,
        gross: 0,
        fuel: 0,
        expenses: 0
      };
    }

    dailyMap[date].expenses += Number(e.amount);
  });

  // BUILD CSV
  let csv = "date,miles,gross,fuel,expenses\n";

  Object.keys(dailyMap)
    .sort()
    .forEach(date => {
      const d = dailyMap[date];

      csv += `${date},${d.miles},${d.gross.toFixed(2)},${d.fuel.toFixed(2)},${d.expenses.toFixed(2)}\n`;
    });

  // DOWNLOAD FILE
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `uber_engine_${monthInput}.csv`;
  a.click();

  window.URL.revokeObjectURL(url);
}

function formatDateToISO(dateStr) {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
}