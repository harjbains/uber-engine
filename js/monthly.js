import { supabaseClient } from "./supabase.js";

export function initMonthly() {
  loadMonthly();

  document.addEventListener("shiftsUpdated", () => {
    loadMonthly();
  });
}

async function loadMonthly() {

  const { data: shifts, error } = await supabaseClient
    .from("shifts")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  renderSummary(shifts || []);
  renderShiftHistory(shifts || []);
}

function renderSummary(shifts) {

  const container = document.getElementById("month_summary");
  if (!container) return;

  const totalIncome = shifts.reduce((sum, s) =>
    sum + ((s.gross || 0) + (s.tips || 0)), 0);

  container.innerHTML = `
    <div class="summary-item">
      <strong>Total Income</strong>
      <span>£${totalIncome.toFixed(2)}</span>
    </div>
  `;
}

function renderShiftHistory(shifts) {

  const monthContainer = document.getElementById("shiftList");
  const shiftTabContainer = document.getElementById("shiftListShiftTab");

  if (monthContainer) monthContainer.innerHTML = "";
  if (shiftTabContainer) shiftTabContainer.innerHTML = "";

  const todayStr = new Date().toISOString().split("T")[0];

  shifts.forEach(shift => {

const miles = (shift.odo_end || 0) - (shift.odo_start || 0);
const gross = (shift.gross || 0) + (shift.tips || 0);
const profit = gross; // until fuel linking added

const hours = calculateShiftHours(shift.start_time, shift.end_time);

const rowHTML = `
  <div class="data-grid">

    <div class="row-top">
      <span class="row-date">${formatShortDate(shift.date)}</span>
      <span class="row-total">£${profit.toFixed(2)}</span>
    </div>

    <div class="row-bottom">
      <div class="row-figures">
        ${formatTime(shift.start_time)}-${formatTime(shift.end_time)}
        <span>${miles}mi</span>
        <span>${hours}h</span>
      </div>
      <button 
  class="btn-sm delete-btn"
  data-id="${shift.id}"
  data-table="shifts">
  Del
</button>
    </div>

  </div>
`;

    // Month tab → show ALL shifts
    if (monthContainer) {
      monthContainer.insertAdjacentHTML("beforeend", rowHTML);
    }

    // Shift tab → show ONLY today's shifts
    if (shiftTabContainer && shift.date === todayStr) {
      shiftTabContainer.insertAdjacentHTML("beforeend", rowHTML);
    }

  });
}

function formatShortDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(day)} ${monthNames[month - 1]}`;
}

function calculateShiftHours(start, end) {
  if (!start || !end) return "0";

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  return ((endMinutes - startMinutes) / 60).toFixed(1);
}

function formatTime(timeStr) {
  if (!timeStr) return "--";
  return timeStr.slice(0, 5); // keeps HH:MM
}